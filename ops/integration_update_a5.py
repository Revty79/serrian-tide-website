"""Full installed CLI/installer on an owned Ubuntu runner with real old/new apps.

GitHub outcomes alone are deterministic external fixtures to avoid the circular
requirement that this running workflow already be successful. The production CLI
has no override. Real GitHub verification is repeated after publication.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import pty
import re
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

BASELINE = "1d9fe69d0c2073ea5acd23408585540028928c22"


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1", "CI_OWNERSHIP_REQUIRED")
    os.umask(0o077)
    real_github = "--real-github" in sys.argv
    require(not real_github or os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch", "CI_ACCEPTANCE_EVENT_REQUIRED")
    repo = Path.cwd()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    task = Path(tempfile.mkdtemp(prefix="serrian-update-owned-"))
    (task / "update-fixture-owner").write_text("OWNED_ONE_COMMAND_UPDATE_FIXTURE\n")
    owned = task / "roots"
    owned.mkdir(mode=0o700)
    (owned / ".a5-fixture").write_text("OWNED_SYNTHETIC_A5_ONLY\n")
    op = Operator(repo, commit, task / "production.env")
    image = "serriantide:" + commit
    old_image = "serriantide:" + BASELINE
    require(op.docker("inspect", "serriantide", allow_failure=True).returncode != 0, "CI_SOURCE_NAME_OCCUPIED")
    require_fixture_listener_available(3003)
    command_path = Path("/usr/local/bin/serrian-update")
    package = Path.home() / ".local/share/serrian-update" / commit
    require(not command_path.exists() and not command_path.is_symlink() and not package.exists(), "CI_INSTALLATION_OCCUPIED")
    owned_ids = set()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    password = secrets.token_hex(32)
    db_name = "serrian-update-database-" + op.run_id
    bystander = "serrian-update-bystander-" + op.run_id

    def say(label):
        print("PASS ONE_COMMAND " + label, flush=True)

    def docker(*args, **kwargs):
        return op.docker(*args, **kwargs)

    def fixture(action):
        return docker("exec", db_name, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts", action)

    def invoke(entry, arguments, scenario, answer=None):
        master, slave = pty.openpty()
        args = [sys.executable, "-B", "ops/update_fixture_driver.py", "--task", str(task), "--entry", str(entry), "--commit", commit, "--scenario", scenario, "--", *arguments]
        real = real_github and scenario in ("install", "install-repeat", "success", "already-current")
        if real:
            args = [str(command_path)] if entry == package / "serrian_update.py" else [sys.executable, "-I", "-B", str(entry), *arguments]
        process = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, cwd=repo, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        os.close(slave)
        data, responded = bytearray(), False
        deadline = time.monotonic() + 1200
        try:
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.5)[0]:
                    try:
                        chunk = os.read(master, 65536)
                    except OSError:
                        break
                    if not chunk:
                        break
                    data.extend(chunk)
                    if b"Update now? [y/N]:" in data and not responded:
                        require(answer is not None, "Unexpected confirmation in a refusal/no-op")
                        os.write(master, (answer + "\n").encode())
                        responded = True
                if process.poll() is not None and not select.select([master], [], [], 0)[0]:
                    break
            else:
                process.terminate()
                raise AssertionError("Owned updater command timed out")
            code = process.wait(timeout=20)
        finally:
            os.close(master)
        text = data.decode(errors="replace")
        (task / ("output-" + scenario + ".log")).write_text(text)
        require("Synthetic-Deployment-Only-Password!" not in text and password not in text and "postgresql://" not in text, "Private fixture credentials reached command output")
        # Real acceptance executes the installed shell command and live GitHub,
        # without importing the external transport/fault harness.
        events = {"api": {}, "docker": []} if real else json.loads((task / ("events-" + scenario + ".json")).read_text())
        return code, text, events

    try:
        # Build an actual earlier reviewed release. Do not invent an image label
        # or mutate its build receipt to simulate a previous deployment.
        old = Operator(repo, BASELINE, op.env_file)
        old.output = task / "old-build"
        old.output.mkdir(mode=0o700)
        archive, old_hash = old.expected_source()
        old.build(archive, old_image)
        old_id_image = old.checked_image(old_image, old_hash)
        docker("run", "--rm", "--network", "none", "--user", "0", "--mount", f"type=bind,src={owned},dst=/owned", image, "chown", "-R", "1000:1000", "/owned")
        docker("run", "-d", "--name", db_name, "--network", "host", "--mount", f"type=bind,src={owned},dst=/owned", "-e", "SERRIAN_A5_OWNED_FIXTURE=1", "-e", "SERRIAN_A5_PG_PORT=" + str(port), "-e", "SERRIAN_A5_PG_PASSWORD=" + password, image, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts")
        owned_ids.add(op.inspect(db_name)["Id"])
        for _ in range(180):
            result = docker("exec", db_name, "cat", "/owned/info.json", allow_failure=True)
            if result.returncode == 0:
                info = json.loads(result.stdout)
                break
            time.sleep(1)
        else:
            raise AssertionError("Owned PostgreSQL fixture failed")
        fixture("--upgrade")
        settings = {"DATABASE_URL": info["databaseUrl"], "BETTER_AUTH_URL": "http://localhost:3003", "BETTER_AUTH_SECRET": secrets.token_hex(32), "BETTER_AUTH_TRUSTED_ORIGINS": "http://127.0.0.1:3003,https://synthetic-update.trycloudflare.com", "SERRIAN_TERRAIN_ROOT": "/owned/terrain", "SERRIAN_ASSET_ROOT": "/owned/artwork", "SERRIAN_RASTER_ROOT": "/owned/raster"}
        original = "".join(key + "=" + value + "\n" for key, value in settings.items()).encode()
        op.env_file.write_bytes(original)
        op.env_file.chmod(0o600)
        # The permanent command uses the normal repository .env.production.
        env_link = repo / ".env.production"
        require(not env_link.exists() and not env_link.is_symlink(), "CI_ENV_OCCUPIED")
        env_link.write_bytes(original)
        env_link.chmod(0o600)
        op.env_file = env_link
        old.env_file = env_link
        docker("create", "--name", "serriantide", "--network", "host", "--restart=no", "--read-only", "--memory", "2048m", "--memory-swap", "2048m", "--env-file", str(env_link), "-e", "PORT=3003", "-e", "SERRIAN_WEBSITE_LISTEN=127.0.0.1", "-e", "SERRIAN_RELEASE_COMMIT=" + BASELINE, "-e", "SERRIAN_EXPECTED_SOURCE_HASH=" + old_hash, "--mount", f"type=bind,src={owned},dst=/owned", "--tmpfs", "/tmp:uid=1000,gid=1000,mode=700", "--tmpfs", "/app/.next/cache:uid=1000,gid=1000,mode=700", old_id_image)
        old_container = op.inspect("serriantide")["Id"]
        owned_ids.add(old_container)
        docker("start", old_container)
        require(op.await_health(old_container, 3003), "Real old managed website did not start")
        docker("run", "-d", "--name", bystander, "--network", "none", image, "node", "-e", "setInterval(()=>{},1000)")
        bystander_id = op.inspect(bystander)["Id"]
        owned_ids.add(bystander_id)
        installer = repo / "ops/install_serrian_update.py"
        install_args = ["--repo", str(repo), "--commit", commit]
        code, text, events = invoke(installer, install_args, "ci-failed")
        require(code != 0 and "CI_NOT_PASSED" in text and not events["docker"] and not command_path.exists() and not package.exists(), "Failed CI installed a command or touched Docker")
        code, text, events = invoke(installer, install_args, "api-unavailable")
        require(code != 0 and "CI_UNAVAILABLE" in text and not command_path.exists(), "API outage installed a command")
        say("installer refuses failed CI and API outage before command installation or website access")
        # Existing unrelated command is preserved, then retained under the task.
        conflict = task / "conflict-command"
        conflict.write_text("#!/bin/sh\n# Owned unrelated command fixture\n")
        subprocess.run(["sudo", "install", "-m", "755", str(conflict), str(command_path)], check=True)
        code, text, _events = invoke(installer, install_args, "install-conflict")
        require(code != 0 and "INSTALL_CONFLICT" in text and command_path.read_bytes() == conflict.read_bytes(), "Unrelated command was overwritten")
        subprocess.run(["sudo", "mv", "--", str(command_path), str(task / "retained-unrelated-command")], check=True)
        code, text, events = invoke(installer, install_args, "install")
        require(code == 0 and command_path.stat().st_uid == 0 and not events["docker"], "Complete installer failed or touched Docker")
        require(subprocess.run([str(command_path), "--help"], capture_output=True).returncode == 0, "Installed permanent shell launcher failed")
        code, text, events = invoke(installer, install_args, "install-repeat")
        require(code == 0 and "already installed" in text and not events["docker"] and op.inspect(old_container)["State"]["Running"], "Repeat installation changed website")
        say("real root-owned permanent launcher, private owner package, conflict preservation and idempotent installation pass")
        entry = package / "serrian_update.py"
        cli_args = ["--installation", str(package / "installation.json")]
        code, text, events = invoke(entry, cli_args, "cancel", "n")
        require(code == 0 and "Cancelled" in text and not any(event[0] in ("stop", "start", "create", "buildx") for event in events["docker"]), "Declined update performed a deployment")
        code, text, events = invoke(entry, cli_args, "ci-after-confirm", "y")
        require(code != 0 and "CI_NOT_PASSED" in text and op.inspect(old_container)["State"]["Running"], "Changed CI after confirmation stopped the website")
        code, text, events = invoke(entry, cli_args, "ci-before-cutover", "y")
        require(code != 0 and "CI_NOT_PASSED" in text and op.inspect(old_container)["State"]["Running"], "Changed CI before cutover stopped the website")
        say("interactive decline and CI withdrawal after consent/before cutover preserve the original writer")
        # Exact ledger mismatch uses the actual owned database, never a mocked host.
        query = "const fs=require('fs'),{Client}=require('pg');(async()=>{const c=new Client({connectionString:JSON.parse(fs.readFileSync('/owned/info.json')).databaseUrl});await c.connect();const r=await c.query('select id,hash from drizzle.__drizzle_migrations order by id desc limit 1');console.log(JSON.stringify(r.rows[0]));await c.query('update drizzle.__drizzle_migrations set hash=$1 where id=$2',[process.argv[1],r.rows[0].id]);await c.end();})().catch(()=>process.exit(1));"
        ledger = json.loads(docker("exec", db_name, "node", "-e", query, "0" * 64).stdout)
        code, text, events = invoke(entry, cli_args, "migration")
        require(code != 0 and "MIGRATION_APPROVAL_REQUIRED" in text and op.inspect(old_container)["State"]["Running"], "Migration mismatch was accepted")
        docker("exec", db_name, "node", "-e", query, ledger["hash"])
        env_link.write_bytes(original.replace(b"http://localhost:3003", b"https://unapproved.example.invalid"))
        code, text, events = invoke(entry, cli_args, "configuration")
        require(code != 0 and "CONFIG_DRIFT" in text and env_link.read_bytes() != original and op.inspect(old_container)["State"]["Running"], "Configuration drift was changed/accepted")
        env_link.write_bytes(original)
        say("actual migration hash and configuration drift stop before deployment and are never repaired automatically")
        cookies = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(cookies))
        payload = json.dumps({"email": "a5-owner@example.invalid", "password": "Synthetic-Deployment-Only-Password!"}).encode()
        request = urllib.request.Request("http://127.0.0.1:3003/api/auth/sign-in/email", data=payload, headers={"Content-Type": "application/json", "Origin": "http://127.0.0.1:3003"})
        require(client.open(request, timeout=20).status == 200, "Original account login failed")
        previous_session = json.load(client.open("http://127.0.0.1:3003/api/auth/get-session", timeout=20))
        _archive, source_hash = op.expected_source()
        host = op.host()
        docker("stop", old_container)
        witness = op.check(host, image, source_hash, frozen=True)["stateHash"]
        docker("start", old_container)
        require(op.await_health(old_container, 3003), "Original source after witness")
        code, text, _events = invoke(entry, cli_args, "startup-failure", "y")
        require(code != 0 and "DEPLOY_FAILED_ROLLED_BACK" in text and op.inspect(old_container)["State"]["Running"] and env_link.read_bytes() == original, "Actual startup failure did not preserve old writer/config")
        say("installed updater safely rolls back an actual failing replacement startup")
        code, text, _events = invoke(entry, cli_args, "success", "y")
        require(code == 0 and "Update complete" in text, "Installed updater failed successful release")
        current = op.inspect("serriantide")
        owned_ids.add(current["Id"])
        require(current["Id"] != old_container and not op.inspect(old_container)["State"]["Running"] and op.inspect(old_container)["Image"] == old_id_image, "Old image/container were not preserved")
        docker("stop", current["Id"])
        require(op.check(host, image, source_hash, frozen=True)["stateHash"] == witness, "Update changed original database/files/accounts")
        docker("start", current["Id"])
        require(op.await_health(current["Id"], 3003), "New writer after source equality")
        continued = json.load(client.open("http://127.0.0.1:3003/api/auth/get-session", timeout=20))
        require(continued["session"]["id"] == previous_session["session"]["id"], "Existing session did not survive")
        require(any(world["id"] == info["world"] for world in json.load(client.open("http://127.0.0.1:3003/api/worlds", timeout=20))["worlds"]), "Existing native World is missing")
        code, text, events = invoke(entry, cli_args, "already-current")
        require(code == 0 and "Already deployed and healthy" in text and not any(event[0] in ("stop", "start", "create", "buildx", "rename", "update") for event in events["docker"]), "Already-deployed run rebuilt or restarted")
        require(op.inspect(bystander_id)["State"]["Running"] and env_link.read_bytes() == original, "Unrelated service or original configuration changed")
        say("real old-to-new release, all database/private files, existing account/session/World, port3003 and bystander survive; repeated command performs no build or restart")
        if real_github:
            say("literal installed serrian-update and installer passed using live exact-commit GitHub CI; no transport override on successful installation/update/no-op")
    except Exception:
        # Private fixture command logs remain on the runner. Print fixed codes only.
        for file in task.glob("output-*.log"):
            for line in file.read_text().splitlines():
                if re.match(r"^[A-Z_]+:", line):
                    print("OWNED_UPDATE_DIAGNOSTIC " + line[:500], flush=True)
        raise
    finally:
        listed = docker("ps", "-a", "--format", "{{json .}}", allow_failure=True)
        for line in listed.stdout.decode().splitlines():
            item = json.loads(line)
            if item["Names"] == "serriantide" or item["Names"].startswith(("serriantide-failed-", "serriantide-rollback-")):
                # This entrypoint only runs on an ephemeral owned daemon after
                # an initial free-name check; retain every image/data/container.
                owned_ids.add(item["ID"])
        for identity in owned_ids:
            docker("stop", "--time", "15", identity, allow_failure=True)
        if docker("inspect", "serriantide", allow_failure=True).returncode == 0:
            # Retain our stopped source under a unique name for the next owned
            # bootstrap suite; never delete the container or its storage.
            docker("rename", "serriantide", "retained-" + task.name)


if __name__ == "__main__":
    main()
