#!/usr/bin/env python3
"""Reviewed website deployment only. No SSH, restore, migration or broad cleanup.

Host preflight is read-only. All mutations require the explicit deploy verb.
Docker inspect/env values are kept in memory and never printed or logged.
"""
import argparse
from contextlib import contextmanager
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tarfile
import time
import uuid
import urllib.request

GIB = 1024 ** 3
MIB = 1024 ** 2
ROOT_KEYS = ("SERRIAN_TERRAIN_ROOT", "SERRIAN_ASSET_ROOT", "SERRIAN_RASTER_ROOT")
RELEASE_DIRS = ("src/", "data/", "public/", "ops/", "scripts/", "drizzle/")
RELEASE_FILES = ("package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "eslint.config.mjs", "Dockerfile", ".dockerignore")
FROZEN = "ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED"


class Refused(Exception):
    """Messages are fixed, secret-free operator diagnostics."""


def require(value, message):
    if not value:
        raise Refused(message)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def private_file(file):
    try:
        s = file.lstat()
    except OSError:
        raise Refused("CONFIG_UNREADABLE: the protected production env file is missing or inaccessible") from None
    require(stat.S_ISREG(s.st_mode) and not file.is_symlink() and s.st_mode & 0o077 == 0 and s.st_mode & 0o400 and s.st_size <= MIB, "CONFIG_PRIVATE: use a readable regular 0600/0400 production env file")
    try:
        return file.read_bytes()
    except OSError:
        raise Refused("CONFIG_UNREADABLE: the protected production env file cannot be read") from None


def parse_env(data):
    result = {}
    for line in data.decode("utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition("=")
        require(sep and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) and key not in result and "\0" not in value, "ENV_FORMAT: use explicit unique Docker KEY=value entries, without shell export or interpolation")
        result[key] = value
    return result


def resource_check(available, disk_free, build_mib=4096, reserve_mib=2048):
    require(available >= (build_mib + reserve_mib) * MIB, "MEMORY_LOW: leave the running website intact; sufficient build/runtime allowance plus host reserve is unavailable")
    require(disk_free >= 12 * GIB, "DISK_LOW: retain the running website/images; at least 12 GiB free is required on checkout and Docker storage")


def mapped_roots(container, env, probe):
    mounts = []
    for key, kind in zip(ROOT_KEYS, ("terrain", "artwork", "raster")):
        root = env.get(key, "")
        require(root.startswith("/") and str(PurePosixPath(root)) == root and root == probe["roots"][kind]["path"], "ROOT_IDENTITY: explicit resolved storage roots are required")
        candidates = [m for m in container.get("Mounts", []) if root == m["Destination"] or root.startswith(m["Destination"].rstrip("/") + "/")]
        require(candidates, "ROOT_NOT_PERSISTENT: a private root has no existing persistent mount; do not replace the live container")
        mount = max(candidates, key=lambda m: len(m["Destination"]))
        require(mount["Type"] in ("bind", "volume") and mount.get("RW") and mount.get("Source") and "," not in mount["Source"] + mount["Destination"], "ROOT_MOUNT: preserve explicit writable bind/named-volume storage")
        if mount["Type"] == "volume":
            require(mount.get("Name"), "ROOT_VOLUME: an identified named volume is required")
        require(mount["Destination"] not in ("/", "/app", "/app/public") and "docker.sock" not in mount["Source"], "ROOT_MOUNT: storage must not replace application code or expose the Docker socket")
        if mount not in mounts:
            mounts.append(mount)
    for mount in container.get("Mounts", []):
        if mount in mounts or mount["Destination"] == "/app/.next/cache":
            continue
        require(not mount.get("RW"), "UNREVIEWED_WRITABLE_MOUNT: preserve and review additional persistent authorities before replacement")
        require(mount["Type"] in ("bind", "volume") and mount.get("Source") and mount["Destination"] not in ("/", "/app", "/app/node_modules") and "docker.sock" not in mount["Source"] and "," not in mount["Source"] + mount["Destination"], "UNSAFE_EXTRA_MOUNT: review extra mounts before replacement")
        mounts.append(mount)
    return sorted(mounts, key=lambda m: m["Destination"])


class Operator:
    def __init__(self, repo, commit, env_file=None):
        self.repo = Path(repo).resolve()
        self.commit = commit
        self.env_file = Path(env_file or self.repo / ".env.production").absolute()
        self.run_id = uuid.uuid4().hex
        self.output = None
        self.stage = "initial"

    def run(self, args, data=None, log=False, allow_failure=False):
        try:
            p = subprocess.run(args, cwd=self.repo, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        except OSError:
            raise Refused("TOOL_UNAVAILABLE: install the documented local Git/Python/Docker Buildx prerequisites") from None
        if log and self.output:
            with (self.output / "build.log").open("ab") as stream:
                stream.write(p.stdout + p.stderr)
        if p.returncode and not allow_failure:
            safe = re.search(rb"(?:HOST_PROBE_FAILED|WEBSITE_PREFLIGHT_FAILED): ([A-Z_]+)(?:\r?\n|$)", p.stderr)
            if safe:
                raise Refused("PREFLIGHT_REFUSED: " + safe.group(1).decode() + "; current data is retained")
            raise Refused("COMMAND_FAILED: " + self.stage + "; diagnostics are retained privately, no secret command output is printed")
        return p

    def git(self, *args):
        return self.run(["git", *args]).stdout.decode().strip()

    def docker(self, *args, **kwargs):
        return self.run(["docker", *args], **kwargs)

    def inspect(self, name, image=False):
        args = ("image", "inspect", name) if image else ("inspect", name)
        return json.loads(self.docker(*args).stdout)[0]

    def fetch(self):
        require(re.fullmatch(r"[a-f0-9]{40}", self.commit), "COMMIT: select a reviewed full commit SHA")
        self.stage = "fetch reviewed main"
        require(self.git("branch", "--show-current") == "main", "BRANCH: work only on main; no reset or new checkout is performed")
        remote = self.git("remote", "get-url", "origin")
        require(remote in ("https://github.com/Revty79/serrian-tide-website.git", "https://github.com/Revty79/serrian-tide-website", "git@github.com:Revty79/serrian-tide-website.git", "git@github.com:Revty79/serrian-tide-website"), "ORIGIN: unexpected repository")
        self.git("fetch", "--no-tags", "origin", "main")
        self.git("merge-base", "--is-ancestor", self.commit, "origin/main")
        self.git("merge-base", "--is-ancestor", "HEAD", self.commit)

    def update(self):
        self.stage = "preserve checkout and fast-forward"
        require(not self.git("diff", "--name-only") and not self.git("diff", "--cached", "--name-only"), "DIRTY_TRACKED: preserve and review local edits; nothing is reset, stashed or cleaned")
        tracked = set(self.git("ls-tree", "-r", "--name-only", self.commit).splitlines())
        for name in ("Dockerfile", ".dockerignore"):
            source = self.repo / name
            if source.exists() and not self.git("ls-files", "--", name) and name in tracked:
                require(source.is_file() and not source.is_symlink(), "DOCKER_CONFLICT: expected an ordinary untracked Docker file")
                destination = self.output / ("preserved-" + name.lstrip("."))
                original = sha(source.read_bytes())
                shutil.move(str(source), destination)
                require(sha(destination.read_bytes()) == original, "PRESERVATION_FAILED: keep the private conflict copy")
        self.git("merge", "--ff-only", self.commit)
        require(self.git("rev-parse", "HEAD") == self.commit, "COMMIT: checkout differs from requested release")

    def host(self):
        self.stage = "read-only host preflight"
        require(os.name == "posix", "HOST: run this operator on the reviewed Ubuntu host, not Windows")
        context = json.loads(self.docker("context", "inspect").stdout)[0]
        require(context["Endpoints"]["docker"]["Host"].startswith("unix://"), "DOCKER_CONTEXT: only the local host Docker daemon is supported")
        container = self.inspect("serriantide")
        require(container["State"]["Running"] and container["HostConfig"]["NetworkMode"] == "host", "LIVE_CONTAINER: expected the existing running host-network serriantide container")
        data = private_file(self.env_file)
        env = parse_env(data)
        actual_env = dict(v.split("=", 1) for v in container["Config"].get("Env", []) if "=" in v)
        for key in (*ROOT_KEYS, "DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_TRUSTED_ORIGINS"):
            require(env.get(key) == actual_env.get(key), "CONFIG_DRIFT: protected env and running container differ; review before replacement")
        mem = {line.split(":")[0]: int(line.split()[1]) * 1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith(("MemAvailable:", "MemTotal:"))}
        require(mem["MemAvailable"] >= 1024 * MIB, "PREFLIGHT_MEMORY: retain the running site; reserve 512 MiB beyond the bounded 512 MiB read-only probe")
        declared = {"roots": {kind: {"path": env.get(key, "")} for key, kind in zip(ROOT_KEYS, ("terrain", "artwork", "raster"))}}
        provisional = {"mounts": mapped_roots(container, env, declared)}
        probe_source = self.git("show", self.commit + ":ops/host-probe.mjs")
        probe_args = ["run", "--rm", "-i", "--name", "serrian-a5-probe-" + self.run_id, "--entrypoint", "node", "--network", "host", "--read-only", "--memory", "512m", "--memory-swap", "512m", "--env-file", str(self.env_file), "-e", "SERRIAN_PROBE_READ_ONLY_ROOTS=1", *self.mount_args(provisional), container["Image"], "--max-old-space-size=256", "--input-type=module", "-", "--probe"]
        probe = json.loads(self.docker(*probe_args, data=probe_source.encode()).stdout)
        require(probe.get("websiteListen") in ("127.0.0.1", "0.0.0.0", "::"), "WEBSITE_PORT: no supported existing listener on 3003; preserve the container and review")
        mounts = mapped_roots(container, env, probe)
        info = json.loads(self.docker("info", "--format", "{{json .}}").stdout)
        free = min(shutil.disk_usage(self.repo).free, shutil.disk_usage(info["DockerRootDir"]).free)
        report = {"version": 1, "container": container["Id"], "image": container["Image"], "network": "host", "port": 3003, "listen": probe["websiteListen"], "envSha256": sha(data), "envFile": str(self.env_file), "mounts": [{k: m.get(k) for k in ("Type", "Name", "Source", "Destination", "RW")} for m in mounts], "roots": probe["roots"], "database": probe["database"], "auth": probe["auth"], "daemonId": info["ID"]}
        # Live free memory/space fluctuate and are deliberately outside approval identity.
        return {"report": report, "approval": sha(canonical(report)), "resources": {"memoryAvailable": mem["MemAvailable"], "diskFree": free}, "container": container, "env": env, "mounts": mounts}

    def mount_args(self, host, read_only=True):
        args = []
        for m in host["mounts"]:
            source = m["Name"] if m["Type"] == "volume" else m["Source"]
            value = f'type={m["Type"]},src={source},dst={m["Destination"]}' + (",readonly" if read_only or not m.get("RW") else "")
            args += ["--mount", value]
        return args

    def expected_source(self):
        archive = self.run(["git", "archive", "--format=tar", self.commit, *[p.rstrip("/") for p in RELEASE_DIRS], *RELEASE_FILES]).stdout
        h = hashlib.sha256()
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            files = [m for m in tar.getmembers() if m.isfile() and (m.name.startswith(RELEASE_DIRS) or m.name in RELEASE_FILES)]
            require(set(RELEASE_FILES).issubset(m.name for m in files), "SOURCE_INPUTS: required tracked release input missing")
            for member in sorted(files, key=lambda m: m.name):
                h.update(member.name.encode() + b"\0")
                h.update(tar.extractfile(member).read())
        return archive, h.hexdigest()

    def build(self, archive, image):
        self.stage = "bounded immutable build"
        builder = "serrian-a5-" + self.run_id
        created = False
        completed = False
        try:
            self.docker("buildx", "version")
            self.docker("buildx", "create", "--name", builder, "--driver", "docker-container", "--driver-opt", "memory=4096m,memory-swap=4096m,cpu-period=100000,cpu-quota=100000,restart-policy=no")
            created = True
            self.docker("buildx", "inspect", builder, "--bootstrap")
            limits = self.inspect("buildx_buildkit_" + builder + "0")["HostConfig"]
            require(limits["Memory"] == 4096 * MIB and limits["MemorySwap"] == 4096 * MIB and limits["CpuPeriod"] == 100000 and limits["CpuQuota"] == 100000, "BUILDER_LIMITS: bounded container driver configuration was not applied")
            self.docker("buildx", "build", "--builder", builder, "--load", "--target", "website", "--build-arg", "SERRIAN_BUILD_COMMIT=" + self.commit, "--build-arg", "SERRIAN_BUILD_HEAP_MIB=2560", "--build-arg", "SERRIAN_BUILD_CPUS=1", "--tag", image, "-", data=archive, log=True)
            completed = True
        finally:
            if created:
                observed = self.docker("exec", "buildx_buildkit_" + builder + "0", "cat", "/sys/fs/cgroup/memory.peak", allow_failure=True)
                events = self.docker("exec", "buildx_buildkit_" + builder + "0", "cat", "/sys/fs/cgroup/memory.events", allow_failure=True)
                self.save("build-resources.json", {"completed": completed, "memoryLimitBytes": 4096 * MIB, "nodeHeapMiB": 2560, "cpuQuota": 1, "observedBuilderPeakBytes": observed.stdout.decode().strip() if observed.returncode == 0 else None, "memoryEvents": events.stdout.decode().strip() if events.returncode == 0 else None})
                # Only the new task-owned builder/cache; never prune images or services.
                self.docker("buildx", "rm", builder, allow_failure=True)

    def checked_image(self, image, source_hash):
        self.stage = "image identity"
        metadata = self.inspect(image, image=True)
        require(metadata["Config"]["Labels"].get("org.opencontainers.image.revision") == self.commit, "IMAGE_COMMIT: immutable tag is occupied by another release")
        require(metadata["Config"]["Cmd"] == ["node", "ops/website-start.mjs"], "IMAGE_MODE: candidate must launch Next.js, not maintenance/recovery")
        code = "import{verifyBuild}from'./ops/stamp-build.mjs';const r=await verifyBuild(process.cwd(),process.env.SERRIAN_RELEASE_COMMIT);if(r.sourceHash!==process.env.SERRIAN_EXPECTED_SOURCE_HASH)throw Error('SOURCE');console.log(JSON.stringify(r));"
        self.docker("run", "--rm", "--network", "none", "--read-only", "--memory", "2048m", "--memory-swap", "2048m", "-e", "SERRIAN_RELEASE_COMMIT=" + self.commit, "-e", "SERRIAN_EXPECTED_SOURCE_HASH=" + source_hash, metadata["Id"], "node", "--input-type=module", "-e", code)
        return metadata["Id"]

    def check(self, host, image, source_hash, frozen=False):
        self.stage = "frozen rollback witness" if frozen else "read-only database/storage/auth/schema preflight"
        args = ["run", "--rm", "--network", "host", "--read-only", "--memory", "2048m", "--memory-swap", "2048m", "--env-file", str(self.env_file), "-e", "SERRIAN_RELEASE_COMMIT=" + self.commit, "-e", "SERRIAN_EXPECTED_SOURCE_HASH=" + source_hash, "-e", "SERRIAN_PROBE_READ_ONLY_ROOTS=1", *self.mount_args(host), image, "node", "--conditions=react-server", "--import", "tsx", "ops/website-check.ts", "--frozen" if frozen else "--check"]
        result = json.loads(self.docker(*args).stdout)
        require(result.get("passed") and result.get("commit") == self.commit, "PREFLIGHT_RESULT: candidate refused")
        require(result["roots"] == host["report"]["roots"] and result["auth"] == host["report"]["auth"], "TARGET_CHANGED: root/auth identity differs")
        return result

    def http_health(self, name, port):
        if self.inspect(name)["HostConfig"]["NetworkMode"] == "host":
            try:
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(f"http://127.0.0.1:{port}/login", timeout=4) as response:
                    html = response.read(4 * MIB)
                    return response.status == 200 and response.headers.get("x-powered-by") == "Next.js" and b"<html" in html and b"applicationRunning" not in html
            except (OSError, ValueError):
                return False
        code = "const r=await fetch('http://127.0.0.1:' + process.argv[1] + '/login',{redirect:'manual',signal:AbortSignal.timeout(4000)});const s=await r.text();if(r.status!==200||!s.includes('<html')||r.headers.get('x-powered-by')!=='Next.js'||s.includes('applicationRunning'))process.exit(1);console.log('REAL_NEXT_LOGIN_OK');"
        return self.docker("exec", name, "node", "-e", code, str(port), allow_failure=True).returncode == 0

    def await_health(self, name, port):
        for _ in range(90):
            state = self.inspect(name)["State"]
            if not state["Running"]:
                return False
            if self.http_health(name, port):
                return True
            time.sleep(2)
        return False

    def smoke(self, image):
        self.stage = "isolated real Next.js smoke"
        name = "serrian-a5-smoke-" + self.run_id
        created = False
        try:
            self.docker("create", "--name", name, "--network", "none", "--read-only", "--memory", "2048m", "--memory-swap", "2048m", "--tmpfs", "/tmp:uid=1000,gid=1000,mode=700", "--tmpfs", "/app/.next/cache:uid=1000,gid=1000,mode=700", "-e", "PORT=3000", image, "node", "ops/website-start.mjs", "--smoke")
            created = True
            self.docker("start", name)
            require(self.await_health(name, 3000), "SMOKE_FAILED: real Next.js candidate failed; old website untouched")
        finally:
            if created:
                self.docker("stop", "--time", "15", name, allow_failure=True)
                self.docker("rm", name, allow_failure=True)

    def deploy(self, approval, freeze):
        require(freeze == FROZEN, "FREEZE: explicitly fence all other jobs/import/direct file and database writers")
        git_dir = Path(self.git("rev-parse", "--absolute-git-dir"))
        output_parent = git_dir / "serrian-deployment"
        output_parent.mkdir(mode=0o700, exist_ok=True)
        require(not output_parent.is_symlink() and output_parent.stat().st_mode & 0o077 == 0, "DIAGNOSTICS_PRIVATE: protected Git operator directory required")
        self.output = output_parent / self.run_id
        self.output.mkdir(mode=0o700)
        # One operator at a time, without terminating another deployment.
        import fcntl
        with (output_parent / "lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Refused("DEPLOYMENT_BUSY: another deployment owns the lock") from None
            self.fetch()
            host = self.host()
            with self.daemon_lock(host["container"]["Image"]):
                return self.deploy_locked(host, approval)

    @contextmanager
    def daemon_lock(self, image):
        # A Docker name reservation also fences another checkout on this daemon.
        # It is never started and receives no environment or private data mount.
        metadata = self.inspect(image, image=True)
        overrides = []
        for destination in (metadata["Config"].get("Volumes") or {}):
            require(destination.startswith("/") and "," not in destination, "LOCK_IMAGE: unsupported declared volume")
            overrides += ["--tmpfs", destination]
        created = self.docker("create", "--name", "serriantide-deployment-lock", "--network", "none", "--read-only", "--entrypoint", "/bin/false", "--label", "org.serriantide.deployment-run=" + self.run_id, *overrides, image)
        identity = created.stdout.decode().strip()
        require(re.fullmatch(r"[a-f0-9]{64}", identity), "DEPLOYMENT_LOCK: cannot establish exclusive daemon ownership")
        self.save("daemon-lock.json", {"container": identity, "run": self.run_id})
        try:
            yield
        finally:
            self.docker("rm", identity, allow_failure=True)

    def deploy_locked(self, host, approval):
        require(host["approval"] == approval, "HOST_APPROVAL: run the read-only preflight and review its exact identity first")
        image = "serriantide:" + self.commit
        existing_image = self.docker("image", "inspect", image, allow_failure=True).returncode == 0
        resource_check(host["resources"]["memoryAvailable"], host["resources"]["diskFree"], build_mib=2048 if existing_image else 4096)
        self.update()
        archive, source_hash = self.expected_source()
        if not existing_image:
            self.build(archive, image)
        image_id = self.checked_image(image, source_hash)
        self.check(host, image_id, source_hash)
        self.smoke(image_id)
        current = self.host()
        require(current["approval"] == approval, "HOST_CHANGED: live image, configuration, roots or database identity changed during build")
        resource_check(current["resources"]["memoryAvailable"], current["resources"]["diskFree"], build_mib=2048)
        old = host["container"]
        # Repeat update of the same verified running image is harmless.
        if old["Image"] == image_id and old["Config"].get("Cmd") == ["node", "ops/website-start.mjs"] and old["HostConfig"].get("ReadonlyRootfs"):
            require(self.http_health(old["Id"], 3003), "CURRENT_HEALTH: matching image is not serving the real application")
            return {"passed": True, "unchanged": True, "commit": self.commit, "image": image_id}
        return self.cutover(host, image_id, source_hash)
    def cutover(self, host, image_id, source_hash):
        self.stage = "application-only cutover"
        old = host["container"]
        rollback = "serriantide-rollback-" + self.run_id
        failed = "serriantide-failed-" + self.run_id
        policy = old["HostConfig"]["RestartPolicy"]
        restart = policy["Name"] + ((":" + str(policy["MaximumRetryCount"])) if policy["Name"] == "on-failure" and policy["MaximumRetryCount"] else "")
        before = None
        renamed = False
        new_id = None
        old_stopped = False
        self.save("cutover-plan.json", {"oldContainer": old["Id"], "oldImage": old["Image"], "newImage": image_id, "rollbackName": rollback, "originalRestart": restart, "commit": self.commit})
        try:
            self.docker("update", "--restart=no", old["Id"])
            self.docker("stop", "--time", "30", old["Id"])
            require(not self.inspect(old["Id"])["State"]["Running"], "OLD_WRITER_ACTIVE: abort replacement")
            old_stopped = True
            before = self.check(host, image_id, source_hash, frozen=True)["stateHash"]
            self.save("frozen-witness.json", {"stateHash": before, "oldContainer": old["Id"], "databaseAndFilesFrozen": True})
            self.docker("rename", old["Id"], rollback)
            renamed = True
            created = self.docker("create", "--name", "serriantide", "--network", "host", "--restart=no", "--read-only", "--memory", "2048m", "--memory-swap", "2048m", "--env-file", str(self.env_file), "-e", "PORT=3003", "-e", "SERRIAN_WEBSITE_LISTEN=" + host["report"]["listen"], "-e", "SERRIAN_RELEASE_COMMIT=" + self.commit, "-e", "SERRIAN_EXPECTED_SOURCE_HASH=" + source_hash, "--tmpfs", "/tmp:uid=1000,gid=1000,mode=700", "--tmpfs", "/app/.next/cache:uid=1000,gid=1000,mode=700", *self.mount_args(host, read_only=False), image_id)
            new_id = created.stdout.decode().strip()
            require(re.fullmatch(r"[a-f0-9]{64}", new_id), "NEW_CONTAINER_ID: retain current state for operator review")
            self.save("new-container.json", {"id": new_id, "image": image_id})
            self.docker("start", new_id)
            require(self.await_health(new_id, 3003), "NEW_APPLICATION_HEALTH: real website did not become healthy")
            self.check(host, image_id, source_hash)
            require(sha(private_file(self.env_file)) == host["report"]["envSha256"], "CONFIG_CHANGED: retain both containers for review")
            self.docker("update", "--restart=" + restart, new_id)
            result = {"passed": True, "commit": self.commit, "image": image_id, "port": 3003, "realApplication": True, "rollbackContainer": rollback, "rollbackImage": old["Image"], "databaseMigrated": False, "automaticRollbackAfterFutureWrites": False}
            self.save("success.json", result)
            return result
        except Exception:
            if not old_stopped:
                self.docker("update", "--restart=" + restart, old["Id"], allow_failure=True)
            # Stop any new writer before comparing; never start two applications.
            if new_id:
                self.docker("stop", "--time", "30", new_id)
                require(not self.inspect(new_id)["State"]["Running"], "UNSAFE_ROLLBACK: new writer could not be stopped; old remains stopped")
                self.docker("rename", new_id, failed)
            unchanged = before is None and new_id is None
            if before is not None:
                try:
                    unchanged = self.check(host, image_id, source_hash, frozen=True)["stateHash"] == before
                except Exception:
                    unchanged = False
            if old_stopped and unchanged:
                if renamed:
                    self.docker("rename", old["Id"], "serriantide")
                self.docker("update", "--restart=" + restart, old["Id"])
                self.docker("start", old["Id"])
                require(self.await_health(old["Id"], 3003), "ROLLBACK_HEALTH: prior exact container needs operator review")
                self.save("rollback.json", {"automaticRollback": True, "databaseAndFilesUnchanged": True, "oldContainer": old["Id"], "oldImage": old["Image"], "failedContainer": failed if new_id else None})
                raise Refused("DEPLOY_FAILED_ROLLED_BACK: exact previous container restored; no database/file change was observed") from None
            self.save("unsafe-rollback.json", {"automaticRollback": False, "reason": "state changed or equality not provable", "oldContainer": old["Id"], "newContainer": new_id, "bothRetained": True})
            raise Refused("UNSAFE_ROLLBACK: accepted writes, migration, file changes or an unavailable witness prevent automatic rollback; retain both containers and use the reviewed recovery procedure") from None

    def save(self, name, value):
        if self.output:
            with (self.output / name).open("x") as stream:
                json.dump(value, stream, indent=2)


def main():
    import signal
    def interrupted(_signal, _frame):
        raise Refused("INTERRUPTED: retain the private deployment receipts; cutover rollback requires its unchanged-state proof")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("verb", choices=("preflight", "deploy"))
    parser.add_argument("--repo", default="/apps/serrian-tide-next")
    parser.add_argument("--commit", required=True)
    parser.add_argument("--env-file")
    parser.add_argument("--approve-host")
    parser.add_argument("--frozen")
    args = parser.parse_args()
    os.umask(0o077)
    op = Operator(args.repo, args.commit, args.env_file)
    try:
        if args.verb == "preflight":
            require(re.fullmatch(r"[a-f0-9]{40}", args.commit), "COMMIT: exact reviewed SHA required")
            host = op.host()
            print(json.dumps({"readOnlyPreflight": True, "hostApproval": host["approval"], **host["report"], "resources": host["resources"], "liveDeploymentPerformed": False}, indent=2))
        else:
            print(json.dumps(op.deploy(args.approve_host, args.frozen), indent=2))
    except (Refused, OSError, ValueError, KeyError, subprocess.SubprocessError):
        # No traceback/URLs/env/SQL reaches the terminal.
        import sys
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, Refused) else "DEPLOYMENT_REFUSED: review configuration and protected diagnostics; no secret details printed", file=sys.stderr)
        if op.output:
            op.save("failure.json", {"passed": False, "stage": op.stage, "commit": op.commit, "diagnostics": str(op.output), "manualReviewRequired": True})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
