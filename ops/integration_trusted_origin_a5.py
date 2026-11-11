"""New owned Ubuntu/PG18/TLS fixtures only; never contact the real domain."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
from bootstrap_tls_fixture import OwnedTLSProxy, require_fixture_listener_available
from ubuntu_deploy import Operator, Refused, require
from ubuntu_trusted_origin import OriginUpdate, ORIGIN, KEY, append_origin

RUNTIME_COMMIT = "1d9fe69d0c2073ea5acd23408585540028928c22"


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1", "OWNED_ORIGIN_CI_REQUIRED")
    os.umask(0o077)
    repo = Path.cwd()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    task = Path(tempfile.mkdtemp(prefix="serrian-origin-owned-"))
    roots = task / "roots"
    roots.mkdir(mode=0o700)
    (roots / ".a5-fixture").write_text("OWNED_SYNTHETIC_A5_ONLY\n")
    # The preceding updater regression builds this genuine earlier release.
    # Prove that the new tool retains an older deployed image without requiring
    # a checkout update or rebuilding that website.
    base = Operator(repo, RUNTIME_COMMIT, task / "runtime.env")
    docker = base.docker
    image = "serriantide:" + commit
    require(docker("inspect", "serriantide", allow_failure=True).returncode != 0, "OWNED_ORIGIN_NAME_OCCUPIED")
    require_fixture_listener_available(3003)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    password = secrets.token_hex(32)
    db_name = "serrian-origin-db-" + base.run_id
    bystander = "serrian-origin-bystander-" + base.run_id
    owned_ids = set()
    proxy = None

    def say(value):
        print("PASS TRUSTED_ORIGIN " + value, flush=True)

    def fixture_query(sql):
        code = "const fs=require('fs'),{Client}=require('pg');(async()=>{const c=new Client({connectionString:JSON.parse(fs.readFileSync('/owned/info.json')).databaseUrl});await c.connect();console.log(JSON.stringify((await c.query(process.argv[1])).rows));await c.end();})().catch(()=>process.exit(1));"
        return json.loads(docker("exec", db_name, "node", "-e", code, sql).stdout)

    try:
        docker("run", "--rm", "--network", "none", "--user", "0", "--mount", f"type=bind,src={roots},dst=/owned", image, "chown", "-R", "1000:1000", "/owned")
        docker("run", "-d", "--name", db_name, "--network", "host", "--mount", f"type=bind,src={roots},dst=/owned", "-e", "SERRIAN_A5_OWNED_FIXTURE=1", "-e", "SERRIAN_A5_PG_PORT=" + str(port), "-e", "SERRIAN_A5_PG_PASSWORD=" + password, image, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts")
        owned_ids.add(base.inspect(db_name)["Id"])
        for _ in range(150):
            result = docker("exec", db_name, "cat", "/owned/info.json", allow_failure=True)
            if result.returncode == 0:
                info = json.loads(result.stdout)
                break
            time.sleep(1)
        else:
            raise AssertionError("Owned origin database fixture failed")
        docker("exec", db_name, "node", "--conditions=react-server", "--import", "tsx", "scripts/deployment-a5-fixture.ts", "--upgrade")
        # Normalize this newly seeded synthetic username like the real signup
        # flow. No existing source fixture or owner account is modified.
        fixture_query("update public.\"user\" set username='syntheticowner' where id='a5-owner'")
        old_origin = "https://synthetic-origin.trycloudflare.com"
        settings = {"DATABASE_URL": info["databaseUrl"], "BETTER_AUTH_URL": "http://localhost:3003", "BETTER_AUTH_SECRET": secrets.token_hex(32), KEY: "http://127.0.0.1:3003," + old_origin, "SERRIAN_TERRAIN_ROOT": "/owned/terrain", "SERRIAN_ASSET_ROOT": "/owned/artwork", "SERRIAN_RASTER_ROOT": "/owned/raster"}
        original = ("# retained synthetic configuration\n" + "".join(key + "=" + value + "\n" for key, value in settings.items())).encode()
        base.env_file.write_bytes(original)
        base.env_file.chmod(0o600)
        _archive, source_hash = base.expected_source()
        image_id = base.checked_image("serriantide:" + RUNTIME_COMMIT, source_hash)
        docker("create", "--name", "serriantide", "--network", "host", "--restart=unless-stopped", "--read-only", "--memory", "2048m", "--memory-swap", "2048m", "--env-file", str(base.env_file), "-e", "PORT=3003", "-e", "SERRIAN_WEBSITE_LISTEN=127.0.0.1", "-e", "SERRIAN_RELEASE_COMMIT=" + RUNTIME_COMMIT, "-e", "SERRIAN_EXPECTED_SOURCE_HASH=" + source_hash, "--mount", f"type=bind,src={roots},dst=/owned", "--tmpfs", "/tmp:uid=1000,gid=1000,mode=700", "--tmpfs", "/app/.next/cache:uid=1000,gid=1000,mode=700", image_id)
        old = base.inspect("serriantide")
        owned_ids.add(old["Id"])
        docker("start", old["Id"])
        require(base.await_health(old["Id"], 3003), "Owned old website failed")
        docker("run", "-d", "--name", bystander, "--network", "none", image, "node", "-e", "setInterval(()=>{},1000)")
        bystander_id = base.inspect(bystander)["Id"]
        owned_ids.add(bystander_id)
        # The hostname in this certificate/client is mapped directly to a new
        # owned loopback listener. No system DNS/trust or real domain is used.
        proxy = OwnedTLSProxy(task, [old_origin, ORIGIN], "http://203.0.113.25:3003")
        old_client, _old_cookies = proxy.client()
        credentials = {"username": "SyntheticOwner", "password": "Synthetic-Deployment-Only-Password!"}
        require(proxy.post(old_client, old_origin, "sign-in/username", credentials).status == 200, "Existing synthetic username login failed")
        old_session = json.load(old_client.open(old_origin + "/api/auth/get-session"))
        new_client, new_cookies = proxy.client()
        try:
            proxy.post(new_client, ORIGIN, "sign-in/username", credentials)
            raise AssertionError("Unconfigured domain unexpectedly allowed login")
        except urllib.error.HTTPError as error:
            require(error.code == 403, "New-origin baseline must fail origin validation")
        say("actual verified-TLS username login works on the existing origin and fails403 on the unconfigured new origin")
        expected = {"name": "serrian_deployment_fixture", "role": "postgres", "port": port}

        def operation(cls=OriginUpdate, target=expected):
            return cls(repo, commit, base.env_file, expected=target)

        def refused(op, code):
            try:
                op.apply(lambda _message: "y")
                raise AssertionError("Expected refusal " + code)
            except Refused as error:
                require(code in str(error), "Unexpected refusal: " + str(error))

        refused(operation(target={"name": "serrian_tide_prod", "role": "serrian_tide_app", "port": 5432}), "ORIGIN_DATABASE_IDENTITY")
        require(operation().apply(lambda _message: "n").get("cancelled"), "Decline ignored")
        require(base.inspect(old["Id"])["State"]["Running"] and base.env_file.read_bytes() == original, "Refusal changed original writer/config")
        say("wrong database identity and declined consent preserve the running website and configuration")
        host = base.host()
        docker("stop", old["Id"])
        witness = base.check(host, image_id, source_hash, frozen=True)["stateHash"]
        docker("start", old["Id"])
        require(base.await_health(old["Id"], 3003), "Original writer after witness")

        class FailedAuth(OriginUpdate):
            def authentication_check(self, _image):
                raise Refused("INJECTED_ORIGIN_AUTH_FAILURE")

        failed_auth = operation(FailedAuth)
        refused(failed_auth, "DEPLOY_FAILED_ROLLED_BACK")
        require(base.inspect(old["Id"])["State"]["Running"] and base.env_file.read_bytes() == original, "Auth failure lost old writer/config")

        class FailedActivation(OriginUpdate):
            def activate(self):
                super().activate()
                raise OSError("Owned failure after atomic config activation")

        failed_activation = operation(FailedActivation)
        refused(failed_activation, "DEPLOY_FAILED_ROLLED_BACK")
        require(base.inspect(old["Id"])["State"]["Running"] and base.env_file.read_bytes() == original, "Post-activation failure lost original config/writer")
        require((failed_activation.output / "origin-configuration-restored.json").exists(), "Original configuration restoration was not recorded")
        say("real auth-canary failure and post-atomic-activation failure safely restore the exact old container and original config")
        passed = operation()
        result = passed.apply(lambda _message: "y")
        require(result["configurationOnly"] and result["commit"] == RUNTIME_COMMIT and not result["secretChanged"] and not result["authBaseChanged"], "Operation scope differs")
        current = base.inspect("serriantide")
        owned_ids.add(current["Id"])
        candidate = append_origin(original)
        require(base.env_file.read_bytes() == candidate and (passed.output / "original.env").read_bytes() == original, "Original/candidate config bytes differ")
        require(current["Image"] == old["Image"] and current["Mounts"] == old["Mounts"] and current["HostConfig"]["RestartPolicy"] == old["HostConfig"]["RestartPolicy"], "Image, persistent mounts or restart policy changed")
        require(not base.inspect(old["Id"])["State"]["Running"] and base.inspect(bystander_id)["State"]["Running"], "Original retention/bystander failure")
        current_host = base.host()
        docker("stop", current["Id"])
        require(base.check(current_host, image_id, source_hash, frozen=True)["stateHash"] == witness, "Database/session/files changed during config transition")
        docker("start", current["Id"])
        require(base.await_health(current["Id"], 3003), "Candidate after witness")
        require(json.load(old_client.open(old_origin + "/api/auth/get-session"))["session"]["id"] == old_session["session"]["id"], "Existing host session was invalidated")
        time.sleep(11)
        require(proxy.post(new_client, ORIGIN, "sign-in/username", credentials).status == 200, "New exact HTTPS origin username login failed")
        require(json.load(new_client.open(ORIGIN + "/api/auth/get-session"))["user"]["id"] == "a5-owner", "New HTTPS login did not persist")
        require(any(cookie.domain == "serriantide.com" and not cookie.domain_specified for cookie in new_cookies), "Cookie boundary changed")
        require(any(world["id"] == info["world"] for world in json.load(new_client.open(ORIGIN + "/api/worlds"))["worlds"]), "Existing World read failed")
        require(json.load(old_client.open(old_origin + "/api/auth/get-session"))["session"]["id"] == old_session["session"]["id"], "New-domain login reset existing sessions")
        say("same image/mounts/port/secret/base and exact full database/files are preserved; old session survives and new-domain HTTPS username login persists")
        require(operation().apply(lambda _message: (_ for _ in ()).throw(AssertionError("No-op prompted"))).get("unchanged"), "Repeat did not detect existing origin")
        require(base.inspect("serriantide")["Id"] == current["Id"] and base.env_file.read_bytes() == candidate, "Repeat restarted or rewrote config")
        say("repeat is healthy and idempotent without a restart or config rewrite")

        # Prepare a second controlled transition using this owned retained
        # original container/config. Preserve the successful candidate and all
        # sessions. Never revert the deliberately accepted write tested below.
        docker("stop", current["Id"])
        docker("rename", current["Id"], "origin-retained-success-" + base.run_id)
        (task / "retained-success.env").write_bytes(candidate)
        base.env_file.write_bytes(original)
        docker("rename", old["Id"], "serriantide")
        docker("start", old["Id"])
        require(base.await_health(old["Id"], 3003), "Owned source for accepted-write case")

        class AcceptedWrite(OriginUpdate):
            def activate(self):
                super().activate()
                fixture_query("update public.\"user\" set name='Owned accepted write retained' where id='a5-owner'")
                raise OSError("Owned failure after actual accepted write")

        unsafe = operation(AcceptedWrite)
        refused(unsafe, "UNSAFE_ROLLBACK")
        require(not base.inspect(old["Id"])["State"]["Running"] and base.env_file.read_bytes() == candidate, "Unsafe rollback restarted old writer or reverted new config")
        require(fixture_query("select name from public.\"user\" where id='a5-owner'")[0]["name"] == "Owned accepted write retained", "Accepted write was lost")
        require(base.inspect(bystander_id)["State"]["Running"], "Bystander changed")
        say("accepted post-start writes prevent automatic rollback; candidate config, both containers and the real write remain retained")
    finally:
        if proxy:
            proxy.server.shutdown()
            proxy.server.server_close()
        listing = docker("ps", "-a", "--format", "{{json .}}", allow_failure=True)
        for line in listing.stdout.decode().splitlines():
            item = json.loads(line)
            if item["Names"] == "serriantide" or item["Names"].startswith(("serriantide-failed-", "serriantide-rollback-")):
                owned_ids.add(item["ID"])
        for identity in owned_ids:
            docker("stop", "--time", "15", identity, allow_failure=True)
        if docker("inspect", "serriantide", allow_failure=True).returncode == 0:
            docker("rename", "serriantide", "retained-" + task.name)


if __name__ == "__main__":
    main()
