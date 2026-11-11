"""Bounded origin changes preserve existing configuration byte-for-byte."""
import unittest
from ubuntu_deploy import Refused, parse_env
from ubuntu_trusted_origin import append_origin, runtime_environment, ORIGIN, KEY


class OriginConfigurationTests(unittest.TestCase):
    def test_append_preserves_secret_base_database_comments_and_existing_origins(self):
        data = ("# retained\nBETTER_AUTH_SECRET=synthetic-exact-secret\nBETTER_AUTH_URL=http://localhost:3003\nDATABASE_URL=synthetic-value\n" + KEY + "=http://localhost:3003, https://old.example.invalid\nEXTRA=unchanged # literal\n").encode()
        candidate = append_origin(data)
        self.assertEqual(candidate, data.replace(b"https://old.example.invalid\n", b"https://old.example.invalid," + ORIGIN.encode() + b"\n"))
        self.assertEqual(parse_env(candidate), {**parse_env(data), KEY: parse_env(data)[KEY] + "," + ORIGIN})

    def test_crlf_bom_and_no_final_newline_are_preserved(self):
        for end in (b"", b"\n", b"\r\n"):
            data = b"\xef\xbb\xbf" + KEY.encode() + b"=https://old.example.invalid" + end
            self.assertEqual(append_origin(data), data[:-len(end)] + b"," + ORIGIN.encode() + end if end else data + b"," + ORIGIN.encode())

    def test_missing_or_empty_setting_is_supported_without_changing_other_values(self):
        for data in (b"EXTRA=retained", b"EXTRA=retained\r\n", (KEY + "=\nEXTRA=retained\n").encode()):
            self.assertEqual(parse_env(append_origin(data)), {**parse_env(data), KEY: ORIGIN})

    def test_existing_origin_is_an_exact_byte_noop_including_whitespace(self):
        data = ("# retained\n" + KEY + "=https://old.example.invalid, " + ORIGIN + " ,http://localhost:3003").encode()
        self.assertEqual(append_origin(data), data)

    def test_similar_domains_and_paths_are_not_mistaken_for_the_approved_origin(self):
        for value in (ORIGIN + ".invalid", ORIGIN + "/", "https://www.serriantide.com", "http://serriantide.com"):
            data = (KEY + "=" + value + "\n").encode()
            self.assertEqual(parse_env(append_origin(data))[KEY], value + "," + ORIGIN)

    def test_duplicate_settings_and_malformed_environment_are_refused(self):
        for data in ((KEY + "=a\n" + KEY + "=b\n").encode(), b"export EXTRA=a\n", b"EXTRA=one\0two\n"):
            with self.assertRaises(Refused):
                append_origin(data)

    def test_complete_runtime_keeps_secret_and_unrelated_overrides(self):
        container = {"Config": {"Env": ["BETTER_AUTH_SECRET=synthetic", "EXTRA=exact", "HOSTNAME=explicit"], "Hostname": "generated"}}
        self.assertEqual(runtime_environment(container, {}), {"BETTER_AUTH_SECRET": "synthetic", "EXTRA": "exact", "HOSTNAME": "explicit"})

    def test_only_undeclared_docker_generated_hostname_is_excluded(self):
        container = {"Config": {"Env": ["HOSTNAME=generated", "EXTRA=exact"], "Hostname": "generated"}}
        self.assertEqual(runtime_environment(container, {}), {"EXTRA": "exact"})
        self.assertEqual(runtime_environment(container, {"HOSTNAME": "generated"}), {"HOSTNAME": "generated", "EXTRA": "exact"})


if __name__ == "__main__":
    unittest.main()
