"""No daemon, owner files or network: real disposable Git plus modeled cutovers."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from ubuntu_deploy import Operator, Refused, GIB, MIB, parse_env, resource_check, mapped_roots, private_file


class Cutover(Operator):
    def __init__(self, healthy=True, changed=False, check_failed=False, create_failed=False):
        super().__init__(".", "a" * 40)
        self.events = []
        self.states = {"old": True}
        self.healthy, self.changed = healthy, changed
        self.check_failed, self.create_failed = check_failed, create_failed
        self.new = "b" * 64
        self.witnesses = 0

    def docker(self, *args, **kwargs):
        self.events.append(args)
        if args[0] == "create":
            if self.create_failed:
                raise Refused("CREATE_FAILED")
            self.states[self.new] = False
            return subprocess.CompletedProcess(args, 0, self.new.encode(), b"")
        if args[0] == "stop":
            self.states[args[-1]] = False
        if args[0] == "start":
            target = args[-1]
            self.assert_single_writer(target)
            self.states[target] = True
        return subprocess.CompletedProcess(args, 0, b"", b"")

    def assert_single_writer(self, target):
        if any(v for k, v in self.states.items() if k != target):
            raise AssertionError("two writers started")

    def inspect(self, name, image=False):
        return {"State": {"Running": self.states[name]}}

    def check(self, host, image, source_hash, frozen=False):
        if frozen:
            self.witnesses += 1
            if self.check_failed and self.witnesses > 1:
                raise Refused("UNAVAILABLE_WITNESS")
            return {"stateHash": "changed" if self.changed and self.witnesses > 1 else "same"}
        return {"passed": True}

    def await_health(self, name, port):
        return True if name == "old" else self.healthy

    def mount_args(self, host, read_only=True):
        return []

    def save(self, name, value):
        self.events.append(("receipt", name, value))


class DeploymentTests(unittest.TestCase):
    def host(self, env_file):
        return {"container": {"Id": "old", "Image": "old-exact-image", "HostConfig": {"RestartPolicy": {"Name": "unless-stopped", "MaximumRetryCount": 0}}}, "report": {"listen": "127.0.0.1", "envSha256": __import__("hashlib").sha256(env_file.read_bytes()).hexdigest()}}

    def case(self, **kwargs):
        task = tempfile.TemporaryDirectory(prefix="serrian-a5-unit-")
        self.addCleanup(task.cleanup)
        env = Path(task.name) / "runtime.env"
        env.write_text("EXAMPLE=synthetic\n")
        env.chmod(0o600)
        if os.name == "nt":
            permissions = patch("ubuntu_deploy.private_file", side_effect=lambda file: file.read_bytes())
            permissions.start()
            self.addCleanup(permissions.stop)
        op = Cutover(**kwargs)
        op.env_file = env
        return op, self.host(env)

    def test_success_retains_exact_previous_container_and_no_other_service(self):
        op, host = self.case()
        result = op.cutover(host, "new-image", "hash")
        self.assertTrue(result["passed"])
        self.assertFalse(op.states["old"])
        self.assertTrue(op.states[op.new])
        self.assertEqual(result["rollbackImage"], "old-exact-image")
        self.assertFalse(any(e[0] in ("rm", "rmi", "prune") for e in op.events))

    def test_startup_and_http_failure_roll_back_only_equal_state(self):
        op, host = self.case(healthy=False)
        with self.assertRaisesRegex(Refused, "DEPLOY_FAILED_ROLLED_BACK"):
            op.cutover(host, "new-image", "hash")
        self.assertTrue(op.states["old"])
        self.assertFalse(op.states[op.new])
        self.assertEqual(op.witnesses, 2)

    def test_container_create_failure_restores_prior_writer(self):
        op, host = self.case(create_failed=True)
        with self.assertRaisesRegex(Refused, "DEPLOY_FAILED_ROLLED_BACK"):
            op.cutover(host, "new-image", "hash")
        self.assertTrue(op.states["old"])

    def test_accepted_database_or_file_writes_refuse_automatic_rollback(self):
        op, host = self.case(healthy=False, changed=True)
        with self.assertRaisesRegex(Refused, "UNSAFE_ROLLBACK"):
            op.cutover(host, "new-image", "hash")
        self.assertFalse(any(op.states.values()))
        self.assertFalse(any(e[:2] == ("start", "old") for e in op.events))

    def test_unavailable_equality_proof_refuses_rollback(self):
        op, host = self.case(healthy=False, check_failed=True)
        with self.assertRaisesRegex(Refused, "UNSAFE_ROLLBACK"):
            op.cutover(host, "new-image", "hash")
        self.assertFalse(op.states["old"])

    def test_memory_and_disk_fail_before_any_cutover(self):
        for available, disk in [(5 * GIB, 30 * GIB), (30 * GIB, 11 * GIB)]:
            with self.assertRaises(Refused):
                resource_check(available, disk)
        resource_check(6 * GIB, 12 * GIB)

    def test_missing_and_unreadable_configuration(self):
        with tempfile.TemporaryDirectory(prefix="serrian-a5-config-") as root:
            file = Path(root) / "private.env"
            with self.assertRaises(Refused):
                private_file(file)
            file.write_text("SECRET=synthetic\n")
            if os.name == "posix":
                file.chmod(0o000)
                with self.assertRaises(Refused):
                    private_file(file)
                file.chmod(0o600)
                self.assertEqual(private_file(file), b"SECRET=synthetic\n")

    def test_build_failure_removes_only_the_new_owned_builder(self):
        op = Operator(".", "a" * 40)
        events = []
        def command(*args, **kwargs):
            events.append(args)
            if args[:2] == ("buildx", "build"):
                raise Refused("SYNTHETIC_BUILD_FAILED")
            return subprocess.CompletedProcess(args, 0, b"", b"")
        op.docker = command
        op.inspect = lambda *_args: {"HostConfig": {"Memory": 4096 * MIB, "MemorySwap": 4096 * MIB, "CpuPeriod": 100000, "CpuQuota": 100000}}
        with self.assertRaisesRegex(Refused, "SYNTHETIC_BUILD_FAILED"):
            op.build(b"synthetic archive", "serriantide:" + op.commit)
        self.assertEqual(events[-1], ("buildx", "rm", "serrian-a5-" + op.run_id))
        self.assertFalse(any(e[0] in ("stop", "prune", "rmi") for e in events))

    def test_daemon_wide_lock_is_never_started_and_releases_only_its_exact_id(self):
        op = Operator(".", "a" * 40)
        events = []
        identity = "c" * 64
        op.inspect = lambda *_args, **_kwargs: {"Config": {"Volumes": {"/private": {}}}}
        def command(*args, **kwargs):
            events.append(args)
            return subprocess.CompletedProcess(args, 0, identity.encode() if args[0] == "create" else b"", b"")
        op.docker = command
        with op.daemon_lock("exact-image-id"):
            self.assertEqual(len(events), 1)
        self.assertEqual(events[-1], ("rm", identity))
        self.assertIn("--tmpfs", events[0])
        self.assertFalse(any(e[0] in ("start", "stop", "rmi") for e in events))

    def test_docker_env_semantics_do_not_expand_or_print_secrets(self):
        self.assertEqual(parse_env(b"# comment\nSECRET=$literal `value`\n"), {"SECRET": "$literal `value`"})
        for data in [b"export KEY=value", b"KEY=one\nKEY=two", b"KEY", b"BAD KEY=value"]:
            with self.assertRaises(Refused):
                parse_env(data)

    def test_mounts_require_real_persistence_and_keep_readonly_certificates(self):
        env = {k: "/private/" + name for k, name in zip(("SERRIAN_TERRAIN_ROOT", "SERRIAN_ASSET_ROOT", "SERRIAN_RASTER_ROOT"), ("terrain", "artwork", "raster"))}
        probe = {"roots": {name: {"path": "/private/" + name} for name in ("terrain", "artwork", "raster")}}
        volume = {"Type": "volume", "Name": "owned-test-only", "Source": "/var/test", "Destination": "/private", "RW": True}
        cert = {"Type": "bind", "Source": "/cert", "Destination": "/cert", "RW": False}
        self.assertEqual(len(mapped_roots({"Mounts": [volume, cert]}, env, probe)), 2)
        for mounts in [[], [{**volume, "RW": False}], [volume, {**cert, "RW": True}]]:
            with self.assertRaises(Refused):
                mapped_roots({"Mounts": mounts}, env, probe)


class GitPreservationTests(unittest.TestCase):
    def setUp(self):
        self.task = tempfile.TemporaryDirectory(prefix="serrian-a5-git-")
        self.addCleanup(self.task.cleanup)
        self.repo = Path(self.task.name)
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Synthetic fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        (self.repo / "keep.txt").write_text("original\n")
        self.git("add", "keep.txt")
        self.git("commit", "-m", "Synthetic baseline")
        first = self.git("rev-parse", "HEAD").strip()
        blobs = []
        for name, value in (("Dockerfile", "FROM synthetic\n"), (".dockerignore", "**\n")):
            blobs.append((name, self.git("hash-object", "-w", "--stdin", data=value).strip()))
        blobs.append(("keep.txt", self.git("rev-parse", "HEAD:keep.txt").strip()))
        tree = self.git("mktree", data="".join(f"100644 blob {blob}\t{name}\n" for name, blob in sorted(blobs))).strip()
        commit = self.git("commit-tree", tree, "-p", first, data="Synthetic next release\n").strip()
        self.op = Operator(self.repo, commit)
        self.op.output = self.repo / ".git" / "owned-test"
        self.op.output.mkdir()

    def git(self, *args, data=None):
        return subprocess.check_output(["git", *args], cwd=self.repo, input=data.encode() if data else None).decode()

    def test_real_fast_forward_and_untracked_docker_conflicts_preserve_bytes(self):
        (self.repo / "Dockerfile").write_bytes(b"owner prior Dockerfile\n")
        (self.repo / ".dockerignore").write_bytes(b"owner prior ignore\n")
        (self.repo / "unrelated.txt").write_bytes(b"unrelated owner draft\n")
        self.op.update()
        self.assertEqual((self.op.output / "preserved-Dockerfile").read_bytes(), b"owner prior Dockerfile\n")
        self.assertEqual((self.op.output / "preserved-dockerignore").read_bytes(), b"owner prior ignore\n")
        self.assertEqual((self.repo / "unrelated.txt").read_bytes(), b"unrelated owner draft\n")
        self.assertEqual(self.git("rev-parse", "HEAD").strip(), self.op.commit)
        self.op.update()  # repeat is a safe no-op

    def test_dirty_tracked_file_is_not_reset_cleaned_or_stashed(self):
        (self.repo / "keep.txt").write_bytes(b"owner unsaved tracked work\n")
        with self.assertRaisesRegex(Refused, "DIRTY_TRACKED"):
            self.op.update()
        self.assertEqual((self.repo / "keep.txt").read_bytes(), b"owner unsaved tracked work\n")

    def test_incorrect_build_commit_never_retags_existing_image(self):
        self.op.inspect = lambda *_args, **_kwargs: {"Config": {"Labels": {"org.opencontainers.image.revision": "0" * 40}}}
        with self.assertRaisesRegex(Refused, "IMAGE_COMMIT"):
            self.op.checked_image("synthetic", "hash")


if __name__ == "__main__":
    unittest.main()
