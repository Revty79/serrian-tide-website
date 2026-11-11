"""External owned-runner fault transport. Never imported by installed runtime."""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import pty
import runpy
import select
import signal
import subprocess
import sys
import time
import tempfile
import urllib.request


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1"
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True)
    parser.add_argument("--entry", required=True)
    parser.add_argument("--scenario", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--real-github", action="store_true")
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    task = Path(args.task)
    assert (task / "owner").read_text() == "OWNED_PREBUILT_ONLY"
    original_open, original_run = urllib.request.OpenerDirector.open, subprocess.run
    events = []
    run_id, attempt = int(os.environ["SERRIAN_TEST_PUBLICATION_RUN"]), int(os.environ["SERRIAN_TEST_PUBLICATION_ATTEMPT"])

    def interrupt_download(command):
        # Keep partially downloaded layers out of the later cold-candidate
        # timing. Only this fault's network transfer uses a third owned daemon;
        # the actual updater's host/preflight/writer remain on its normal daemon.
        directory = Path(tempfile.mkdtemp(prefix="interrupted-pull-", dir=task))
        root = directory / "data"
        endpoint = "unix://" + str(directory / "docker.sock")
        environment = {**os.environ, "DOCKER_HOST": endpoint}
        with (directory / "daemon.log").open("wb") as log:
            daemon = subprocess.Popen(["sudo", "dockerd", "--data-root", str(root), "--exec-root", str(directory / "exec"), "--host", endpoint, "--pidfile", str(directory / "pid"), "--bridge=none", "--iptables=false", "--ip6tables=false", "--ip-masq=false", "--group=docker"], stdout=log, stderr=subprocess.STDOUT)
            try:
                for _ in range(60):
                    if original_run(["docker", "info"], env=environment, capture_output=True).returncode == 0:
                        break
                    time.sleep(1)
                else:
                    raise AssertionError("Owned interrupted-transfer daemon failed")
                master, slave = pty.openpty()
                process = subprocess.Popen(command, env=environment, stdin=subprocess.DEVNULL, stdout=slave, stderr=slave)
                os.close(slave)
                progress, interrupted = bytearray(), False
                try:
                    deadline = time.monotonic() + 60
                    while time.monotonic() < deadline and process.poll() is None:
                        if select.select([master], [], [], .05)[0]:
                            progress.extend(os.read(master, 65536))
                            if b"Downloading" in progress:
                                process.send_signal(signal.SIGINT)
                                interrupted = True
                                events.append("real-download-interrupted")
                                break
                    if not interrupted:
                        process.terminate()
                    process.wait(timeout=30)
                finally:
                    os.close(master)
                assert interrupted, "No actual registry download was interrupted"
                return subprocess.CompletedProcess(command, 130, b"", b"owned real interrupted transfer")
            finally:
                if daemon.poll() is None and (directory / "pid").exists():
                    pid = int((directory / "pid").read_text())
                    assert str(root).encode() in Path(f"/proc/{pid}/cmdline").read_bytes()
                    original_run(["sudo", "kill", "-TERM", str(pid)], check=True)
                    daemon.wait(timeout=60)

    def transport(opener, request, *more, **kwargs):
        url = request.full_url if isinstance(request, urllib.request.Request) else request
        prefix = "https://api.github.com/repos/Revty79/serrian-tide-website/"
        if not args.real_github and url.startswith(prefix + "actions/"):
            if "actions/workflows/prebuilt-release.yml/runs?" in url:
                return io.BytesIO(json.dumps({"workflow_runs": [{"id": run_id, "run_attempt": attempt, "event": "push", "head_branch": "main", "head_sha": args.commit, "head_repository": {"full_name": "Revty79/serrian-tide-website"}, "path": ".github/workflows/prebuilt-release.yml", "status": "completed", "conclusion": "success"}]}).encode())
            if f"actions/runs/{run_id}/attempts/{attempt}/jobs?" in url:
                return io.BytesIO(json.dumps({"total_count": 1, "jobs": [{"name": "publish", "head_sha": args.commit, "run_id": run_id, "run_attempt": attempt, "status": "completed", "conclusion": "success"}]}).encode())
        response = original_open(opener, request, *more, **kwargs)
        if args.scenario == "corrupt-signature" and url.startswith(prefix + "attestations/"):
            with response:
                payload = json.load(response)
            for entry in payload.get("attestations", []):
                entry["bundle"]["dsseEnvelope"]["payload"] = base64.b64encode(b'{"subject":[]}').decode()
            return io.BytesIO(json.dumps(payload).encode())
        return response

    def commands(command, *more, **kwargs):
        if command and command[0] == "docker":
            operation = command[1]
            events.append(operation)
            assert operation not in ("build", "buildx"), "Prebuilt command attempted a local build"
            if args.scenario in ("registry-unavailable", "install-registry-unavailable") and operation == "manifest":
                return subprocess.CompletedProcess(command, 1, b"", b"owned registry outage")
            if args.scenario == "interrupted-download" and operation == "pull":
                return interrupt_download(command)
            if args.scenario == "startup-failure" and operation == "create" and "--name" in command and command[command.index("--name") + 1] == "serriantide":
                command = [*command[:-1], "-e", "DATABASE_URL=postgresql://inert:unused@127.0.0.1:1/unavailable", command[-1]]
            result = original_run(command, *more, **kwargs)
            if args.scenario == "mismatched-image" and command[1:4] == ["manifest", "inspect", "--verbose"] and result.returncode == 0:
                payload = json.loads(result.stdout)
                payload["Descriptor"]["digest"] = "sha256:" + "0" * 64
                return subprocess.CompletedProcess(command, 0, json.dumps(payload).encode(), b"")
            return result
        return original_run(command, *more, **kwargs)

    urllib.request.OpenerDirector.open, subprocess.run = transport, commands
    forwarded = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
    sys.argv = [args.entry, *forwarded]
    try:
        runpy.run_path(args.entry, run_name="__main__")
    finally:
        (task / (args.scenario + "-events.json")).write_text(json.dumps(events))


if __name__ == "__main__":
    main()
