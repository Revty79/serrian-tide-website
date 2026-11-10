"""Real Docker/PG18 tests, guarded to an ephemeral GitHub-hosted CI runner."""
import json
import os
from pathlib import Path
import secrets
import re
import socket
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
import http.cookiejar
from ubuntu_deploy import Operator, Refused, require, FROZEN


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1", "CI_OWNERSHIP_REQUIRED")
    os.umask(0o077)
    repo = Path.cwd()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    image = "serriantide:" + commit
    task = Path(tempfile.mkdtemp(prefix="serrian-a5-docker-"))
    owned = task / "roots"
    owned.mkdir(mode=0o700)
    (owned / ".a5-fixture").write_text("OWNED_SYNTHETIC_A5_ONLY\n")
    basic = Operator(repo, commit, task / "runtime.env")
    require(basic.docker("inspect", "serriantide", allow_failure=True).returncode != 0, "Never replace a pre-existing CI container")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 3003))
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        pg_port = sock.getsockname()[1]
    password = secrets.token_hex(32)
    db_name, bystander = "serrian-a5-database-" + basic.run_id, "serrian-a5-bystander-" + basic.run_id
    owned_runs = {basic.run_id}
    def docker(*args, **kwargs):
        return basic.docker(*args, **kwargs)
    def fixture(action):
        return docker("exec", db_name, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts", action)
    def say(label):
        print("PASS " + label, flush=True)
    def new_op(cls=Operator):
        op = cls(repo, commit, basic.env_file)
        owned_runs.add(op.run_id)
        return op
    try:
        # Ownership changes are scoped only to this newly created synthetic directory.
        docker("run", "--rm", "--user", "0", "--network", "none", "--mount", f"type=bind,src={owned},dst=/owned", image, "chown", "-R", "1000:1000", "/owned")
        docker("run", "-d", "--name", db_name, "--network", "host", "--mount", f"type=bind,src={owned},dst=/owned", "-e", "SERRIAN_A5_OWNED_FIXTURE=1", "-e", "SERRIAN_A5_PG_PORT=" + str(pg_port), "-e", "SERRIAN_A5_PG_PASSWORD=" + password, image, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts")
        for _ in range(120):
            info = docker("exec", db_name, "cat", "/owned/info.json", allow_failure=True)
            if info.returncode == 0:
                info = json.loads(info.stdout)
                break
            if not basic.inspect(db_name)["State"]["Running"]:
                # No owner data is selected by this fixture. Redact its random
                # password and all URLs even for errors before its main handler.
                log = docker("logs", db_name, allow_failure=True)
                diagnostic = (log.stdout + log.stderr).decode(errors="replace").replace(password, "[REDACTED]")
                diagnostic = re.sub(r"[a-zA-Z][a-zA-Z0-9+.-]*://[^\s'\"<>]+", "[REDACTED_URL]", diagnostic)
                for line in diagnostic.splitlines()[-35:]:
                    print("OWNED_FIXTURE_DIAGNOSTIC " + line, flush=True)
                raise Refused("Synthetic PG fixture exited; see its redacted stage/code")
            time.sleep(1)
        else:
            raise Refused("Synthetic PG fixture timeout")
        env = {"DATABASE_URL": info["databaseUrl"], "BETTER_AUTH_URL": "http://localhost:3003", "BETTER_AUTH_SECRET": secrets.token_hex(32), "BETTER_AUTH_TRUSTED_ORIGINS": "http://127.0.0.1:3003,https://synthetic-a5.trycloudflare.com", "SERRIAN_TERRAIN_ROOT": "/owned/terrain", "SERRIAN_ASSET_ROOT": "/owned/artwork", "SERRIAN_RASTER_ROOT": "/owned/raster"}
        basic.env_file.write_text("".join(k + "=" + v + "\n" for k, v in env.items()))
        basic.env_file.chmod(0o600)
        # An actual prior website command, independent of the new guarded command.
        docker("run", "-d", "--name", "serriantide", "--network", "host", "--env-file", str(basic.env_file), "--mount", f"type=bind,src={owned},dst=/owned", image, "node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3003")
        old_id = basic.inspect("serriantide")["Id"]
        require(basic.await_health(old_id, 3003), "Synthetic prior website did not start")
        docker("run", "-d", "--name", bystander, "--network", "none", image, "node", "-e", "setInterval(()=>{},1000)")
        bystander_id = basic.inspect(bystander)["Id"]
        archive, source_hash = basic.expected_source()
        del archive
        candidate_id = basic.checked_image(image, source_hash)
        host = basic.host()
        try:
            basic.check(host, candidate_id, source_hash)
            raise AssertionError("Missing migration was accepted")
        except Refused:
            require(basic.inspect(old_id)["State"]["Running"], "Missing schema stopped old writer")
        say("missing schema refused before cutover; exact old website remains running")
        docker("stop", old_id)
        fixture("--upgrade")
        docker("start", old_id)
        require(basic.await_health(old_id, 3003), "Prior website after explicit synthetic migration")
        host = basic.host()
        basic.check(host, candidate_id, source_hash)
        basic.smoke(candidate_id)
        say("real Next.js smoke with no network/production credentials; separate read-only DB/storage/auth checks")
        maintenance = "serrian-a5-maintenance-" + basic.run_id
        docker("run", "-d", "--name", maintenance, "--network", "none", image, "node", "--conditions=react-server", "--import", "tsx", "scripts/environment.ts", "maintenance", "--port", "3000")
        try:
            expected = "const r=await fetch('http://127.0.0.1:3000/health');const v=await r.json();if(r.status!==200||v.applicationRunning!==false||v.status!=='maintenance')process.exit(1);"
            for _ in range(30):
                if docker("exec", maintenance, "node", "-e", expected, allow_failure=True).returncode == 0:
                    break
                time.sleep(1)
            else:
                raise Refused("Explicit maintenance did not start")
            require(not basic.http_health(maintenance, 3000), "Maintenance 200 was misclassified as a real website")
        finally:
            docker("stop", maintenance)
        say("maintenance HTTP 200 is explicitly distinguished from actual Next.js readiness")
        # Missing roots and config drift refuse before the working website stops.
        docker("exec", db_name, "node", "-e", "require('fs').renameSync('/owned/artwork','/owned/artwork-held')")
        try:
            try:
                basic.host()
                raise AssertionError("Missing private root accepted")
            except Refused:
                require(basic.inspect(old_id)["State"]["Running"], "Missing root stopped working app")
        finally:
            docker("exec", db_name, "node", "-e", "require('fs').renameSync('/owned/artwork-held','/owned/artwork')")
        docker("exec", db_name, "node", "-e", "require('fs').chmodSync('/owned/artwork',0)")
        try:
            try:
                basic.host()
                raise AssertionError("Inaccessible private root accepted")
            except Refused:
                require(basic.inspect(old_id)["State"]["Running"], "Inaccessible root stopped working app")
        finally:
            docker("exec", db_name, "node", "-e", "require('fs').chmodSync('/owned/artwork',0o700)")
        original_env = basic.env_file.read_bytes()
        try:
            basic.env_file.write_bytes(original_env.replace(b"http://localhost:3003", b"https://mismatched.example.invalid"))
            try:
                basic.host()
                raise AssertionError("Authentication config drift accepted")
            except Refused:
                require(basic.inspect(old_id)["State"]["Running"], "Config mismatch stopped working app")
        finally:
            basic.env_file.write_bytes(original_env)
        say("missing/inaccessible private storage and authentication-origin/config mismatch leave current website untouched")
        # Create a real signed-in session on the OLD website; retain its cookie
        # across stop/replacement, proving actual continuity rather than an empty table.
        cookies = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(cookies))
        payload = json.dumps({"email": "a5-owner@example.invalid", "password": "Synthetic-Deployment-Only-Password!"}).encode()
        req = urllib.request.Request("http://127.0.0.1:3003/api/auth/sign-in/email", data=payload, headers={"Content-Type": "application/json", "Origin": "http://127.0.0.1:3003"})
        require(client.open(req).status == 200 and len(cookies) > 0, "Prior website synthetic sign-in failed")
        with client.open("http://127.0.0.1:3003/api/auth/get-session") as response:
            prior_session = json.load(response)
        require(prior_session["user"]["id"] == "a5-owner", "Prior session identity differs")
        docker("stop", old_id)
        complete_before = basic.check(host, candidate_id, source_hash, frozen=True)["stateHash"]
        docker("start", old_id)
        require(basic.await_health(old_id, 3003), "Old writer before measured deployment")
        # Real successful deployment using the operator, then real idempotent repeat.
        op = new_op()
        result = op.deploy(host["approval"], FROZEN)
        require(result["passed"] and not basic.inspect(old_id)["State"]["Running"], "Cutover did not preserve stopped old container")
        live_id = basic.inspect("serriantide")["Id"]
        docker("stop", live_id)
        require(basic.check(host, candidate_id, source_hash, frozen=True)["stateHash"] == complete_before, "Successful deployment changed database rows, credentials or private files")
        docker("start", live_id)
        require(basic.await_health(live_id, 3003), "New writer after preservation check")
        repeated = new_op()
        require(repeated.deploy(basic.host()["approval"], FROZEN)["unchanged"], "Repeated deployment was not a no-op")
        say("successful single-writer cutover, preserved rollback container/image and repeated update")
        # Reuse the same old cookie BEFORE another login on the replacement.
        with client.open("http://127.0.0.1:3003/api/auth/get-session") as response:
            continued = json.load(response)
        require(continued["user"]["id"] == "a5-owner" and continued["session"]["id"] == prior_session["session"]["id"], "Existing session did not survive replacement")
        with client.open("http://127.0.0.1:3003/api/worlds") as response:
            saved_worlds = json.load(response)
        require(any(world["id"] == info["world"] for world in saved_worlds["worlds"]), "Existing authenticated World is missing")
        say("old signed-in cookie, exact session identity and existing World access survive container replacement")
        # Exercise the existing password and origin guards again on the new app.
        require(client.open(req).status == 200 and len(cookies) > 0, "Existing synthetic sign-in failed")
        require(client.open("http://127.0.0.1:3003/api/auth/get-session").status == 200, "Saved session failed")
        require(client.open("http://127.0.0.1:3003/api/worlds").status == 200, "Authenticated Worlds permissions failed")
        wrong = urllib.request.Request("http://127.0.0.1:3003/api/auth/sign-in/email", data=payload, headers={"Content-Type": "application/json", "Origin": "https://attacker.example.invalid"})
        try:
            client.open(wrong)
            raise AssertionError("Untrusted origin accepted")
        except urllib.error.HTTPError as error:
            require(error.code == 403, "Origin denial changed")
        say("unchanged synthetic account/password, saved session, authenticated Worlds and origin rejection")
        # Force replacement even with the same immutable release, test harness only.
        class Force(Operator):
            def host(self):
                host = super().host()
                host["container"]["Config"]["Cmd"] = ["synthetic-force-replacement"]
                return host
        class StartupFailure(Force):
            def docker(self, *args, **kwargs):
                if args[0] == "create" and "serriantide" in args:
                    args = (*args[:-1], "-e", "DATABASE_URL=postgresql://inert:unused@127.0.0.1:1/no_database", args[-1])
                return super().docker(*args, **kwargs)
        failing = new_op(StartupFailure)
        try:
            failing.deploy(failing.host()["approval"], FROZEN)
            raise AssertionError("Startup failure accepted")
        except Refused as error:
            require("DEPLOY_FAILED_ROLLED_BACK" in str(error), "Safe rollback not proved")
        require(basic.inspect(live_id)["State"]["Running"], "Previous exact container not restored")
        say("real database-unavailable startup failure; automatic rollback only after full unchanged-state witness")
        class HTTPFailure(Force):
            def await_health(self, name, port):
                if name != live_id and re.fullmatch(r"[a-f0-9]{64}", name):
                    require(super().await_health(name, port), "HTTP fault injected before actual Next.js startup")
                    return False  # Deliberately failed readiness delivery, with no data write.
                return super().await_health(name, port)
        failing = new_op(HTTPFailure)
        try:
            failing.deploy(failing.host()["approval"], FROZEN)
            raise AssertionError("Injected HTTP readiness failure accepted")
        except Refused as error:
            require("DEPLOY_FAILED_ROLLED_BACK" in str(error), "HTTP failure did not recover prior exact app")
        require(basic.inspect(live_id)["State"]["Running"], "HTTP rollback lost the prior exact container")
        say("injected HTTP readiness failure after real Next.js startup safely restores unchanged prior container")
        class AcceptedWriteFailure(Force):
            def await_health(self, name, port):
                if name != live_id and re.fullmatch(r"[a-f0-9]{64}", name):
                    require(super().await_health(name, port), "New website did not start before synthetic write")
                    fixture("--mutate")
                    return False
                return super().await_health(name, port)
        failing = new_op(AcceptedWriteFailure)
        try:
            failing.deploy(failing.host()["approval"], FROZEN)
            raise AssertionError("Accepted write rollback was accepted")
        except Refused as error:
            require("UNSAFE_ROLLBACK" in str(error), "New write did not fence automatic rollback")
        require(not basic.inspect(live_id)["State"]["Running"], "Old writer restarted after accepted write")
        say("actual accepted PostgreSQL write prevents automatic code rollback; both containers retained")
        require(basic.inspect(bystander)["Id"] == bystander_id and basic.inspect(bystander)["State"]["Running"], "Unrelated service changed")
        say("unrelated service identity/running state preserved")
    finally:
        # Stop only positively identified CI-owned containers, preserving their data/images.
        listed = docker("ps", "-a", "--format", "{{json .}}", allow_failure=True)
        for line in listed.stdout.decode().splitlines():
            row = json.loads(line)
            names = {"serriantide", db_name, bystander, "serrian-a5-maintenance-" + basic.run_id} | {"serriantide-rollback-" + run for run in owned_runs} | {"serriantide-failed-" + run for run in owned_runs}
            if row["Names"] in names:
                # The initial absence assertion plus this isolated hosted daemon owns these names.
                docker("stop", "--time", "15", row["ID"], allow_failure=True)


if __name__ == "__main__":
    main()
