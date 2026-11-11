#!/usr/bin/env python3
"""Permanent, interactive frontend for the existing A5 website operator.

Only fixed GitHub read endpoints are used. No CI override, forced SHA, unattended
yes, migration, configuration rewrite or rollback bypass is exposed by the CLI.
"""
import argparse
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid

REPOSITORY = "Revty79/serrian-tide-website"
ORIGINS = {f"https://github.com/{REPOSITORY}{suffix}" for suffix in ("", ".git")} | {f"git@github.com:{REPOSITORY}{suffix}" for suffix in ("", ".git")}
WORKFLOWS = {"validate.yml": "validate", "environment-recovery.yml": "recovery", "deployment-a5.yml": "website"}
LEGACY_CONFIGURATION_BASELINE = "1d9fe69d0c2073ea5acd23408585540028928c22"
SHA = re.compile(r"[a-f0-9]{40}")


class Stopped(Exception):
    """Fixed operator messages, never raw tool/HTTP/env error bodies."""


def require(condition, message):
    if not condition:
        raise Stopped(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def private_directory(path, create=False):
    path = Path(path).absolute()
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    require(path.resolve() == path and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0, "INSTALLATION_PERMISSIONS: the updater directory must be owned by you, private and not a symlink.")
    return path


def private_json(path):
    path = Path(path)
    info = path.lstat()
    require(path.resolve() == path.absolute() and stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0 and info.st_size <= 65536, "INSTALLATION_PERMISSIONS: preserve and review the private installation file.")
    return json.loads(path.read_text(encoding="utf-8"))


class Git:
    def __init__(self, repo):
        self.repo = Path(repo).resolve()

    def run(self, *args, binary=False, optional=False):
        try:
            result = subprocess.run(["git", *args], cwd=self.repo, capture_output=True, timeout=180, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
        except (OSError, subprocess.TimeoutExpired):
            raise Stopped("GIT_UNAVAILABLE: Git could not complete; the website is unchanged.") from None
        require(optional or result.returncode == 0, "GIT_REFUSED: check repository access and local changes; nothing is reset or cleaned.")
        if optional:
            return result.returncode == 0
        return result.stdout if binary else result.stdout.decode("utf-8").strip()

    def fetch(self):
        require(self.run("branch", "--show-current") == "main", "MAIN_REQUIRED: use the existing main checkout; no branch is changed.")
        require(self.run("remote", "get-url", "origin") in ORIGINS, "ORIGIN_REFUSED: this is not the expected Serrian Tide origin.")
        require(not self.run("diff", "--name-only") and not self.run("diff", "--cached", "--name-only"), "LOCAL_CHANGES: preserve and review tracked edits before updating.")
        self.run("fetch", "--no-tags", "origin", "main")

    def ancestor(self, before, after):
        return self.run("merge-base", "--is-ancestor", before, after, optional=True)

    def blob(self, commit, name):
        require(SHA.fullmatch(commit), "RELEASE_IDENTITY: invalid release identity.")
        return self.run("show", commit + ":" + name, binary=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


class GitHub:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def get(self, relative):
        # Callers construct paths from fixed workflow names and numeric run IDs.
        require(relative.startswith("actions/") and ".." not in relative and not any(c in relative for c in "\r\n#"), "CI_REQUEST: invalid GitHub request.")
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "serrian-update/1"}
        token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(f"https://api.github.com/repos/{REPOSITORY}/" + relative, headers=headers)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
                require(len(raw) <= 8 * 1024 * 1024, "CI_RESPONSE: GitHub response exceeded the safe bound.")
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            if error.code in (401, 403, 429):
                raise Stopped("CI_UNAVAILABLE: GitHub denied access or reached its rate limit. Retry later, or configure an existing read-only GitHub credential. No update is authorized.") from None
            raise Stopped("CI_UNAVAILABLE: GitHub could not verify this release. The website is unchanged.") from None
        except (OSError, ValueError, urllib.error.URLError):
            raise Stopped("CI_UNAVAILABLE: GitHub verification failed; cached or missing results cannot authorize deployment.") from None

    def runs(self, workflow, commit=None):
        query = "branch=main&event=push&per_page=100&page=1"
        if commit:
            require(SHA.fullmatch(commit), "CI_RELEASE: invalid commit.")
            query += "&head_sha=" + commit
        payload = self.get(f"actions/workflows/{workflow}/runs?{query}")
        require(isinstance(payload.get("workflow_runs"), list), "CI_RESPONSE: workflow runs are missing.")
        return payload["workflow_runs"]

    @staticmethod
    def latest(runs, workflow):
        result = {}
        for run in runs:
            if run.get("event") != "push" or run.get("head_branch") != "main" or run.get("head_repository", {}).get("full_name") != REPOSITORY:
                continue
            if run.get("path") != ".github/workflows/" + workflow:
                continue
            commit = run.get("head_sha", "")
            require(SHA.fullmatch(commit) and isinstance(run.get("id"), int) and isinstance(run.get("run_attempt"), int), "CI_RESPONSE: malformed run identity.")
            previous = result.get(commit)
            if previous is None or (run["id"], run["run_attempt"]) > (previous["id"], previous["run_attempt"]):
                result[commit] = run
        return result

    @staticmethod
    def passed(run):
        return run is not None and run.get("status") == "completed" and run.get("conclusion") == "success"

    def recent(self):
        return {name: self.latest(self.runs(name), name) for name in WORKFLOWS}

    def verify(self, commit):
        evidence = []
        for workflow, job_name in WORKFLOWS.items():
            run = self.latest(self.runs(workflow, commit), workflow).get(commit)
            require(self.passed(run), "CI_NOT_PASSED: every required workflow must have a successful latest attempt for this exact commit.")
            payload = self.get(f"actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs?per_page=100&page=1")
            jobs = payload.get("jobs", [])
            require(isinstance(jobs, list) and 0 < len(jobs) == payload.get("total_count") <= 100, "CI_JOBS: incomplete job evidence cannot authorize deployment.")
            require(any(job.get("name") == job_name for job in jobs), "CI_JOBS: a required job is missing; review CI policy changes.")
            require(all(job.get("head_sha") == commit and job.get("run_id") == run["id"] and job.get("run_attempt") == run["run_attempt"] and job.get("status") == "completed" and job.get("conclusion") == "success" for job in jobs), "CI_JOBS: failed, skipped, cancelled or mismatched jobs cannot authorize deployment.")
            evidence.append({"workflow": workflow, "run": run["id"], "attempt": run["run_attempt"], "commit": commit})
        return evidence


def select_release(git, github):
    recent = github.recent()
    commits = git.run("rev-list", "--first-parent", "--max-count=100", "origin/main").splitlines()
    head = git.run("rev-parse", "HEAD")
    for position, commit in enumerate(commits):
        if all(github.passed(recent[name].get(commit)) for name in WORKFLOWS) and git.ancestor(head, commit):
            return commit, position
    raise Stopped("NO_ELIGIBLE_UPDATE: no forward release in the latest 100 main commits has all required CI passes. Keep the running website and retry after CI succeeds. Local commits are never reset.")


def expected_ledger(git, commit):
    journal = json.loads(git.blob(commit, "drizzle/meta/_journal.json"))
    result = []
    for index, entry in enumerate(journal["entries"]):
        require(entry["idx"] == index and re.fullmatch(r"[0-9]{4}_[A-Za-z0-9_]+", entry["tag"]), "MIGRATION_CONTRACT: invalid published migration history.")
        raw = git.blob(commit, "drizzle/" + entry["tag"] + ".sql")
        lf = raw.replace(b"\r\n", b"\n")
        result.append({"created_at": str(entry["when"]), "hashes": {digest(raw), digest(lf), digest(lf.replace(b"\n", b"\r\n"))}})
    return result


def verify_ledger(observed, expected):
    require(len(observed) == len(expected) and all(row.get("created_at") == reference["created_at"] and row.get("hash") in reference["hashes"] for row, reference in zip(observed, expected)), "MIGRATION_APPROVAL_REQUIRED: the actual database ledger does not match this release. Arrange a separately reviewed backup, restore rehearsal and migration. serrian-update never runs migrations.")


def configuration_epoch(git, commit, legacy=False):
    exists = git.run("cat-file", "-e", commit + ":ops/update-requirements.json", optional=True)
    if not exists:
        require(legacy and git.ancestor(commit, LEGACY_CONFIGURATION_BASELINE), "CONFIGURATION_APPROVAL_REQUIRED: the release has no recognized update contract.")
        return 1
    contract = json.loads(git.blob(commit, "ops/update-requirements.json"))
    require(set(contract) == {"version", "configurationEpoch"} and contract["version"] == 1 and type(contract["configurationEpoch"]) is int and contract["configurationEpoch"] >= 1, "CONFIGURATION_APPROVAL_REQUIRED: a new update contract requires review.")
    return contract["configurationEpoch"]


@contextmanager
def selected_operator(git, commit, github):
    # Execute only the exact Git operator whose CI was verified, never a mutable
    # checkout module or environment-selected executable.
    with tempfile.TemporaryDirectory(prefix="serrian-update-code-") as directory:
        source = Path(directory) / "ubuntu_deploy.py"
        source.write_bytes(git.blob(commit, "ops/ubuntu_deploy.py"))
        source.chmod(0o400)
        spec = importlib.util.spec_from_file_location("serrian_selected_operator_" + uuid.uuid4().hex, source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class VerifiedOperator(module.Operator):
            def cutover(self, host, image_id, source_hash):
                # Recheck after the build and smoke test, before stopping a writer.
                self.save("one-command-ci.json", {"checks": github.verify(commit)})
                return super().cutover(host, image_id, source_hash)

        yield VerifiedOperator(git.repo, commit), module


def deployed_commit(operator, host):
    container = host["container"]
    env = dict(item.split("=", 1) for item in container["Config"].get("Env", []) if "=" in item)
    for key, value in host["env"].items():
        require(env.get(key) == value, "CONFIGURATION_APPROVAL_REQUIRED: the protected environment differs from the running website. Review the configuration separately; no values are rewritten.")
    commit = env.get("SERRIAN_RELEASE_COMMIT", "")
    image = operator.inspect(container["Image"], image=True)
    require(SHA.fullmatch(commit) and image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == commit and container["Config"].get("Cmd") == ["node", "ops/website-start.mjs"] and container["HostConfig"].get("ReadonlyRootfs"), "BOOTSTRAP_REQUIRED: this command requires the already-bootstrapped A5 website. The existing container is preserved.")
    return commit


def update(config, github=None, confirm=input, emit=print):
    github = github or GitHub()
    git = Git(config["repo"])
    emit("Fetching main and checking exact-commit GitHub results...")
    git.fetch()
    commit, skipped = select_release(git, github)
    checks = github.verify(commit)
    if skipped:
        emit("Newer main commits do not have all required CI passes; they will not be deployed.")
    title = git.run("show", "-s", "--format=%s", commit)
    title = "".join(c for c in title if c.isprintable())[:160]
    emit("Selected " + commit + " — " + title)
    with selected_operator(git, commit, github) as (operator, module):
        try:
            host = operator.host()  # Existing, read-only A5 host approval.
            current = deployed_commit(operator, host)
            require(git.ancestor(current, commit), "DOWNGRADE_REFUSED: the running release is newer or on a different history. No downgrade is automatic.")
            verify_ledger(host["report"]["database"]["ledger"], expected_ledger(git, commit))
            require(configuration_epoch(git, current, legacy=True) == configuration_epoch(git, commit), "CONFIGURATION_APPROVAL_REQUIRED: this release changes the configuration contract. Complete a separately reviewed A5 configuration deployment first; ordinary updates can then resume.")
            if current == commit:
                _archive, source_hash = operator.expected_source()
                require(operator.checked_image(host["container"]["Image"], source_hash) == host["container"]["Image"] and operator.http_health(host["container"]["Id"], 3003), "CURRENT_HEALTH: the matching release did not pass identity/health checks.")
                emit("Already deployed and healthy. No build, restart or data change.")
                return {"passed": True, "unchanged": True, "commit": commit, "checks": checks}
            emit("Read-only preflight passed. PostgreSQL, storage, authentication and port 3003 will be preserved.")
            emit("Leave the website and tunnel running. Close pgAdmin and stop other jobs, imports, and direct database/file writers before confirming.")
            answer = confirm("Update now? [y/N]: ")
            if answer.strip().lower() not in ("y", "yes"):
                emit("Cancelled. The running website is unchanged.")
                return {"passed": True, "cancelled": True, "commit": commit}
            github.verify(commit)  # A changed/rerunning check invalidates consent.
            emit("Updating with the existing A5 build, health and rollback safeguards...")
            result = operator.deploy(host["approval"], module.FROZEN)
            emit("Update complete: " + commit + ". The previous container and image are retained.")
            return result
        except module.Refused as error:
            # Existing fixed A5 messages already redact secrets and retain details.
            raise Stopped(str(error)) from None


def main(argv=None):
    parser = argparse.ArgumentParser(description="Update the existing Serrian Tide website after exact CI and one confirmation.")
    parser.add_argument("--installation", required=True, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        require(sys.platform.startswith("linux") and os.getuid() != 0, "OWNER_REQUIRED: run serrian-update as the normal website owner, without sudo.")
        os.umask(0o077)
        configuration = Path(args.installation).absolute()
        root = private_directory(configuration.parent)
        config = private_json(configuration)
        require(config.get("version") == 1 and config.get("uid") == os.getuid() and config.get("runtimeSha256") == digest(Path(__file__).read_bytes()) and config.get("command") == "/usr/local/bin/serrian-update", "INSTALLATION_CHANGED: preserve and review this installation; no update is authorized.")
        import fcntl
        lock = root / "update.lock"
        descriptor = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Stopped("UPDATE_BUSY: another serrian-update command is active.") from None
            def confirmation(message):
                require(sys.stdin.isatty(), "INTERACTIVE_CONFIRMATION_REQUIRED: run serrian-update in your terminal; unattended approval is disabled.")
                return input(message)
            def interrupted(_signal, _frame):
                raise Stopped("INTERRUPTED: preserve the A5 recovery receipts; an in-progress cutover retains its original rollback checks.")
            signal.signal(signal.SIGINT, interrupted)
            signal.signal(signal.SIGTERM, interrupted)
            result = update(config, confirm=confirmation)
            receipt = root / ("result-" + uuid.uuid4().hex + ".json")
            with receipt.open("x", encoding="utf-8") as output:
                json.dump(result, output, indent=2)
        return 0
    except (Stopped, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, EOFError) as error:
        print(str(error) if isinstance(error, Stopped) else "UPDATE_STOPPED: preserve the running website and private A5 receipts; no secret details are printed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
