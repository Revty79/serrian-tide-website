"""Fail-closed identity, eligibility, transport and shared-engine regressions."""
import copy
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import prebuilt_release as release
import serrian_prebuilt_update as updater
import install_serrian_prebuilt_update as installer
from test_serrian_update import API, History, GOOD, NEW, run

DIGEST = "sha256:" + "d" * 64
PUBLICATION = {"run": 123, "attempt": 2}


def statement():
    return [{"verificationResult": {
        "signature": {"certificate": {"sourceRepositoryIdentifier": release.REPOSITORY_ID,
            "sourceRepositoryOwnerIdentifier": release.OWNER_ID, "sourceRepositoryDigest": GOOD,
            "sourceRepositoryRef": "refs/heads/main", "runnerEnvironment": "github-hosted",
            "buildTrigger": "push", "runInvocationURI": f"https://github.com/{release.REPOSITORY}/actions/runs/123/attempts/2"}},
        "verifiedTimestamps": [{"type": "Tlog"}],
        "statement": {"predicateType": "https://slsa.dev/provenance/v1", "subject": [{"name": release.IMAGE, "digest": {"sha256": "d" * 64}}]}}}]


class PrebuiltTests(unittest.TestCase):
    def test_fixed_repo_ids_source_attempt_subject_and_transparency_are_all_required(self):
        self.assertEqual(release.verify_statement(statement(), GOOD, DIGEST, PUBLICATION)["source"], GOOD)
        for field in statement()[0]["verificationResult"]["signature"]["certificate"]:
            value = statement()
            value[0]["verificationResult"]["signature"]["certificate"][field] = "wrong"
            with self.subTest(field=field), self.assertRaises(release.Stopped):
                release.verify_statement(value, GOOD, DIGEST, PUBLICATION)
        for key, value in [("verifiedTimestamps", []), ("statement", {"subject": []}), ("signature", {})]:
            data = statement()
            data[0]["verificationResult"][key] = value
            with self.assertRaises(release.Stopped):
                release.verify_statement(data, GOOD, DIGEST, PUBLICATION)
        with self.assertRaises(release.Stopped):
            release.verify_statement(statement(), GOOD, "sha256:" + "e" * 64, PUBLICATION)
        with self.assertRaises(release.Stopped):
            release.verify_statement(statement(), GOOD, DIGEST, {"run": 123, "attempt": 3})

    def test_only_single_reviewed_platform_and_full_digest_are_accepted(self):
        payload = {"Descriptor": {"digest": DIGEST, "platform": {"os": "linux", "architecture": "amd64"}}}
        self.assertEqual(release.descriptor(payload), DIGEST)
        for invalid in ([payload], {}, {"Descriptor": {"digest": GOOD, "platform": payload["Descriptor"]["platform"]}}):
            with self.assertRaises(release.Stopped):
                release.descriptor(invalid)
        for os_name, arch in (("windows", "amd64"), ("linux", "arm64")):
            data = copy.deepcopy(payload)
            data["Descriptor"]["platform"] = {"os": os_name, "architecture": arch}
            with self.assertRaises(release.Stopped):
                release.descriptor(data)

    def test_publication_success_is_required_in_addition_to_original_three(self):
        api = API()
        recent = api.recent()
        recent[release.WORKFLOW] = {GOOD: run(GOOD, release.WORKFLOW, 99, "in_progress", None)}
        with patch.object(api, "recent", return_value=recent), self.assertRaises(release.Stopped):
            release.select_release(History(), api)
        recent[release.WORKFLOW][GOOD].update(status="completed", conclusion="success")
        with patch.object(api, "recent", return_value=recent):
            self.assertEqual(release.select_release(History(), api), (GOOD, 1))

    def test_publisher_latest_attempt_and_all_jobs_must_match(self):
        api = release.GitHub()
        record = run(GOOD, release.WORKFLOW, 123)
        job = {"name": "publish", "head_sha": GOOD, "run_id": 123, "run_attempt": 1, "status": "completed", "conclusion": "success"}
        with patch.object(api, "runs", return_value=[record]), patch.object(api, "get", return_value={"total_count": 1, "jobs": [job]}):
            self.assertEqual(api.publication(GOOD)["run"], 123)
            for field, value in (("conclusion", "skipped"), ("head_sha", NEW), ("run_attempt", 2), ("name", "other")):
                bad = {**job, field: value}
                with patch.object(api, "get", return_value={"total_count": 1, "jobs": [bad]}), self.assertRaises(release.Stopped):
                    api.publication(GOOD)

    def test_registry_pull_is_digest_only_bounded_and_has_no_fallback(self):
        registry = release.Registry("/private/gh")
        with patch.object(release, "command", return_value=b"") as command:
            registry.pull(DIGEST)
            command.assert_called_once_with(["docker", "pull", "--platform", "linux/amd64", release.IMAGE + "@" + DIGEST], timeout=1800)
        with patch.object(release, "command", side_effect=release.Stopped("unavailable")) as command:
            with self.assertRaises(release.Stopped):
                registry.pull(DIGEST)
            self.assertEqual(command.call_count, 1)
        with self.assertRaises(release.Stopped):
            registry.pull("latest")

    def test_timeout_interruption_corruption_and_registry_errors_fail_closed(self):
        for effect in (OSError(), subprocess.TimeoutExpired("docker", 1)):
            with patch.object(subprocess, "run", side_effect=effect), self.assertRaises(release.Stopped):
                release.command(["docker", "pull", "unused"])
        for code in (1, 130, 137):
            with patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=code, stdout=b"", stderr=b"private credential must not print")), self.assertRaisesRegex(release.Stopped, "IMAGE_VERIFICATION_FAILED"):
                release.command(["docker", "pull", "unused"])

    def test_mismatched_repo_digest_platform_source_are_rejected_after_pull(self):
        image = {"Id": "sha256:" + "b" * 64, "RepoDigests": [release.IMAGE + "@" + DIGEST], "Os": "linux", "Architecture": "amd64", "Config": {"Labels": {"org.opencontainers.image.source": "https://github.com/" + release.REPOSITORY}}}
        registry = release.Registry("gh")
        operator = SimpleNamespace(inspect=lambda *_args, **_kwargs: image)
        self.assertEqual(registry.identity(operator, DIGEST), image["Id"])
        for field, value in (("RepoDigests", []), ("Os", "windows"), ("Architecture", "arm64"), ("Config", {})):
            bad = {**image, field: value}
            with self.assertRaises(release.Stopped):
                registry.identity(SimpleNamespace(inspect=lambda *_a, **_k: bad), DIGEST)

    def test_shared_cutover_rollback_and_local_build_default_remain_in_core(self):
        from ubuntu_deploy import Operator
        cls = updater.adapter(Operator, None, None, None, None, None, None, {})
        operator = cls(Path.cwd(), GOOD)
        operator.registry_digest = DIGEST
        self.assertEqual(operator.release_image(), release.IMAGE + "@" + DIGEST)
        self.assertEqual(Operator(Path.cwd(), GOOD).release_image(), "serriantide:" + GOOD)
        with self.assertRaises(updater.Stopped):
            operator.build(b"", "image")
        with patch.object(Operator, "run", return_value=None) as invoke:
            operator.docker("create", "--name", "test", "image")
            self.assertEqual(invoke.call_args.args[0][:3], ["docker", "create", "--pull=never"])

    def test_installer_fixed_root_scope_and_no_automatic_service_actions(self):
        self.assertIn("os.link(target, retained", installer.PUBLISH)
        self.assertIn("os.replace(temporary, target)", installer.PUBLISH)
        self.assertNotIn("subprocess", installer.PUBLISH)
        self.assertNotIn("docker", installer.PUBLISH)
        command = installer.launcher(Path("/private/with a space"))
        self.assertIn(b"-I -B", command)
        self.assertIn(b"managed prebuilt updater v2", command)

    def test_verifier_download_hash_precedes_extraction_or_installation(self):
        import io
        with patch.object(installer.urllib.request, "urlopen", return_value=io.BytesIO(b"corrupt or interrupted archive")), self.assertRaises(installer.Stopped):
            installer.download_verifier()


if __name__ == "__main__":
    unittest.main()
