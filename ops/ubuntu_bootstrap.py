#!/usr/bin/env python3
"""One-time empty-Atlas Ubuntu bootstrap. Never migrates or restores Production."""
import argparse
import json
import os
import re
from pathlib import Path
import secrets
import signal
import socket
import stat
import subprocess
import tempfile
from ubuntu_deploy import Operator, Refused, require, sha, canonical, private_file, parse_env, resource_check, ROOT_KEYS, FROZEN, MIB

KINDS = ("terrain", "artwork", "raster")


def real_directory(directory):
    directory = Path(directory)
    require(directory.is_absolute() and directory.resolve() == directory, "BOOTSTRAP_PATH: use resolved absolute directories")
    for parent in [*reversed(directory.parents), directory]:
        require(parent.is_dir() and not parent.is_symlink(), "BOOTSTRAP_PATH: directory ancestors must not be links")
    return directory


def candidate_configuration(data, storage):
    env = parse_env(data)
    require(all(key not in env for key in ROOT_KEYS), "BOOTSTRAP_ALREADY_CONFIGURED: use the normal updater for configured storage")
    require(not any(ord(character) < 32 for character in str(storage)) and "," not in str(storage), "BOOTSTRAP_STORAGE_PATH: storage paths cannot inject environment entries or mount options")
    additions = "".join(f"{key}={storage / kind}\n" for key, kind in zip(ROOT_KEYS, KINDS))
    return data + (b"" if data.endswith(b"\n") else b"\n") + additions.encode()


def replace_configuration(file, expected, replacement, mode):
    require(private_file(file) == expected, "BOOTSTRAP_CONFIG_CHANGED: retain configuration copies and review concurrent edits")
    fd, temporary = tempfile.mkstemp(prefix=".env.production.bootstrap-", dir=file.parent)
    # Retain even an incomplete private staging file on failure, never overwrite a backup.
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(replacement)
        stream.flush()
        os.fsync(stream.fileno())
    require(private_file(file) == expected, "BOOTSTRAP_CONFIG_CHANGED: active configuration changed before replacement")
    os.replace(temporary, file)
    descriptor = os.open(file.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


class Bootstrap(Operator):
    def __init__(self, repo, commit, storage_root, expected, env_file=None, pg_bin="/usr/lib/postgresql/18/bin"):
        super().__init__(repo, commit, env_file)
        self.active_env_file = self.env_file
        self.storage_root = Path(storage_root)
        self.expected = expected
        self.pg_bin = Path(pg_bin)
        self.recovery_verified = False
        self.config_activated = False
        self.in_cutover = False
        self.image_id = None

    def docker(self, *args, **kwargs):
        # Every new foreground helper is positively identified and stopped on interruption.
        if args and args[0] == "run":
            name = args[args.index("--name") + 1] if "--name" in args else "serrian-bootstrap-helper-" + secrets.token_hex(12)
            additions = [] if "--name" in args else ["--name", name]
            args = ("run", *additions, "--label", "org.serriantide.bootstrap-run=" + self.run_id, *args[1:])
            try:
                return super().docker(*args, **kwargs)
            finally:
                found = super().docker("inspect", name, allow_failure=True)
                if found.returncode == 0:
                    record = json.loads(found.stdout)[0]
                    require(record["Config"].get("Labels", {}).get("org.serriantide.bootstrap-run") == self.run_id, "BOOTSTRAP_HELPER_IDENTITY: refuse unrelated helper cleanup")
                    super().docker("stop", "--time", "15", record["Id"], allow_failure=True)
                    super().docker("rm", record["Id"], allow_failure=True)
        return super().docker(*args, **kwargs)

    def probe(self, mode, image, request, env_file=None, mounts=()):
        code = self.git("show", self.commit + ":ops/bootstrap-probe.mjs")
        args = ["run", "--rm", "-i", "--entrypoint", "node", "--read-only", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1", "--network", "host" if mode == "database" else "none"]
        if env_file:
            args += ["--env-file", str(env_file)]
        if mode == "storage":
            args += ["--user", "1000:1000"]
        args += [*mounts, image, "--max-old-space-size=256", "--input-type=module", "-e", code, "--", "--bootstrap-probe"]
        result = json.loads(self.docker(*args, data=json.dumps({"mode": mode, **request}).encode()).stdout)
        require(result.get("passed"), "BOOTSTRAP_PROBE: read-only validation refused")
        return result

    def ledger(self):
        journal = json.loads(self.git("show", self.commit + ":drizzle/meta/_journal.json"))
        require(len(journal["entries"]) == 162 and journal["entries"][-1]["tag"] == "0161_atlas_expanded_numerical_terrain", "BOOTSTRAP_RELEASE_SCHEMA: select the reviewed 162-entry release")
        result = []
        for entry in journal["entries"]:
            data = self.run(["git", "show", self.commit + ":drizzle/" + entry["tag"] + ".sql"]).stdout
            lf = data.replace(b"\r\n", b"\n")
            result.append({"timestamp": str(entry["when"]), "hashes": sorted({sha(data), sha(lf), sha(lf.replace(b"\n", b"\r\n"))})})
        return result

    def resources(self):
        import shutil
        mem = {line.split(":")[0]: int(line.split()[1]) * 1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith(("MemAvailable:", "MemTotal:"))}
        info = json.loads(self.docker("info", "--format", "{{json .}}").stdout)
        return {"memoryAvailable": mem["MemAvailable"], "diskFree": min(shutil.disk_usage(self.repo).free, shutil.disk_usage(info["DockerRootDir"]).free)}, info["ID"]

    def legacy_host(self):
        self.stage = "read-only first-time bootstrap preflight"
        context = json.loads(self.docker("context", "inspect").stdout)[0]
        require(context["Endpoints"]["docker"]["Host"].startswith("unix://"), "DOCKER_CONTEXT: local Unix Docker endpoint required")
        old = self.inspect("serriantide")
        require(old["State"]["Running"] and old["HostConfig"]["NetworkMode"] == "host" and old["Config"].get("WorkingDir") == "/app", "BOOTSTRAP_OLD_CONTAINER: retain the existing running /app host-network website")
        require(not old.get("Mounts"), "BOOTSTRAP_MOUNTS_PRESENT: this command is only for the unmounted legacy container")
        data = private_file(self.active_env_file)
        env = parse_env(data)
        actual = dict(item.split("=", 1) for item in old["Config"].get("Env", []) if "=" in item)
        require(all(key not in env and key not in actual for key in ROOT_KEYS), "BOOTSTRAP_ALREADY_CONFIGURED: use the normal A5 updater")
        require(all(actual.get(key) == value for key, value in env.items()), "CONFIG_DRIFT: protected configuration differs from the existing container")
        require("SERRIAN_PROBE_READ_ONLY_ROOTS" not in env, "BOOTSTRAP_CONFIG: remove no safeguards through the runtime environment")
        resources, daemon = self.resources()
        require(resources["memoryAvailable"] >= 1024 * MIB, "PREFLIGHT_MEMORY: retain the working website; reserve for the bounded probe is unavailable")
        code = self.git("show", self.commit + ":ops/bootstrap-probe.mjs")
        result = json.loads(self.docker("exec", "-i", "--workdir", "/app", old["Id"], "node", "--max-old-space-size=64", "--input-type=module", "-e", code, "--", "--bootstrap-probe", data=b'{"mode":"old-storage"}').stdout)
        require(result.get("oldDefaultDirectoriesAbsent"), "BOOTSTRAP_OLD_STORAGE: no existing files may be concealed by new mounts")
        expected = {**self.expected, "ledger": self.ledger()}
        database = self.probe("database", old["Image"], {"expected": expected}, self.active_env_file)
        root = real_directory(self.storage_root)
        require("," not in str(root) and root != self.repo and not root.is_relative_to(self.repo) and not self.repo.is_relative_to(root), "BOOTSTRAP_STORAGE_PATH: permanent storage must be separate from the code checkout")
        storage = self.probe("storage", old["Image"], {"root": str(root)}, mounts=["--mount", f"type=bind,src={root},dst={root},readonly"])
        require(self.http_health(old["Id"], 3003), "BOOTSTRAP_OLD_HEALTH: existing port 3003 must serve the actual Next.js website")
        database["database"].pop("bytes", None)  # Physical allocation can change while the old website remains available.
        report = {"container": old["Id"], "image": old["Image"], "runtimeHash": sha(canonical({"config": old["Config"], "host": old["HostConfig"]})), "envSha256": sha(data), "database": database, "roots": storage["roots"], "daemonId": daemon}
        return {"container": old, "data": data, "env": env, "report": report, "approval": sha(canonical(report)), "resources": resources}

    def candidate_host(self, old):
        mounts = [{"Type": "bind", "Source": str(self.storage_root / kind), "Destination": str(self.storage_root / kind), "RW": True} for kind in KINDS]
        code = self.git("show", self.commit + ":ops/host-probe.mjs")
        probe = json.loads(self.docker("run", "--rm", "-i", "--entrypoint", "node", "--network", "host", "--read-only", "--memory", "512m", "--memory-swap", "512m", "--env-file", str(self.env_file), "-e", "SERRIAN_PROBE_READ_ONLY_ROOTS=1", *self.mount_args({"mounts": mounts}), self.image_id, "--input-type=module", "-", "--probe", data=code.encode()).stdout)
        require(probe["roots"] == old["report"]["roots"] and probe["websiteListen"] in ("127.0.0.1", "0.0.0.0", "::"), "BOOTSTRAP_TARGET_CHANGED: storage or port identity differs")
        return {"container": old["container"], "env": parse_env(self.candidate_data), "mounts": mounts, "report": {"listen": probe["websiteListen"], "roots": probe["roots"], "auth": probe["auth"], "envSha256": sha(self.candidate_data), "database": probe["database"]}}

    def native_pg(self, command, *args, allow_failure=False):
        self.stage = "independent native PostgreSQL " + command
        try:
            result = subprocess.run([str(self.pg_bin / command), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={key: value for key, value in os.environ.items() if key in ("PATH", "LANG", "LC_ALL")}, timeout=180)
        except (OSError, subprocess.TimeoutExpired):
            raise Refused("BOOTSTRAP_RESTORE_TOOLS: matching native PostgreSQL 18 tools must be available") from None
        if result.returncode and not allow_failure:
            self.save("native-pg-failure-" + secrets.token_hex(8) + ".json", {"command": command, "stderr": result.stderr.decode(errors="replace")})
            raise Refused("BOOTSTRAP_RESTORE_CLUSTER: the new isolated restore cluster did not pass; original data is retained")
        return result

    def recovery_helper(self, action, host, **extra):
        self.stage = "fresh signed backup" if action == "backup" else "independent restore and exact data verification"
        request = {"action": action, "directory": str(self.recovery), "runId": self.run_id, "uid": os.getuid(), "gid": os.getgid(), "origin": host["report"]["auth"]["base"], "expected": host["report"]["database"], "roots": {kind: str(self.storage_root / kind) for kind in KINDS}, "frozen": FROZEN, **extra}
        env = self.env_file if action == "backup" else self.recovery / "restore.env"
        roots = self.mount_args(host) if action == "backup" else []
        result = json.loads(self.docker("run", "--rm", "-i", "--user", "0", "--read-only", "--network", "host", "--memory", "2048m", "--memory-swap", "2048m", "--cpus", "1", "--tmpfs", "/tmp:mode=700", "--env-file", str(env), "--mount", f"type=bind,src={self.recovery},dst={self.recovery}", *roots, self.image_id, "node", "--max-old-space-size=1536", "--conditions=react-server", "--import", "tsx", "ops/bootstrap-recovery.ts", data=json.dumps(request).encode()).stdout)
        require(result.get("passed"), "BOOTSTRAP_RECOVERY: independent recovery evidence did not pass")
        self.save("bootstrap-" + action + ".json", result)
        return result

    def prove_recovery(self, host):
        self.recovery_helper("backup", host)
        cluster = self.recovery / "postgres"
        password = secrets.token_hex(32)
        password_file = self.recovery / "postgres-password"
        password_file.write_text(password)
        password_file.chmod(0o600)
        self.native_pg("initdb", "-D", str(cluster), "-U", "postgres", "--auth=scram-sha-256", "--pwfile=" + str(password_file), "--encoding=UTF8", "--locale=C")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        require(port not in (3000, 3003, 5432, 5433, self.expected["port"]), "BOOTSTRAP_RESTORE_PORT: refuse an existing service port")
        restore_env = self.recovery / "restore.env"
        url = f"postgresql://postgres:{password}@127.0.0.1:{port}/"
        restore_env.write_text("SERRIAN_INFRA_BOOTSTRAP_ADMIN=" + url + "postgres\nSERRIAN_INFRA_BOOTSTRAP_TARGET=" + url + "serrian_bootstrap_" + self.run_id + "\n")
        restore_env.chmod(0o600)
        attempted = False
        try:
            attempted = True
            # A complete constrained restore holds thousands of relation locks in
            # one transaction. The small connection budget must not shrink the
            # new cluster's lock table below the full schema's requirement.
            self.native_pg("pg_ctl", "-D", str(cluster), "-l", str(self.recovery / "postgres.log"), "-o", f"-h 127.0.0.1 -p {port} -k '' -c jit=off -c shared_buffers=64MB -c max_connections=12 -c max_locks_per_transaction=1024 -c max_parallel_workers=0 -c max_parallel_maintenance_workers=0 -c max_worker_processes=0 -c autovacuum=off -c maintenance_work_mem=64MB -c work_mem=4MB", "-w", "start")
            self.recovery_helper("restore", host, port=port)
        finally:
            if attempted:
                self.native_pg("pg_ctl", "-D", str(cluster), "-m", "fast", "-w", "stop", allow_failure=True)
                status = self.native_pg("pg_ctl", "-D", str(cluster), "status", allow_failure=True)
                require(status.returncode == 3, "BOOTSTRAP_RESTORE_STILL_RUNNING: retain the new cluster and stop for review")
        self.save("bootstrap-restore-stopped.json", {"stopped": True, "database": "serrian_bootstrap_" + self.run_id, "port": port, "originalDatabaseRestoredOrMigrated": False})

    def check(self, host, image, source_hash, frozen=False):
        result = super().check(host, image, source_hash, frozen)
        if self.in_cutover and frozen and not self.recovery_verified:
            require(private_file(self.active_env_file) == self.original_data, "BOOTSTRAP_CONFIG_CHANGED: active configuration changed")
            self.probe("database", image, {"expected": {**self.expected, "ledger": self.ledger()}}, self.active_env_file)
            changes = self.docker("diff", host["container"]["Id"]).stdout.decode().splitlines()
            protected = ("/app/storage/world-terrain", "/app/storage/atlas-assets", "/app/storage/world-raster")
            require(not any(any(line[2:] == root or line[2:].startswith(root + "/") for root in protected) for line in changes), "BOOTSTRAP_OLD_STORAGE_CHANGED: retain newly created old-container storage for review")
            try:
                self.prove_recovery(host)
            except Exception as error:
                import traceback
                self.save("bootstrap-recovery-failure.json", {"stage": self.stage, "type": type(error).__name__, "trace": traceback.format_exc()})
                raise
            after = super().check(host, image, source_hash, frozen=True)
            require(after["stateHash"] == result["stateHash"], "BOOTSTRAP_SOURCE_CHANGED: source differs after independent restoration")
            self.recovery_verified = True
        elif self.in_cutover and not frozen:
            require(self.recovery_verified, "BOOTSTRAP_RECOVERY_REQUIRED: no unverified cutover")
            replace_configuration(self.active_env_file, self.original_data, self.candidate_data, self.original_mode)
            self.config_activated = True
            self.env_file = self.active_env_file
            self.save("bootstrap-configuration-activated.json", {"activated": True, "originalSha256": sha(self.original_data), "activeSha256": sha(self.candidate_data), "originalPreservedAt": str(self.output / "original.env")})
        return result

    def bootstrap(self, freeze):
        require(os.name == "posix" and os.geteuid() != 0, "BOOTSTRAP_OPERATOR: run as the normal Ubuntu operator, not sudo/root")
        require(freeze == FROZEN, "FREEZE: fence all other jobs/import/direct database and file writers")
        os.umask(0o077)
        self.fetch()
        parent = Path(self.git("rev-parse", "--absolute-git-dir")) / "serrian-deployment"
        parent.mkdir(mode=0o700, exist_ok=True)
        require(not parent.is_symlink() and stat.S_IMODE(parent.stat().st_mode) == 0o700, "DIAGNOSTICS_PRIVATE: private operator directory required")
        self.output = parent / self.run_id
        self.output.mkdir(mode=0o700)
        import fcntl
        with (parent / "lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Refused("DEPLOYMENT_BUSY: another operator holds the deployment lock") from None
            old = self.legacy_host()
            with self.daemon_lock(old["container"]["Image"]):
                for binary in ("initdb", "pg_ctl", "postgres"):
                    version = self.native_pg(binary, "--version").stdout.decode()
                    require(" 18." in version, "BOOTSTRAP_RESTORE_TOOLS: native PostgreSQL 18 tools are required for matching Ubuntu restoration")
                self.original_data = old["data"]
                original_stat = self.active_env_file.lstat()
                require(original_stat.st_uid == os.getuid() and original_stat.st_gid == os.getgid(), "BOOTSTRAP_CONFIG_OWNER: retain the existing configuration owner and group")
                self.original_mode = stat.S_IMODE(original_stat.st_mode)
                with (self.output / "original.env").open("xb") as stream:
                    stream.write(self.original_data)
                self.candidate_data = candidate_configuration(self.original_data, self.storage_root)
                self.env_file = self.output / "candidate.env"
                with self.env_file.open("xb") as stream:
                    stream.write(self.candidate_data)
                image = "serriantide:" + self.commit
                exists = self.docker("image", "inspect", image, allow_failure=True).returncode == 0
                resource_check(old["resources"]["memoryAvailable"], old["resources"]["diskFree"], build_mib=2048 if exists else 4096)
                self.update()
                archive, source_hash = self.expected_source()
                if not exists:
                    self.build(archive, image)
                self.image_id = self.checked_image(image, source_hash)
                host = self.candidate_host(old)
                super().check(host, self.image_id, source_hash)
                self.smoke(self.image_id)
                current = self.legacy_host()
                require(current["approval"] == old["approval"], "BOOTSTRAP_HOST_CHANGED: source configuration, storage or database changed during build")
                resource_check(current["resources"]["memoryAvailable"], current["resources"]["diskFree"], build_mib=2048)
                recovery_parent = Path.home() / ".serrian-bootstrap-recovery"
                recovery_parent.mkdir(mode=0o700, exist_ok=True)
                real_directory(recovery_parent)
                require(stat.S_IMODE(recovery_parent.stat().st_mode) == 0o700, "BOOTSTRAP_RECOVERY_PERMISSIONS: private recovery parent required")
                self.recovery = recovery_parent / self.run_id
                self.recovery.mkdir(mode=0o700)
                (self.recovery / "ownership").write_text("serrian-bootstrap:" + self.run_id + "\n")
                self.save("bootstrap-plan.json", {"original": old["report"], "storage": str(self.storage_root), "recovery": str(self.recovery), "commit": self.commit, "candidateEnvSha256": sha(self.candidate_data), "migrationsRun": False})
                print("BOOTSTRAP: checks passed; stopping only serriantide for signed backup, independent restore and website cutover.", flush=True)
                self.in_cutover = True
                try:
                    result = self.cutover(host, self.image_id, source_hash)
                except Exception:
                    if private_file(self.active_env_file) == self.candidate_data:
                        # Preserve concurrent edits. An unsafe rollback keeps the new config with both retained containers.
                        if self.inspect(old["container"]["Id"])["State"]["Running"]:
                            replace_configuration(self.active_env_file, self.candidate_data, self.original_data, self.original_mode)
                            self.save("bootstrap-configuration-restored.json", {"originalRestored": True})
                    raise
                finally:
                    self.in_cutover = False
                result.update({"bootstrap": True, "recoveryVerified": self.recovery_verified, "recoveryDirectory": str(self.recovery), "normalUpdaterReady": True, "pgAdminBackupIndependentlyVerified": False, "freshSignedBackupIndependentlyRestored": True})
                self.save("bootstrap-success.json", result)
                return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="/apps/serrian-tide-next")
    parser.add_argument("--commit", required=True)
    parser.add_argument("--storage-root", default="/apps/serrian-tide-data")
    parser.add_argument("--database-name", default="serrian_tide_prod")
    parser.add_argument("--database-role", default="serrian_tide_app")
    parser.add_argument("--database-port", type=int, default=5432)
    parser.add_argument("--env-file")
    parser.add_argument("--frozen", required=True)
    args = parser.parse_args()
    def interrupted(_signal, _frame):
        raise Refused("INTERRUPTED: preserve bootstrap receipts; source data is never restored or migrated")
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    op = Bootstrap(args.repo, args.commit, args.storage_root, {"name": args.database_name, "role": args.database_role, "port": args.database_port}, args.env_file)
    try:
        print(json.dumps(op.bootstrap(args.frozen), indent=2))
        return 0
    except Exception as error:
        print(str(error) if isinstance(error, Refused) else "BOOTSTRAP_REFUSED: retain the current environment and private diagnostic receipts; no secret details printed")
        failure = getattr(op, "last_failure", None)
        if failure:
            safe = re.search(r"(?:HOST_PROBE_FAILED|WEBSITE_PREFLIGHT_FAILED): ([A-Z_]+)(?:\r?\n|$)", failure["stderr"])
            if safe:
                print("Failed check: " + safe.group(1))
        if op.output:
            import traceback
            op.save("bootstrap-exception.json", {"type": type(error).__name__, "trace": traceback.format_exc()})
            op.save("bootstrap-failure.json", {"passed": False, "stage": op.stage, "commit": op.commit, "diagnostics": str(op.output), "manualReviewRequired": True})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
