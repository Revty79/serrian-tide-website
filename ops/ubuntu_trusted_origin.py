#!/usr/bin/env python3
"""One-time, same-image addition of the explicitly approved Production origin.

No build, checkout update, migration, secret rotation or session reset. The
original A5 cutover, frozen-state witness and rollback implementation is reused.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import signal
import stat
import sys

# The owner block extracts this reviewed, private four-file bundle. -I ignores
# environment Python paths; only these adjacent reviewed modules are imported.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ubuntu_deploy import Operator, Refused, FROZEN, private_file, parse_env, require, sha, resource_check
from ubuntu_bootstrap import replace_configuration
from serrian_update import Git, GitHub, SHA, Stopped, deployed_commit

ORIGIN = "https://serriantide.com"
KEY = "BETTER_AUTH_TRUSTED_ORIGINS"
BUNDLE = ("ubuntu_trusted_origin.py", "ubuntu_deploy.py", "ubuntu_bootstrap.py", "serrian_update.py")
PRODUCTION = {"name": "serrian_tide_prod", "role": "serrian_tide_app", "port": 5432}


def append_origin(data):
    """Retain every existing value/comment/line ending; change only this value."""
    original = parse_env(data)
    before = original.get(KEY, "")
    if ORIGIN in [entry.strip() for entry in before.split(",")]:
        return data
    after = before + ("," if before else "") + ORIGIN
    if KEY in original:
        lines = data.splitlines(keepends=True)
        found = False
        for index, line in enumerate(lines):
            prefix = b"\xef\xbb\xbf" if index == 0 and line.startswith(b"\xef\xbb\xbf") else b""
            body = line[len(prefix):]
            if not body.startswith(KEY.encode() + b"="):
                continue
            ending = b"\r\n" if body.endswith(b"\r\n") else b"\n" if body.endswith(b"\n") else b""
            lines[index] = prefix + KEY.encode() + b"=" + after.encode("utf-8") + ending
            found = True
        require(found, "ORIGIN_CONFIG_FORMAT: the original setting could not be preserved.")
        candidate = b"".join(lines)
    else:
        ending = b"\r\n" if b"\r\n" in data else b"\n"
        candidate = data + (b"" if not data or data.endswith(b"\n") else ending) + KEY.encode() + b"=" + ORIGIN.encode() + ending
    require(parse_env(candidate) == {**original, KEY: after}, "ORIGIN_CONFIG_SCOPE: an unrelated setting changed; nothing may be activated.")
    return candidate


def runtime_environment(container, declared):
    values = dict(value.split("=", 1) for value in container["Config"].get("Env", []) if "=" in value)
    # Docker may generate this per-container identity; never ignore an explicit
    # configured HOSTNAME or any other setting.
    if "HOSTNAME" not in declared and values.get("HOSTNAME") == container["Config"].get("Hostname"):
        values.pop("HOSTNAME", None)
    return values


class OriginUpdate(Operator):
    def __init__(self, repo, tool_commit, env_file=None, expected=None):
        super().__init__(repo, tool_commit, env_file)
        self.tool_commit = tool_commit
        self.active_env_file = self.env_file
        self.expected = PRODUCTION if expected is None else expected
        self.in_cutover = False

    def authentication_check(self, image):
        self.stage = "anonymous configured-origin and CSRF checks"
        running = self.inspect("serriantide")
        configured = parse_env(self.candidate_data)
        expected = {**self.original_runtime, KEY: configured[KEY]}
        require(running["Image"] == image and runtime_environment(running, configured) == expected, "ORIGIN_RUNTIME_SCOPE: the complete runtime environment must remain exact except for the approved origin.")
        result = json.loads(self.docker("run", "--rm", "-i", "--network", "host", "--read-only", "--memory", "512m", "--memory-swap", "512m", "--env-file", str(self.env_file), image, "node", "ops/bootstrap-auth-health.mjs", "--auth-health", data=b"{}").stdout)
        require(result.get("passed") and result.get("anonymousOnly"), "ORIGIN_AUTH_HEALTH: existing/new trusted origins did not pass.")
        self.save("origin-authentication.json", {**result, "publicBrowserLoginPending": True, "actualAccountLoginVerified": False})

    def activate(self):
        replace_configuration(self.active_env_file, self.original_data, self.candidate_data, self.original_mode)

    def check(self, host, image, source_hash, frozen=False):
        if self.in_cutover:
            require(private_file(self.active_env_file) in (self.original_data, self.candidate_data), "ORIGIN_CONFIG_CHANGED: retain concurrent configuration changes and both containers.")
            require(private_file(self.candidate_env_file) == self.candidate_data, "ORIGIN_STAGED_CHANGED: staged settings changed; retain the evidence.")
        result = super().check(host, image, source_hash, frozen)
        if self.in_cutover and not frozen:
            self.authentication_check(image)
            self.activate()
            self.env_file = self.active_env_file
            self.save("origin-configuration-activated.json", {"origin": ORIGIN, "originalSha256": sha(self.original_data), "activeSha256": sha(self.candidate_data), "originalPreservedAt": str(self.output / "original.env")})
        return result

    def candidate_host(self, old):
        code = self.git("show", self.commit + ":ops/host-probe.mjs").encode()
        result = json.loads(self.docker("run", "--rm", "-i", "--entrypoint", "node", "--network", "host", "--read-only", "--memory", "512m", "--memory-swap", "512m", "--env-file", str(self.env_file), "-e", "SERRIAN_PROBE_READ_ONLY_ROOTS=1", *self.mount_args(old), old["container"]["Image"], "--max-old-space-size=256", "--input-type=module", "-", "--probe", data=code).stdout)
        require(result["database"] == old["report"]["database"] and result["roots"] == old["report"]["roots"] and result["websiteListen"] == old["report"]["listen"], "ORIGIN_TARGET_CHANGED: database, roots or listener differ.")
        expected_auth = copy.deepcopy(old["report"]["auth"])
        expected_auth["trusted"].append(ORIGIN)
        require(result["auth"] == expected_auth, "ORIGIN_AUTH_SCOPE: only the requested origin may change.")
        report = {**old["report"], "auth": result["auth"], "envSha256": sha(self.candidate_data)}
        return {**old, "env": parse_env(self.candidate_data), "report": report}

    def apply(self, confirm=input, reverify=lambda: None):
        require(os.name == "posix" and os.geteuid() != 0, "ORIGIN_OWNER: use the existing Ubuntu operator, without sudo.")
        os.umask(0o077)
        git = Git(self.repo)
        git.fetch()
        container = self.inspect("serriantide")
        values = dict(value.split("=", 1) for value in container["Config"].get("Env", []) if "=" in value)
        self.commit = values.get("SERRIAN_RELEASE_COMMIT", "")
        require(SHA.fullmatch(self.commit) and git.ancestor(self.commit, "origin/main"), "ORIGIN_RELEASE: retain and review the current managed image identity.")
        parent = Path(self.git("rev-parse", "--absolute-git-dir")) / "serrian-deployment"
        parent.mkdir(mode=0o700, exist_ok=True)
        require(not parent.is_symlink() and parent.stat().st_mode & 0o077 == 0, "DIAGNOSTICS_PRIVATE: private A5 receipts are required.")
        self.output = parent / self.run_id
        self.output.mkdir(mode=0o700)
        import fcntl
        with (parent / "lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Refused("DEPLOYMENT_BUSY: another A5 operation is active.") from None
            old = super().host()
            require(deployed_commit(self, old) == self.commit, "ORIGIN_RELEASE_CHANGED: the running release changed during preflight.")
            database = old["report"]["database"]
            require(all(database.get(key) == value for key, value in self.expected.items()) and database["host"] in ("localhost", "127.0.0.1", "::1"), "ORIGIN_DATABASE_IDENTITY: expected the explicitly selected Production database/role/port on loopback.")
            with self.daemon_lock(old["container"]["Image"]):
                self.original_data = private_file(self.active_env_file)
                require(sha(self.original_data) == old["report"]["envSha256"], "ORIGIN_CONFIG_CHANGED: protected configuration changed during preflight.")
                info = self.active_env_file.lstat()
                require(info.st_uid == os.getuid() and info.st_gid == os.getgid(), "ORIGIN_CONFIG_OWNER: preserve the existing configuration owner/group.")
                self.original_mode = stat.S_IMODE(info.st_mode)
                self.original_runtime = runtime_environment(old["container"], parse_env(self.original_data))
                self.candidate_data = append_origin(self.original_data)
                _archive, source_hash = self.expected_source()
                image = self.checked_image(old["container"]["Image"], source_hash)
                super().check(old, image, source_hash)
                require(self.http_health(old["container"]["Id"], 3003), "ORIGIN_CURRENT_HEALTH: keep the current image for review.")
                if self.candidate_data == self.original_data:
                    self.authentication_check(image)
                    result = {"passed": True, "unchanged": True, "origin": ORIGIN, "commit": self.commit, "actualAccountLoginVerified": False}
                    self.save("origin-already-configured.json", result)
                    return result
                print("Add only " + ORIGIN + " to trusted origins; keep the current image, secret, auth base, database, mounts, sessions and port 3003.", flush=True)
                print("Leave the website/tunnel running. Close pgAdmin and stop other jobs/imports/direct database or file writers before confirming.", flush=True)
                if confirm("Apply this configuration update? [y/N]: ").strip().lower() not in ("y", "yes"):
                    return {"passed": True, "cancelled": True}
                reverify()
                resource_check(old["resources"]["memoryAvailable"], old["resources"]["diskFree"], build_mib=2048)
                with (self.output / "original.env").open("xb") as stream:
                    stream.write(self.original_data)
                self.env_file = self.output / "candidate.env"
                with self.env_file.open("xb") as stream:
                    stream.write(self.candidate_data)
                self.env_file.chmod(0o400)
                self.candidate_env_file = self.env_file
                candidate = self.candidate_host(old)
                super().check(candidate, image, source_hash)
                # Re-read through the original active configuration immediately
                # before delegating the unchanged A5 cutover.
                staged = self.env_file
                self.env_file = self.active_env_file
                current = super().host()
                self.env_file = staged
                require(current["approval"] == old["approval"], "ORIGIN_HOST_CHANGED: the original host/configuration changed before cutover.")
                reverify()
                self.save("origin-plan.json", {"origin": ORIGIN, "sameImage": image, "runningCommit": self.commit, "reviewedToolCommit": self.tool_commit, "hostApproval": old["approval"], "freezeDeclaration": FROZEN, "databaseMigrated": False, "secretChanged": False})
                self.in_cutover = True
                try:
                    result = super().cutover(candidate, image, source_hash)
                except Exception:
                    proof_file = self.output / "rollback.json"
                    proof = json.loads(private_file(proof_file)) if proof_file.exists() else {}
                    if proof.get("automaticRollback") is True and proof.get("databaseAndFilesUnchanged") is True and proof.get("oldContainer") == old["container"]["Id"] and private_file(self.active_env_file) == self.candidate_data and self.inspect(old["container"]["Id"])["State"]["Running"]:
                        replace_configuration(self.active_env_file, self.candidate_data, self.original_data, self.original_mode)
                        self.save("origin-configuration-restored.json", {"originalRestored": True})
                    raise
                finally:
                    self.in_cutover = False
                require(super().host()["container"]["Image"] == image, "ORIGIN_FINAL_HOST: retain the completed operation's evidence for review.")
                result.update({"configurationOnly": True, "origin": ORIGIN, "sameImage": True, "secretChanged": False, "authBaseChanged": False, "actualAccountLoginVerified": False, "receipts": str(self.output)})
                self.save("origin-success.json", result)
                return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="/apps/serrian-tide-next")
    parser.add_argument("--tool-commit", required=True)
    args = parser.parse_args()
    try:
        git = Git(args.repo)
        git.fetch()
        require(SHA.fullmatch(args.tool_commit) and git.ancestor(args.tool_commit, "origin/main"), "ORIGIN_TOOL_RELEASE: an exact reviewed main tool commit is required.")
        for name in BUNDLE:
            require(git.blob(args.tool_commit, "ops/" + name).replace(b"\r\n", b"\n") == Path(__file__).with_name(name).read_bytes().replace(b"\r\n", b"\n"), "ORIGIN_TOOL_SOURCE: the extracted reviewed tool bundle differs.")
        github = GitHub()
        github.verify(args.tool_commit)
        def interrupted(_signal, _frame):
            raise Refused("ORIGIN_INTERRUPTED: preserve the A5 receipts; rollback still requires unchanged database/files.")
        signal.signal(signal.SIGINT, interrupted)
        signal.signal(signal.SIGTERM, interrupted)
        def confirm(message):
            require(sys.stdin.isatty(), "ORIGIN_CONFIRMATION: use the normal Ubuntu terminal.")
            return input(message)
        result = OriginUpdate(args.repo, args.tool_commit).apply(confirm, lambda: github.verify(args.tool_commit))
        print(json.dumps(result, indent=2))
        if result.get("passed") and not result.get("cancelled"):
            print("Configuration and local anonymous authentication checks passed. Public browser login is still required: sign in normally at https://serriantide.com/login; existing sessions were not reset.")
        return 0
    except (Refused, Stopped, OSError, ValueError, KeyError, TypeError, EOFError) as error:
        print(str(error) if isinstance(error, (Refused, Stopped)) else "ORIGIN_UPDATE_STOPPED: retain the current container and private A5 receipts; no secret details are printed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
