"""Actual isolated Ubuntu installer, GHCR/provenance, application and timing test.

This workflow cannot be completed while testing itself: only its final run/job
status is supplied by an external fixture before publication. Original three CI
checks, registry bytes, signatures, app, PostgreSQL and filesystem are real.
--real-github repeats against completed publication with no success override.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import pty
import secrets
import select
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from ubuntu_deploy import Operator, require
from bootstrap_tls_fixture import require_fixture_listener_available
from prebuilt_release import Registry, GitHub, IMAGE, legacy
from install_serrian_prebuilt_update import download_verifier
from a5_fixture_baseline import BASELINE



def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1", "OWNED_HOSTED_CI_REQUIRED")
    os.umask(0o077)
    # Hosted runners have an intentionally writable /usr/local/bin. Exercise
    # the production refusal, then prepare only this owned fixture directory.
    from integration_update_launcher import main as launcher_fixture
    launcher_fixture()
    repo = Path.cwd()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    real = "--real-github" in sys.argv
    publication = GitHub().publication(commit) if real else {"run": int(os.environ["GITHUB_RUN_ID"]), "attempt": int(os.environ["GITHUB_RUN_ATTEMPT"])}
    os.environ.update(SERRIAN_TEST_PUBLICATION_RUN=str(publication["run"]), SERRIAN_TEST_PUBLICATION_ATTEMPT=str(publication["attempt"]))
    task = Path(tempfile.mkdtemp(prefix="serrian-prebuilt-owned-"))
    (task / "owner").write_text("OWNED_PREBUILT_ONLY")
    verifier = task / "gh"
    verifier.write_bytes(download_verifier()["gh"])
    verifier.chmod(0o700)
    registry = Registry(verifier)
    digest = registry.resolve(commit)
    require(not os.environ.get("SERRIAN_TEST_IMAGE_DIGEST") or digest == os.environ["SERRIAN_TEST_IMAGE_DIGEST"], "CI_DIGEST_CHANGED")
    verified = registry.verify(commit, digest, publication)
    from prebuilt_release import Stopped
    try:
        registry.verify(BASELINE, digest, publication)
    except Stopped:
        pass
    else:
        raise AssertionError("Genuine signed image was accepted for a different source")
    print("PASS PREBUILT real GHCR manifest and cryptographic exact-source/run provenance", flush=True)
    baseline = Operator(repo, BASELINE)
    baseline.output = task / "old-build"
    baseline.output.mkdir(mode=0o700)
    archive, old_hash = baseline.expected_source()
    baseline.build(archive, "serriantide:" + BASELINE)
    old_image = baseline.checked_image("serriantide:" + BASELINE, old_hash)
    baseline.docker("image", "save", "--output", str(task / "old-image.tar"), "serriantide:" + BASELINE)
    # Measure the unchanged bounded builder before starting any additional
    # Docker daemons. The comparison is an independent phase; it must not
    # depend on networking state shared with the deployment/fault fixtures.
    build = Operator(repo, commit)
    build.output = task / "comparison-build"
    build.output.mkdir(mode=0o700)
    archive, source_hash = build.expected_source()
    began = time.monotonic()
    try:
        build.build(archive, "serriantide:" + commit)
    except Exception:
        # This isolated build contains only public Git sources and no env,
        # mounts, database or account arguments. Preserve diagnostic evidence
        # for the build setup itself, rather than masking a timing failure.
        failure = getattr(build, "last_failure", {})
        print("OWNED_PUBLIC_BUILD_DIAGNOSTIC " + failure.get("stderr", "")[-6000:], flush=True)
        raise
    local_build_seconds = time.monotonic() - began
    build.docker("image", "save", "--output", str(task / "comparison-image.tar"), "serriantide:" + commit)
    # A new daemon ensures the candidate is not preloaded from CI's Docker tar.
    # It shares no images/containers/socket/data-root with the primary CI daemon.
    daemon_root = task / "daemon"
    daemon_root.mkdir(mode=0o700)
    endpoint = "unix://" + str(task / "docker.sock")
    daemon_log = (task / "daemon.log").open("wb")
    daemon = subprocess.Popen(["sudo", "dockerd", "--data-root", str(daemon_root), "--exec-root", str(task / "exec"), "--host", endpoint, "--pidfile", str(task / "daemon.pid"), "--bridge=none", "--iptables=false", "--ip6tables=false", "--ip-masq=false", "--group=docker"], stdout=daemon_log, stderr=subprocess.STDOUT)
    previous_docker_host = os.environ.get("DOCKER_HOST")
    os.environ["DOCKER_HOST"] = endpoint
    op = Operator(repo, commit)
    owned_ids = set()
    metrics = {"version": 1, "source": commit, "digest": digest, "provenance": verified, "actualOwnerHostMeasured": False}
    command_path = Path("/usr/local/bin/serrian-update")
    require(not command_path.exists(), "OWNED_COMMAND_OCCUPIED")
    env_file = repo / ".env.production"
    require(not env_file.exists() and not env_file.is_symlink(), "OWNED_ENV_OCCUPIED")
    require_fixture_listener_available(3003)
    package = Path.home() / ".local/share/serrian-update/prebuilt" / commit
    old_package = Path.home() / ".local/share/serrian-update" / commit
    def say(message):
        print("PASS PREBUILT " + message, flush=True)

    def invoke(entry, arguments, scenario, answer=None, original=False):
        master, slave = pty.openpty()
        direct = original or (real and scenario in ("install", "install-repeat", "success", "repeat"))
        args = [sys.executable, "-I", "-B", str(entry), *arguments] if direct else [sys.executable, "-B", "ops/prebuilt_fixture_driver.py", "--task", str(task), "--entry", str(entry), "--scenario", scenario, "--commit", commit, *( ["--real-github"] if real else []), "--", *arguments]
        if real and scenario in ("success", "repeat"):
            args = [str(command_path)]
        started = time.monotonic()
        process = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave)
        os.close(slave)
        data, responded = bytearray(), False
        try:
            while time.monotonic() - started < 1800:
                if select.select([master], [], [], .5)[0]:
                    try:
                        chunk = os.read(master, 65536)
                    except OSError:
                        break
                    if not chunk:
                        break
                    data.extend(chunk)
                    if b"Update now? [y/N]:" in data and not responded:
                        require(answer is not None, "UNEXPECTED_CONFIRMATION")
                        os.write(master, (answer + "\n").encode())
                        responded = True
                if process.poll() is not None and not select.select([master], [], [], 0)[0]:
                    break
            else:
                process.terminate()
                raise AssertionError("Owned command timed out")
            code = process.wait(timeout=20)
        finally:
            os.close(master)
        text = data.decode(errors="replace")
        (task / (scenario + ".log")).write_text(text)
        require("postgresql://" not in text and "Synthetic-Deployment-Only-Password!" not in text, "PRIVATE_FIXTURE_LEAK")
        return code, text, time.monotonic() - started

    try:
        for _ in range(60):
            if op.docker("info", allow_failure=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise AssertionError("Owned daemon did not start")
        require(op.docker("image", "inspect", IMAGE + "@" + digest, allow_failure=True).returncode != 0, "COLD_IMAGE_ALREADY_PRESENT")
        old = Operator(repo, BASELINE)
        op.docker("image", "load", "--input", str(task / "old-image.tar"))
        require(old.checked_image("serriantide:" + BASELINE, old_hash) == old_image, "OLD_TRANSPORT_CHANGED")
        # Existing synthetic fixture and migration files are exact at both releases.
        for name in ("scripts/deployment-a5-fixture.ts", "drizzle/meta/_journal.json"):
            require(legacy.Git(repo).blob(BASELINE, name) == legacy.Git(repo).blob(commit, name), "FIXTURE_BASELINE_CHANGED")
        owned = task / "roots"
        owned.mkdir(mode=0o700)
        (owned / ".a5-fixture").write_text("OWNED_SYNTHETIC_A5_ONLY\n")
        op.docker("run", "--rm", "--network", "none", "--user", "0", "--mount", f"type=bind,src={owned},dst=/owned", old_image, "chown", "-R", "1000:1000", "/owned")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        password = secrets.token_hex(32)
        db = "prebuilt-database-" + op.run_id
        op.docker("run", "-d", "--name", db, "--network", "host", "--mount", f"type=bind,src={owned},dst=/owned", "-e", "SERRIAN_A5_OWNED_FIXTURE=1", "-e", "SERRIAN_A5_PG_PORT=" + str(port), "-e", "SERRIAN_A5_PG_PASSWORD=" + password, old_image, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts")
        owned_ids.add(op.inspect(db)["Id"])
        for _ in range(180):
            result = op.docker("exec", db, "cat", "/owned/info.json", allow_failure=True)
            if result.returncode == 0:
                info = json.loads(result.stdout)
                break
            time.sleep(1)
        else:
            raise AssertionError("Owned PostgreSQL fixture failed")
        op.docker("exec", db, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts", "--upgrade")
        settings = {"DATABASE_URL": info["databaseUrl"], "BETTER_AUTH_URL": "http://localhost:3003", "BETTER_AUTH_SECRET": secrets.token_hex(32), "BETTER_AUTH_TRUSTED_ORIGINS": "http://127.0.0.1:3003,https://synthetic-prebuilt.trycloudflare.com", "SERRIAN_TERRAIN_ROOT": "/owned/terrain", "SERRIAN_ASSET_ROOT": "/owned/artwork", "SERRIAN_RASTER_ROOT": "/owned/raster"}
        original = "".join(k + "=" + v + "\n" for k, v in settings.items()).encode()
        env_file.write_bytes(original)
        env_file.chmod(0o600)
        op.docker("create", "--name", "serriantide", "--network", "host", "--restart=no", "--read-only", "--memory", "2048m", "--memory-swap", "2048m", "--env-file", str(env_file), "-e", "PORT=3003", "-e", "SERRIAN_WEBSITE_LISTEN=127.0.0.1", "-e", "SERRIAN_RELEASE_COMMIT=" + BASELINE, "-e", "SERRIAN_EXPECTED_SOURCE_HASH=" + old_hash, "--mount", f"type=bind,src={owned},dst=/owned", "--tmpfs", "/tmp:uid=1000,gid=1000,mode=700", "--tmpfs", "/app/.next/cache:uid=1000,gid=1000,mode=700", old_image)
        old_id = op.inspect("serriantide")["Id"]
        owned_ids.add(old_id)
        op.docker("start", old_id)
        require(op.await_health(old_id, 3003), "OLD_APPLICATION_FAILED")
        # First install the unchanged original updater, then upgrade it in place.
        code, text, _ = invoke(repo / "ops/install_serrian_update.py", ["--repo", str(repo), "--commit", commit], "legacy-install", original=True)
        require(code == 0, "ORIGINAL_INSTALLER_FAILED")
        original_launcher = command_path.read_bytes()
        code, text, _ = invoke(repo / "ops/install_serrian_prebuilt_update.py", ["--repo", str(repo), "--commit", commit], "install-registry-unavailable")
        require(code != 0 and command_path.read_bytes() == original_launcher and op.inspect(old_id)["State"]["Running"], "INACCESSIBLE_REGISTRY_REPLACED_UPDATER")
        for scenario in ("install", "install-repeat"):
            code, text, _ = invoke(repo / "ops/install_serrian_prebuilt_update.py", ["--repo", str(repo), "--commit", commit], scenario)
            require(code == 0 and op.inspect(old_id)["State"]["Running"], "PREBUILT_INSTALLER_FAILED")
        require(any(p.read_bytes() == original_launcher for p in command_path.parent.glob(".serrian-update-retained-*")) and (old_package / "serrian_update.py").exists(), "OLD_UPDATER_NOT_RETAINED")
        say("real original-to-prebuilt root launcher upgrade and repeat installation preserve old package/website")
        entry = package / "serrian_prebuilt_update.py"
        arguments = ["--installation", str(package / "installation.json")]
        for scenario in ("registry-unavailable", "mismatched-image", "corrupt-signature", "interrupted-download"):
            code, text, _ = invoke(entry, arguments, scenario)
            require(code != 0 and op.inspect(old_id)["State"]["Running"] and env_file.read_bytes() == original, "UNVERIFIED_IMAGE_CHANGED_WRITER")
            events = json.loads((task / (scenario + "-events.json")).read_text())
            require(not any(e in events for e in ("stop", "rename", "buildx", "build")), "FAILED_TRANSPORT_MUTATED_SOURCE")
            if scenario == "interrupted-download":
                require("real-download-interrupted" in events and op.docker("image", "inspect", IMAGE + "@" + digest, allow_failure=True).returncode != 0, "INTERRUPTION_NOT_ACTUAL")
        say("registry outage, digest mismatch, cryptographically corrupted signature and interrupted download leave original writer unchanged")
        # Capture a real old session and complete frozen witness, without owner data.
        cookies = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(cookies))
        request = urllib.request.Request("http://127.0.0.1:3003/api/auth/sign-in/email", data=json.dumps({"email": "a5-owner@example.invalid", "password": "Synthetic-Deployment-Only-Password!"}).encode(), headers={"Content-Type": "application/json", "Origin": "http://127.0.0.1:3003"})
        require(client.open(request, timeout=20).status == 200, "FIXTURE_LOGIN_FAILED")
        session = json.load(client.open("http://127.0.0.1:3003/api/auth/get-session", timeout=20))["session"]["id"]
        old_host = old.host()
        op.docker("stop", old_id)
        witness = old.check(old_host, old_image, old_hash, frozen=True)["stateHash"]
        op.docker("start", old_id)
        require(op.await_health(old_id, 3003), "OLD_RESTART_FAILED")
        code, text, elapsed = invoke(entry, arguments, "success", "y")
        require(code == 0 and "Update complete" in text, "PREBUILT_UPDATE_FAILED")
        metrics["coldCandidateCompleteSeconds"] = elapsed
        results = [json.loads(p.read_text()) for p in package.glob("result-*.json")]
        success = next(r for r in results if not r.get("unchanged") and not r.get("cancelled"))
        require(not success["timings"]["imageAlreadyCached"] and success["timings"]["downloadSeconds"] > 0 and success["localBuild"] is False, "COLD_PULL_NOT_MEASURED")
        metrics["prebuiltTimings"] = success["timings"]
        current = op.inspect("serriantide")
        owned_ids.add(current["Id"])
        require(current["Id"] != old_id and not op.inspect(old_id)["State"]["Running"] and op.inspect(old_id)["Image"] == old_image, "PRIOR_CONTAINER_LOST")
        require(json.load(client.open("http://127.0.0.1:3003/api/auth/get-session", timeout=20))["session"]["id"] == session, "SESSION_CHANGED")
        require(any(w["id"] == info["world"] for w in json.load(client.open("http://127.0.0.1:3003/api/worlds", timeout=20))["worlds"]), "WORLD_LOST")
        op.docker("stop", current["Id"])
        require(old.check(old_host, old_image, old_hash, frozen=True)["stateHash"] == witness, "DATABASE_OR_STORAGE_CHANGED")
        op.docker("start", current["Id"])
        require(op.await_health(current["Id"], 3003), "NEW_RESTART_FAILED")
        code, text, metrics["repeatSeconds"] = invoke(entry, arguments, "repeat")
        require(code == 0 and "Already deployed and healthy" in text and op.inspect("serriantide")["Id"] == current["Id"], "REPEAT_RESTARTED")
        say("cold candidate download, full update, original DB/files/session/World and repeat no-op pass")
        # Restore only this fixture's exact old container after proven equality.
        op.docker("stop", current["Id"])
        op.docker("rename", current["Id"], "prebuilt-retained-success-" + op.run_id)
        op.docker("rename", old_id, "serriantide")
        op.docker("start", old_id)
        require(op.await_health(old_id, 3003), "FIXTURE_OLD_RESTART")
        code, text, _ = invoke(entry, arguments, "cancel", "n")
        require(code == 0 and "Cancelled" in text and op.inspect("serriantide")["Id"] == old_id, "DECLINE_CHANGED_WRITER")
        code, text, _ = invoke(entry, arguments, "startup-failure", "y")
        require(code != 0 and "DEPLOY_FAILED_ROLLED_BACK" in text and op.inspect("serriantide")["Id"] == old_id and op.inspect(old_id)["State"]["Running"], "FAILED_HEALTH_NOT_ROLLED_BACK")
        require(env_file.read_bytes() == original, "ENVIRONMENT_CHANGED")
        say("decline and actual failed startup use the original A5 frozen-state rollback and retain both images")
        # Compare complete prebuilt update with a bounded same-source build plus
        # the unchanged local updater's real preflight/cutover. All phases measured.
        metrics["sameSourceLocalBuildSeconds"] = local_build_seconds
        op.docker("image", "load", "--input", str(task / "comparison-image.tar"))
        metrics["localBuildResources"] = json.loads((build.output / "build-resources.json").read_text())
        code, text, deploy_seconds = invoke(old_package / "serrian_update.py", ["--installation", str(old_package / "installation.json")], "local-comparison", "y", original=True)
        require(code == 0 and "Update complete" in text, "LOCAL_COMPARISON_FAILED")
        local_container = op.inspect("serriantide")["Id"]
        code, text, _ = invoke(entry, arguments, "existing-local-noop")
        require(code == 0 and "Already deployed and healthy" in text and op.inspect("serriantide")["Id"] == local_container, "EXISTING_LOCAL_VERSION_REBUILT")
        metrics["localDeploymentSeconds"] = deploy_seconds
        metrics["localBuildAndDeploySeconds"] = metrics["sameSourceLocalBuildSeconds"] + deploy_seconds
        metrics["ratio"] = metrics["localBuildAndDeploySeconds"] / metrics["coldCandidateCompleteSeconds"]
        require(metrics["ratio"] > 1, "PREBUILT_NOT_FASTER: preserve timings and investigate; no performance completion claim.")
        print("PASS PREBUILT measured full update comparison " + json.dumps(metrics, sort_keys=True), flush=True)
    finally:
        # Only the new daemon is stopped. Its private data/images/receipts remain.
        if daemon.poll() is None and (task / "daemon.pid").exists():
            pid = int((task / "daemon.pid").read_text().strip())
            command = Path(f"/proc/{pid}/cmdline").read_bytes()
            require(str(daemon_root).encode() in command and b"dockerd" in command, "OWNED_DAEMON_IDENTITY_CHANGED")
            # Host-network processes belong exclusively to our new daemon.
            for identity in op.docker("ps", "-q", allow_failure=True).stdout.decode().splitlines():
                op.docker("stop", "--time", "15", identity, allow_failure=True)
            subprocess.run(["sudo", "kill", "-TERM", str(pid)], check=True)
            daemon.wait(timeout=60)
        daemon_log.close()
        if previous_docker_host is None:
            os.environ.pop("DOCKER_HOST", None)
        else:
            os.environ["DOCKER_HOST"] = previous_docker_host
        (task / "metrics.json").write_text(json.dumps(metrics, indent=2))
        for file in task.glob("*.log"):
            if file.name == "daemon.log":
                continue
            for line in file.read_text(errors="replace").splitlines():
                if line.startswith(("IMAGE_", "INSTALL_", "UPDATE_", "PRE", "COMMAND_", "CI_", "UNSAFE_")):
                    print("OWNED_PREBUILT_DIAGNOSTIC " + line[:500], flush=True)


if __name__ == "__main__":
    main()
