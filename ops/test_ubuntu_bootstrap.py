import os
import json
from types import SimpleNamespace
from pathlib import Path, PurePosixPath
import tempfile
import unittest
from unittest.mock import patch
from ubuntu_bootstrap import candidate_configuration, replace_configuration, real_directory, Bootstrap
from ubuntu_deploy import Refused, parse_env


class BootstrapTests(unittest.TestCase):
    def test_exact_supported_release_ledger_never_accepts_an_unknown_schema(self):
        op = Bootstrap(".", "a" * 40, "/apps/data", {"name": "synthetic", "port": 55432, "role": "postgres"})
        for count, tag, accepted in [(162, "0161_atlas_expanded_numerical_terrain", True), (163, "0162_atlas_source_rights", True), (161, "0160_world_canon_geography_copy", False), (163, "0162_unknown", False), (164, "0163_unknown", False)]:
            entries = [{"tag": "fixture", "when": n} for n in range(count)]
            entries[-1]["tag"] = tag
            with patch.object(op, "git", return_value=json.dumps({"entries": entries})), patch.object(op, "run", return_value=SimpleNamespace(stdout=b"select 1;\n")):
                if accepted:
                    ledger = op.ledger()
                    self.assertEqual(len(ledger), count)
                    self.assertEqual(ledger[-1]["timestamp"], str(count - 1))
                    self.assertEqual(len(ledger[-1]["hashes"]), 2)
                else:
                    with self.assertRaisesRegex(Refused, "BOOTSTRAP_RELEASE_SCHEMA"):
                        op.ledger()

    def test_legacy_auth_transition_preserves_secret_trusted_origins_and_unrelated_bytes(self):
        for ending in (b"\n", b"\r\n"):
            original = ending.join([b"\xef\xbb\xbf# retained", b"BETTER_AUTH_URL=http://198.51.100.10:3003", b"BETTER_AUTH_SECRET=keep-exact", b"BETTER_AUTH_TRUSTED_ORIGINS=http://10.23.4.5:3003,https://one.trycloudflare.com,https://two.trycloudflare.com", b"DATABASE_URL=keep-db", b"UNRELATED=keep-this", b""])
            plan = {"transition": True, "originalBase": "http://198.51.100.10:3003", "candidate": {"base": "http://10.23.4.5:3003"}}
            candidate = candidate_configuration(original, PurePosixPath("/apps/data"), plan)
            self.assertTrue(candidate.startswith(original.replace(b"BETTER_AUTH_URL=http://198.51.100.10:3003", b"BETTER_AUTH_URL=http://10.23.4.5:3003")))
            for key, value in parse_env(original).items():
                self.assertEqual(parse_env(candidate)[key], plan["candidate"]["base"] if key == "BETTER_AUTH_URL" else value)

    def test_legacy_auth_plan_cannot_inject_settings_or_select_an_unconfigured_origin(self):
        original = b"BETTER_AUTH_URL=http://198.51.100.10:3003\nBETTER_AUTH_TRUSTED_ORIGINS=http://10.23.4.5:3003\n"
        for target in ("http://10.23.4.6:3003", "http://10.23.4.5:3003\nDATABASE_URL=other"):
            with self.assertRaisesRegex(Refused, "BOOTSTRAP_AUTH_PLAN"):
                candidate_configuration(original, PurePosixPath("/apps/data"), {"transition": True, "originalBase": "http://198.51.100.10:3003", "candidate": {"base": target}})

    def test_configuration_preserves_every_existing_byte_and_adds_only_storage(self):
        original = b"# retained comment\r\nDATABASE_URL=synthetic\r\nBETTER_AUTH_SECRET=keep-this-exact\r\nPORT=3003"
        result = candidate_configuration(original, PurePosixPath("/apps/serrian-tide-data"))
        self.assertTrue(result.startswith(original + b"\n"))
        parsed = parse_env(result)
        for key, value in parse_env(original).items():
            self.assertEqual(parsed[key], value)
        self.assertEqual(len(parsed), len(parse_env(original)) + 3)
        self.assertEqual(parsed["SERRIAN_ASSET_ROOT"], "/apps/serrian-tide-data/artwork")

    def test_existing_even_empty_storage_setting_refuses_bootstrap(self):
        for key in ("SERRIAN_TERRAIN_ROOT", "SERRIAN_ASSET_ROOT", "SERRIAN_RASTER_ROOT"):
            with self.assertRaisesRegex(Refused, "ALREADY_CONFIGURED"):
                candidate_configuration((key + "=\n").encode(), Path("/apps/data"))

    def test_storage_cannot_inject_environment_entries_or_mount_options(self):
        for root in ("/apps/data\nDATABASE_URL=other", "/apps/data,readonly"):
            with self.assertRaisesRegex(Refused, "BOOTSTRAP_STORAGE_PATH"):
                candidate_configuration(b"DATABASE_URL=original\n", PurePosixPath(root))

    def test_configuration_switch_retains_changes_from_another_operator(self):
        with tempfile.TemporaryDirectory(prefix="serrian-bootstrap-test-") as directory:
            file = Path(directory) / "runtime.env"
            file.write_bytes(b"NEW_OWNER_VALUE=keep\n")
            file.chmod(0o600)
            with patch("ubuntu_bootstrap.private_file", side_effect=lambda p: p.read_bytes()):
                with self.assertRaisesRegex(Refused, "CONFIG_CHANGED"):
                    replace_configuration(file, b"OLD=expected\n", b"replacement", 0o600)
            self.assertEqual(file.read_bytes(), b"NEW_OWNER_VALUE=keep\n")

    @unittest.skipUnless(os.name == "posix", "Atomic directory sync uses Linux")
    def test_atomic_configuration_install_and_exact_restore(self):
        with tempfile.TemporaryDirectory(prefix="serrian-bootstrap-config-") as directory:
            file = Path(directory) / "runtime.env"
            original = b"AUTH=exact\n"
            candidate = candidate_configuration(original, Path("/apps/data"))
            file.write_bytes(original)
            file.chmod(0o400)
            replace_configuration(file, original, candidate, 0o400)
            self.assertEqual(file.read_bytes(), candidate)
            self.assertEqual(file.stat().st_mode & 0o777, 0o400)
            replace_configuration(file, candidate, original, 0o400)
            self.assertEqual(file.read_bytes(), original)

    def test_linked_storage_parent_is_refused(self):
        with tempfile.TemporaryDirectory(prefix="serrian-bootstrap-link-") as directory:
            target = Path(directory) / "real"
            target.mkdir()
            link = Path(directory) / "link"
            try:
                link.symlink_to(target, target_is_directory=True)
            except OSError:
                self.skipTest("Creating directory links requires local privilege")
            with self.assertRaisesRegex(Refused, "BOOTSTRAP_PATH"):
                real_directory(link)

    def test_bootstrap_requires_explicit_writer_freeze(self):
        op = Bootstrap(".", "a" * 40, "/apps/data", {"name": "serrian_tide_prod", "port": 5432, "role": "serrian_tide_app"})
        # The production operation cannot reach any command when the freeze is absent.
        with patch("ubuntu_bootstrap.os.name", "posix"), patch("ubuntu_bootstrap.os.geteuid", return_value=1000, create=True):
            with self.assertRaisesRegex(Refused, "FREEZE"):
                op.bootstrap("")


if __name__ == "__main__":
    unittest.main()
