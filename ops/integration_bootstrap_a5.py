"""Actual first-time bootstrap on an ephemeral hosted runner; never an owner daemon."""
import http.cookiejar
import json
import os
import re
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.request
from unittest.mock import patch
from ubuntu_bootstrap import Bootstrap, replace_configuration
from ubuntu_deploy import Operator, Refused, FROZEN, require


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1", "CI_OWNERSHIP_REQUIRED")
    os.umask(0o077)
    repo = Path.cwd()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    image = "serriantide:" + commit
    task = Path(tempfile.mkdtemp(prefix="serrian-bootstrap-docker-"))
    source, storage, env_file = task / "source", task / "data", task / "production.env"
    source.mkdir(mode=0o700)
    storage.mkdir(mode=0o700)
    (source / ".bootstrap-fixture").write_text("OWNED_BOOTSTRAP_FIXTURE\n")
    for kind in ("terrain", "artwork", "raster"):
        (storage / kind).mkdir(mode=0o700)
    base = Operator(repo, commit, env_file)
    require(base.docker("inspect", "serriantide", allow_failure=True).returncode != 0, "CI_SOURCE_NAME_OCCUPIED")
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        port = port_socket.getsockname()[1]
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 3003))
    password = secrets.token_hex(32)
    db_name = "serrian-bootstrap-source-" + secrets.token_hex(8)
    bystander = "serrian-bootstrap-bystander-" + secrets.token_hex(8)
    owned_ids, operators = set(), []

    def docker(*args, **kwargs):
        return base.docker(*args, **kwargs)

    def fixture(action):
        return docker("exec", db_name, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-bootstrap-fixture.ts", action)

    def op(cls=Bootstrap):
        instance = cls(repo, commit, storage, {"name": "serrian_bootstrap_fixture", "role": "postgres", "port": port}, env_file)
        operators.append(instance)
        return instance

    def refused(instance, code):
        try:
            instance.bootstrap(FROZEN)
            raise AssertionError("Unexpected bootstrap acceptance: " + code)
        except Refused as error:
            require(code in str(error), "Expected " + code + "; received " + str(error))

    def say(message):
        print("PASS BOOTSTRAP " + message, flush=True)

    old_id = None
    try:
        for directory in (source, storage):
            docker("run", "--rm", "--network", "none", "--user", "0", "--mount", f"type=bind,src={directory},dst=/owned", image, "chown", "-R", "1000:1000", "/owned")
        docker("run", "-d", "--name", db_name, "--network", "host", "--mount", f"type=bind,src={source},dst=/owned", "-e", "SERRIAN_A5_OWNED_FIXTURE=1", "-e", "SERRIAN_A5_PG_PORT=" + str(port), "-e", "SERRIAN_A5_PG_PASSWORD=" + password, image, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-bootstrap-fixture.ts")
        owned_ids.add(base.inspect(db_name)["Id"])
        for _ in range(180):
            read = docker("exec", db_name, "cat", "/owned/info.json", allow_failure=True)
            if read.returncode == 0:
                info = json.loads(read.stdout)
                break
            require(base.inspect(db_name)["State"]["Running"], "Owned bootstrap PG fixture exited")
            time.sleep(1)
        else:
            raise AssertionError("Bootstrap fixture startup timed out")
        original = "\n".join(["# Keep this protected configuration exactly", "DATABASE_URL=" + info["databaseUrl"], "BETTER_AUTH_URL=http://localhost:3003", "BETTER_AUTH_SECRET=" + secrets.token_hex(32), "BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3003,https://bootstrap-test.trycloudflare.com", "PORT=3003", ""]).encode()
        env_file.write_bytes(original)
        env_file.chmod(0o600)
        docker("run", "-d", "--name", "serriantide", "--network", "host", "--restart", "unless-stopped", "--env-file", str(env_file), image, "node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3003")
        old_id = base.inspect("serriantide")["Id"]
        owned_ids.add(old_id)
        require(base.await_health(old_id, 3003), "Actual unmounted legacy Next.js did not start")
        require(base.inspect(old_id)["Mounts"] == [], "Fixture must actually have no mounts")
        docker("run", "-d", "--name", bystander, "--network", "none", image, "node", "-e", "setInterval(()=>{},1000)")
        bystander_id = base.inspect(bystander)["Id"]
        owned_ids.add(bystander_id)
        refused(op(), "BOOTSTRAP_MIGRATION_REQUIRED")
        require(base.inspect(old_id)["State"]["Running"] and env_file.read_bytes() == original, "Missing migration disturbed source")
        say("actual 161-entry source refused before stop/configuration/build")

        fixture("--upgrade")  # Explicit CI fixture operation; bootstrap itself never migrates.
        fixture("--bad-ledger")
        refused(op(), "BOOTSTRAP_MIGRATION_HASH")
        fixture("--repair-ledger")
        say("162-entry count with an altered migration hash is refused")
        docker("run", "--rm", "--network", "none", "--mount", f"type=bind,src={storage},dst=/owned", image, "node", "-e", "require('fs').writeFileSync('/owned/terrain/fixture-only','retained')")
        refused(op(), "BOOTSTRAP_STORAGE_NOT_EMPTY")
        docker("run", "--rm", "--network", "none", "--mount", f"type=bind,src={storage},dst=/owned", image, "node", "-e", "require('fs').unlinkSync('/owned/terrain/fixture-only')")
        say("nonempty prepared storage refused without replacing or cleaning it")

        cookies = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(cookies))
        payload = json.dumps({"email": "bootstrap-owner@example.invalid", "password": "Synthetic-Bootstrap-Only-Password!"}).encode()
        request = urllib.request.Request("http://127.0.0.1:3003/api/auth/sign-in/email", data=payload, headers={"Content-Type": "application/json", "Origin": "http://localhost:3003"})
        require(client.open(request).status == 200 and len(cookies) > 0, "Original authenticated session failed")
        prior_session = json.load(client.open("http://127.0.0.1:3003/api/auth/get-session"))

        class RestoreFailure(Bootstrap):
            def recovery_helper(self, action, host, **extra):
                if action == "restore":
                    self.restore_failure_injected = True
                    raise Refused("INJECTED_INDEPENDENT_RESTORE_FAILURE")
                return super().recovery_helper(action, host, **extra)

        failed = op(RestoreFailure)
        refused(failed, "DEPLOY_FAILED_ROLLED_BACK")
        require(env_file.read_bytes() == original and base.inspect(old_id)["State"]["Running"], "Failed restore did not retain original configuration/website")
        require(not (failed.output / "bootstrap-success.json").exists(), "Incomplete recovery reported success")
        require(getattr(failed, "restore_failure_injected", False) and json.loads((failed.output / "bootstrap-backup.json").read_text())["passed"], "Restore failure must follow a real completed backup and new running restore cluster")
        say("fresh signed backup followed by failed independent restore prevents cutover and restarts exact old writer")

        class StartupFailure(Bootstrap):
            def docker(self, *args, **kwargs):
                if args and args[0] == "create" and "serriantide" in args:
                    args = (*args[:-1], "-e", "DATABASE_URL=postgresql://inert:unused@127.0.0.1:1/unavailable", args[-1])
                return super().docker(*args, **kwargs)

        failed = op(StartupFailure)
        refused(failed, "DEPLOY_FAILED_ROLLED_BACK")
        require(env_file.read_bytes() == original and base.inspect(old_id)["State"]["Running"], "Startup failure lost legacy state")
        require(json.loads((failed.output / "bootstrap-restore.json").read_text())["passed"], "Rollback test did not perform a real restore")
        say("real backup/independent restore plus failed new startup restores old container and configuration")

        def fail_after_replace(file, expected, replacement, mode):
            replace_configuration(file, expected, replacement, mode)
            if b"SERRIAN_TERRAIN_ROOT" in replacement:
                raise OSError("Injected directory-sync failure after atomic rename")

        failed = op()
        with patch("ubuntu_bootstrap.replace_configuration", side_effect=fail_after_replace):
            refused(failed, "DEPLOY_FAILED_ROLLED_BACK")
        require(env_file.read_bytes() == original and base.inspect(old_id)["State"]["Running"], "Post-rename failure did not restore configuration bytes")
        say("configuration activation failure after atomic replacement restores original bytes and old website")

        successful = op()
        result = successful.bootstrap(FROZEN)
        require(result["passed"] and result["recoveryVerified"] and result["normalUpdaterReady"], "Bootstrap result incomplete")
        new_id = base.inspect("serriantide")["Id"]
        owned_ids.add(new_id)
        require(not base.inspect(old_id)["State"]["Running"] and base.inspect(old_id)["Image"] == base.inspect(new_id)["Image"], "Previous exact fixture image/container not retained")
        require(len(base.inspect(new_id)["Mounts"]) >= 3, "Persistent mounts missing")
        require(env_file.read_bytes().startswith(original), "Existing auth/configuration bytes changed")
        continued = json.load(client.open("http://127.0.0.1:3003/api/auth/get-session"))
        require(continued["session"]["id"] == prior_session["session"]["id"] and continued["user"]["id"] == "bootstrap-owner", "Existing session/account did not survive")
        require(json.load(client.open("http://127.0.0.1:3003/api/worlds"))["worlds"] == [], "Empty World state changed")
        normal = Operator(repo, commit, env_file)
        require(normal.deploy(normal.host()["approval"], FROZEN)["unchanged"], "Normal updater cannot handle the bootstrapped deployment")
        say("complete signed recovery, real Next.js on 3003, exact existing session, three mounts, retained config/image/container and normal A5 repeat")

        # Return only this synthetic unchanged fixture to its preserved legacy shape to exercise unsafe rollback.
        docker("stop", new_id)
        docker("rename", new_id, "bootstrap-retained-success-" + successful.run_id)
        docker("rename", old_id, "serriantide")
        env_file.write_bytes(original)
        docker("start", old_id)
        require(base.await_health(old_id, 3003), "Legacy fixture restart")

        class AcceptedWriteFailure(Bootstrap):
            def await_health(self, name, port):
                ready = super().await_health(name, port)
                if name != old_id and re.fullmatch(r"[a-f0-9]{64}", name) and ready:
                    fixture("--mutate")
                    return False
                return ready

        failed = op(AcceptedWriteFailure)
        refused(failed, "UNSAFE_ROLLBACK")
        require(not base.inspect(old_id)["State"]["Running"] and env_file.read_bytes() == original, "Old writer restarted after accepted write")
        say("actual accepted database write refuses automatic rollback; both containers and candidate config remain retained")
        # Explicit fixture-only recovery after the known injected name edit; never an automatic operator action.
        docker("rename", old_id, "serriantide")
        docker("start", old_id)
        require(base.await_health(old_id, 3003), "Owned legacy fixture for data-refusal checks")
        fixture("--world")
        refused(op(), "BOOTSTRAP_EXISTING_ATLAS_DATA")
        require(base.inspect(old_id)["State"]["Running"], "Existing World stopped the source website")
        say("actual persisted World prevents empty-storage bootstrap and remains retained")
        docker("exec", "--user", "0", old_id, "node", "-e", "const f=require('fs');f.mkdirSync('/app/storage/world-terrain',{recursive:true});f.writeFileSync('/app/storage/world-terrain/owned-retained-file','retain this file')")
        refused(op(), "BOOTSTRAP_OLD_STORAGE_PRESENT")
        require(docker("exec", old_id, "cat", "/app/storage/world-terrain/owned-retained-file").stdout == b"retain this file", "Existing default-storage file changed")
        say("actual old-container storage refuses bootstrap without hiding or deleting its file")
        require(base.inspect(bystander_id)["State"]["Running"], "Unrelated service was changed")
        say("unrelated container identity and running state remain unchanged")
    except Exception:
        # Only fixed safe probe codes/stages are printed; snapshots, keys, account rows and URLs stay private.
        for instance in operators:
            if instance.output and (instance.output / "bootstrap-recovery-failure.json").exists():
                failure = json.loads((instance.output / "bootstrap-recovery-failure.json").read_text())
                print("OWNED_BOOTSTRAP_RECOVERY_FAILURE " + json.dumps(failure), flush=True)
                for diagnostic in instance.output.glob("native-pg-failure-*.json"):
                    print("OWNED_BOOTSTRAP_NATIVE_FAILURE " + diagnostic.read_text(), flush=True)
                # This entrypoint is restricted to a newly owned synthetic CI fixture.
                # Native server diagnostics never contain the source env, key or archive.
                if hasattr(instance, "recovery") and (instance.recovery / "postgres.log").exists():
                    for line in (instance.recovery / "postgres.log").read_text().splitlines():
                        if any(level in line for level in ("FATAL:", "PANIC:", "ERROR:")):
                            print("OWNED_BOOTSTRAP_NATIVE_SERVER " + line, flush=True)
            failure = getattr(instance, "last_failure", None)
            if failure:
                for line in failure["stderr"].splitlines():
                    if line.startswith(("HOST_PROBE_FAILED: ", "WEBSITE_PREFLIGHT_FAILED: ")):
                        print("OWNED_BOOTSTRAP_DIAGNOSTIC " + line, flush=True)
        raise
    finally:
        for instance in operators:
            for name in ("serriantide-rollback-" + instance.run_id, "serriantide-failed-" + instance.run_id):
                found = docker("inspect", name, allow_failure=True)
                if found.returncode == 0:
                    owned_ids.add(json.loads(found.stdout)[0]["Id"])
        current = docker("inspect", "serriantide", allow_failure=True)
        if current.returncode == 0 and json.loads(current.stdout)[0]["Image"] == base.inspect(image, image=True)["Id"]:
            owned_ids.add(json.loads(current.stdout)[0]["Id"])
        for identity in owned_ids:
            docker("stop", "--time", "15", identity, allow_failure=True)


if __name__ == "__main__":
    main()
