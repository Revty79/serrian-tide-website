"""Deterministic GitHub policy tests and real owned-Git contract checks."""
import ast
from contextlib import contextmanager
import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from serrian_update import GitHub, Git, Stopped, WORKFLOWS, REPOSITORY, select_release, verify_ledger, expected_ledger, configuration_epoch, update
from install_serrian_update import launcher, PUBLISH_LAUNCHER

OLD, GOOD, NEW = "a" * 40, "b" * 40, "c" * 40


def run(commit, workflow, identity=1, status="completed", conclusion="success", attempt=1):
    return {"id": identity, "run_attempt": attempt, "head_sha": commit, "event": "push", "head_branch": "main", "path": ".github/workflows/" + workflow, "head_repository": {"full_name": REPOSITORY}, "status": status, "conclusion": conclusion}


class API(GitHub):
    def __init__(self):
        self.records = {name: [run(GOOD, name, index + 1), run(NEW, name, index + 11, "in_progress", None)] for index, name in enumerate(WORKFLOWS)}
        self.job_change = {}
        self.requests = []

    def get(self, relative):
        self.requests.append(relative)
        if relative.startswith("actions/workflows/"):
            return {"workflow_runs": copy.deepcopy(self.records[relative.split("/")[2]])}
        identity = int(relative.split("/")[2])
        for workflow, records in self.records.items():
            for row in records:
                if row["id"] == identity:
                    job = {"name": WORKFLOWS[workflow], "head_sha": row["head_sha"], "run_id": identity, "run_attempt": row["run_attempt"], "status": "completed", "conclusion": "success", **self.job_change}
                    return {"total_count": 1, "jobs": [job]}
        raise AssertionError("Unknown requested CI identity")


class History:
    def run(self, *args):
        if args[0] == "rev-list":
            return "\n".join([NEW, GOOD, OLD])
        if args[:2] == ("rev-parse", "HEAD"):
            return OLD
        raise AssertionError(args)

    def ancestor(self, before, after):
        return [OLD, GOOD, NEW].index(before) <= [OLD, GOOD, NEW].index(after)


class UpdatePolicyTests(unittest.TestCase):
    def test_selects_newest_exact_full_success_and_reports_newer_pending_commit(self):
        api = API()
        self.assertEqual(select_release(History(), api), (GOOD, 1))
        evidence = api.verify(GOOD)
        self.assertEqual(len(evidence), 3)
        self.assertEqual({row["commit"] for row in evidence}, {GOOD})
        self.assertTrue(any("/attempts/1/jobs" in path for path in api.requests))

    def test_failed_missing_cancelled_neutral_skipped_and_pending_workflows_never_pass(self):
        for status, conclusion in [("completed", "failure"), ("completed", "cancelled"), ("completed", "neutral"), ("completed", "skipped"), ("queued", None), ("in_progress", None)]:
            api = API()
            api.records["validate.yml"][0].update(status=status, conclusion=conclusion)
            with self.assertRaises(Stopped):
                api.verify(GOOD)
        api.records["validate.yml"] = []
        with self.assertRaises(Stopped):
            api.verify(GOOD)

    def test_newer_failed_run_or_pending_rerun_overrides_an_older_success(self):
        api = API()
        api.records["validate.yml"].append(run(GOOD, "validate.yml", 101, conclusion="failure"))
        with self.assertRaises(Stopped):
            api.verify(GOOD)
        api.records["validate.yml"][-1].update(status="in_progress", conclusion=None, run_attempt=2)
        with self.assertRaises(Stopped):
            api.verify(GOOD)
        api.records["validate.yml"][-1].update(status="completed", conclusion="success")
        self.assertEqual(api.verify(GOOD)[0]["attempt"], 2)

    def test_wrong_sha_fork_event_branch_path_or_job_cannot_authorize(self):
        for fields in [{"head_sha": OLD}, {"event": "pull_request"}, {"head_branch": "review"}, {"path": ".github/workflows/spoof.yml"}, {"head_repository": {"full_name": "other/fork"}}]:
            api = API()
            api.records["validate.yml"][0].update(fields)
            with self.assertRaises(Stopped):
                api.verify(GOOD)
        for fields in [{"head_sha": OLD}, {"run_attempt": 2}, {"run_id": 555}, {"name": "skipped-tests"}, {"status": "queued"}, {"conclusion": "skipped"}, {"conclusion": "failure"}]:
            api = API()
            api.job_change = fields
            with self.assertRaises(Stopped):
                api.verify(GOOD)

    def test_no_eligible_forward_release_does_not_reset_checkout(self):
        history = History()
        history.ancestor = lambda _before, _after: False
        with self.assertRaisesRegex(Stopped, "NO_ELIGIBLE_UPDATE"):
            select_release(history, API())

    def test_network_api_rate_limit_and_invalid_json_fail_closed(self):
        import urllib.error
        for failure in [urllib.error.HTTPError("https://api.github.com/", 403, "private", {}, None), urllib.error.HTTPError("https://api.github.com/", 404, "private", {}, None), OSError("private-network-details")]:
            api = GitHub()
            with patch.object(api.opener, "open", side_effect=failure):
                with self.assertRaisesRegex(Stopped, "CI_UNAVAILABLE") as result:
                    api.verify(GOOD)
            self.assertNotIn("private", str(result.exception))

    def test_public_api_has_fixed_https_origin_no_redirect_and_no_secret_in_url(self):
        api = GitHub()
        with patch.dict("os.environ", {"GH_TOKEN": "synthetic-secret"}):
            with patch.object(api.opener, "open", side_effect=OSError()) as opened:
                with self.assertRaises(Stopped):
                    api.verify(GOOD)
        request = opened.call_args.args[0]
        self.assertTrue(request.full_url.startswith("https://api.github.com/repos/" + REPOSITORY + "/actions/"))
        self.assertNotIn("synthetic-secret", request.full_url)
        self.assertEqual(request.headers["Authorization"], "Bearer synthetic-secret")
        for path in ["https://attacker.invalid/", "actions/../bad", "actions/test\nsecret"]:
            with self.assertRaises(Stopped):
                api.get(path)

    def test_schema_verification_accepts_only_exact_order_timestamps_and_known_hashes(self):
        expected = [{"created_at": "10", "hashes": {"a" * 64, "b" * 64}}]
        verify_ledger([{"created_at": "10", "hash": "a" * 64}], expected)
        verify_ledger([{"created_at": "10", "hash": "b" * 64}], expected)
        for rows in [[], [{"created_at": "11", "hash": "a" * 64}], [{"created_at": "10", "hash": "c" * 64}]]:
            with self.assertRaisesRegex(Stopped, "MIGRATION_APPROVAL_REQUIRED"):
                verify_ledger(rows, expected)

    def test_real_git_migration_bytes_and_configuration_epoch(self):
        with tempfile.TemporaryDirectory(prefix="serrian-update-git-") as directory:
            root = Path(directory)
            def command(*args):
                return subprocess.check_output(["git", *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
            command("init", "-b", "main")
            command("config", "user.email", "synthetic@example.invalid")
            command("config", "user.name", "Synthetic updater test")
            command("config", "core.autocrlf", "false")
            (root / "drizzle/meta").mkdir(parents=True)
            (root / "ops").mkdir()
            sql = b"select 1;\n"
            (root / "drizzle/0000_initial.sql").write_bytes(sql)
            (root / "drizzle/meta/_journal.json").write_text(json.dumps({"entries": [{"idx": 0, "tag": "0000_initial", "when": 10}]}))
            (root / "ops/update-requirements.json").write_text('{"version":1,"configurationEpoch":1}')
            command("add", ".")
            command("commit", "-m", "owned initial")
            commit = command("rev-parse", "HEAD")
            git = Git(root)
            ledger = expected_ledger(git, commit)
            self.assertIn(hashlib.sha256(sql).hexdigest(), ledger[0]["hashes"])
            self.assertIn(hashlib.sha256(sql.replace(b"\n", b"\r\n")).hexdigest(), ledger[0]["hashes"])
            self.assertNotIn(hashlib.sha256(b"select 2;\n").hexdigest(), ledger[0]["hashes"])
            self.assertEqual(configuration_epoch(git, commit), 1)

    def test_launcher_quotes_paths_and_root_helper_checks_real_newline_prefix(self):
        text = launcher(PurePosixPath("/home/owned space/package")).decode()
        self.assertIn("'/home/owned space/package/serrian_update.py'", text)
        self.assertIn('/usr/bin/python3 -I -B', text)
        self.assertIn('"$@"', text)
        values = [node.value for node in ast.walk(ast.parse(PUBLISH_LAUNCHER)) if isinstance(node, ast.Constant)]
        self.assertIn(b"#!/bin/sh\n# Serrian Tide managed updater v1\n", values)
        self.assertIn("/usr/local/bin/serrian-update", values)

    def test_configuration_change_cannot_reach_confirmation_or_deployment(self):
        with self.control_fixture() as (api, operator, messages):
            with patch("serrian_update.configuration_epoch", side_effect=[1, 2]):
                with self.assertRaisesRegex(Stopped, "CONFIGURATION_APPROVAL_REQUIRED"):
                    update({"repo": "unused"}, api, confirm=lambda _: self.fail("Unexpected confirmation"), emit=messages.append)
            self.assertEqual(operator.deployments, [])

    def test_decline_and_end_of_input_never_deploy(self):
        with self.control_fixture() as (api, operator, messages):
            result = update({"repo": "unused"}, api, confirm=lambda _: "no", emit=messages.append)
            self.assertTrue(result["cancelled"])
            with self.assertRaises(EOFError):
                def closed(_message):
                    raise EOFError()
                update({"repo": "unused"}, api, confirm=closed, emit=messages.append)
            self.assertEqual(operator.deployments, [])

    def test_confirmation_uses_original_host_approval_and_freeze_contract(self):
        with self.control_fixture() as (api, operator, messages):
            update({"repo": "unused"}, api, confirm=lambda _: "yes", emit=messages.append)
            self.assertEqual(operator.deployments, [("observed-host-approval", "original-freeze-contract")])
            self.assertTrue(any("pgAdmin" in message for message in messages))

    def test_matching_healthy_release_needs_neither_confirmation_nor_deployment(self):
        with self.control_fixture() as (api, operator, messages):
            with patch("serrian_update.deployed_commit", return_value=GOOD):
                result = update({"repo": "unused"}, api, confirm=lambda _: self.fail("Unexpected confirmation"), emit=messages.append)
            self.assertTrue(result["unchanged"])
            self.assertEqual(operator.deployments, [])

    @contextmanager
    def control_fixture(self):
        api, history, messages = API(), History(), []
        history.fetch = lambda: None
        original_run = history.run
        history.run = lambda *args: "Synthetic reviewed release" if args[0] == "show" else original_run(*args)
        operator = SimpleNamespace(deployments=[])
        operator.host = lambda: {"approval": "observed-host-approval", "report": {"database": {"ledger": []}}, "container": {"Image": "owned-image", "Id": "owned-container"}}
        operator.expected_source = lambda: (b"", "owned-source")
        operator.checked_image = lambda image, _source: image
        operator.http_health = lambda _container, _port: True
        def deploy(approval, freeze):
            operator.deployments.append((approval, freeze))
            return {"passed": True}
        operator.deploy = deploy
        @contextmanager
        def selected(*_args):
            yield operator, SimpleNamespace(Refused=RuntimeError, FROZEN="original-freeze-contract")
        with patch("serrian_update.Git", return_value=history), patch("serrian_update.selected_operator", selected), patch("serrian_update.deployed_commit", return_value=OLD), patch("serrian_update.expected_ledger", return_value=[]), patch("serrian_update.configuration_epoch", return_value=1):
            yield api, operator, messages


if __name__ == "__main__":
    unittest.main()
