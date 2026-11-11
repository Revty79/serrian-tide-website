import hashlib
import unittest
from ci_ubuntu_postgres_dependency import authenticate_index


class UbuntuDependencyTests(unittest.TestCase):
    def source(self, changed=""):
        packages = ("Package: liburing2\nArchitecture: amd64\nVersion: 2.5-1build1\nFilename: pool/main/libu/liburing/liburing2_2.5-1build1_amd64.deb\nSize: 42\nSHA256: " + "a" * 64 + "\n" + changed).encode()
        release = "Origin: Ubuntu\nCodename: noble\nSHA256:\n " + hashlib.sha256(packages).hexdigest() + " " + str(len(packages)) + " main/binary-amd64/Packages\n"
        return release, packages

    def test_authenticated_index_selects_only_the_bounded_native_dependency(self):
        release, packages = self.source()
        release += "SHA512:\n " + "c" * 128 + " 42 main/binary-amd64/Packages\n"
        self.assertEqual(authenticate_index(release, packages)["Version"], "2.5-1build1")

    def test_tampered_index_bytes_fail_the_signed_release_hash(self):
        release, packages = self.source()
        with self.assertRaisesRegex(RuntimeError, "UBUNTU_INDEX_HASH"):
            authenticate_index(release, packages.replace(b"Size: 42", b"Size: 43"))

    def test_wrong_distribution_or_index_path_is_not_accepted(self):
        release, packages = self.source()
        for wrong in [release.replace("noble", "jammy"), release.replace("main/binary-amd64/Packages", "universe/binary-amd64/Packages")]:
            with self.assertRaises(RuntimeError):
                authenticate_index(wrong, packages)

    def test_repeated_package_fields_cannot_escape_the_verified_download_path(self):
        release, packages = self.source("Filename: ../../untrusted.deb\n")
        with self.assertRaisesRegex(RuntimeError, "UBUNTU_DEPENDENCY_BOUNDS"):
            authenticate_index(release, packages)


if __name__ == "__main__":
    unittest.main()
