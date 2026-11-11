"""External CI-only transport/fault harness; never an updater runtime switch."""
import argparse
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import urllib.error
import urllib.request


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true"
    assert os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
    assert os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1"
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True)
    parser.add_argument("--entry", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--scenario", required=True)
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    task = Path(args.task).resolve()
    assert (task / "update-fixture-owner").read_text() == "OWNED_ONE_COMMAND_UPDATE_FIXTURE\n"
    workflows = {"validate.yml": "validate", "environment-recovery.yml": "recovery", "deployment-a5.yml": "website"}
    calls, events = {}, []
    original_open = urllib.request.OpenerDirector.open
    original_run = subprocess.run

    def transport(opener, request, *more, **kwargs):
        url = request.full_url if isinstance(request, urllib.request.Request) else request
        prefix = "https://api.github.com/repos/Revty79/serrian-tide-website/actions/"
        if not url.startswith(prefix):
            return original_open(opener, request, *more, **kwargs)
        assert request.get_method() == "GET"
        if args.scenario == "api-unavailable":
            raise urllib.error.HTTPError(url, 503, "owned synthetic outage", {}, None)
        relative = url[len(prefix):]
        if relative.startswith("workflows/"):
            workflow = relative.split("/")[1]
            assert workflow in workflows
            calls[workflow] = calls.get(workflow, 0) + 1
            failed = args.scenario == "ci-failed" or (args.scenario == "ci-after-confirm" and calls[workflow] >= 3) or (args.scenario == "ci-before-cutover" and calls[workflow] >= 4)
            record = {"id": list(workflows).index(workflow) + 100, "run_attempt": 1, "event": "push", "head_branch": "main", "head_sha": args.commit, "head_repository": {"full_name": "Revty79/serrian-tide-website"}, "path": ".github/workflows/" + workflow, "status": "completed", "conclusion": "failure" if failed else "success"}
            payload = {"workflow_runs": [record]}
        else:
            identity = int(relative.split("/")[1])
            workflow = list(workflows)[identity - 100]
            payload = {"total_count": 1, "jobs": [{"name": workflows[workflow], "head_sha": args.commit, "run_id": identity, "run_attempt": 1, "status": "completed", "conclusion": "success"}]}
        return io.BytesIO(json.dumps(payload).encode())

    def commands(command, *more, **kwargs):
        if command and command[0] == "docker":
            events.append(command[1:3] if command[1] == "buildx" else command[1:2])
            if args.scenario == "startup-failure" and command[1:4] == ["create", "--name", "serriantide"]:
                command = [*command[:-1], "-e", "DATABASE_URL=postgresql://inert:unused@127.0.0.1:1/unavailable", command[-1]]
        return original_run(command, *more, **kwargs)

    urllib.request.OpenerDirector.open = transport
    subprocess.run = commands
    forwarded = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
    sys.argv = [args.entry, *forwarded]
    try:
        runpy.run_path(args.entry, run_name="__main__")
    finally:
        # Counts/categories only: do not publish environment/command arguments.
        (task / ("events-" + args.scenario + ".json")).write_text(json.dumps({"api": calls, "docker": events}), encoding="utf-8")


if __name__ == "__main__":
    main()
