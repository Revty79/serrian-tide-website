"""Owned Ubuntu CI only: authenticate and prefetch the native PG18 dependency.

Use Ubuntu's existing archive keyring and cached signed noble metadata. No new
trust key, DNS change, unsigned package, source rewrite or live-host fallback.
APT still performs the actual installation and its normal authentication checks.
"""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request


def require(value, message):
    if not value:
        raise RuntimeError(message)


def authenticate_index(release, packages):
    require("Origin: Ubuntu\n" in release and "Codename: noble\n" in release, "UBUNTU_RELEASE_IDENTITY")
    section = []
    for line in release.split("SHA256:\n", 1)[1].splitlines():
        if not line.startswith(" "):
            break
        section.append(line)
    references = [line.split() for line in section if line.split()[-1:] == ["main/binary-amd64/Packages"]]
    require(len(references) == 1, "UBUNTU_INDEX_IDENTITY")
    expected, size, _name = references[0]
    require(re.fullmatch("[a-f0-9]{64}", expected) and len(packages) == int(size) and hashlib.sha256(packages).hexdigest() == expected, "UBUNTU_INDEX_HASH")
    records = []
    for paragraph in packages.decode("utf-8").split("\n\n"):
        fields = dict(line.split(": ", 1) for line in paragraph.splitlines() if not line.startswith(" ") and ": " in line)
        if fields.get("Package") == "liburing2" and fields.get("Architecture") == "amd64":
            records.append(fields)
    require(len(records) == 1, "UBUNTU_DEPENDENCY_IDENTITY")
    record = records[0]
    require(re.fullmatch(r"pool/main/libu/liburing/liburing2_[0-9A-Za-z.+~:-]+_amd64\.deb", record["Filename"]) and re.fullmatch("[a-f0-9]{64}", record["SHA256"]) and 0 < int(record["Size"]) < 1024 * 1024, "UBUNTU_DEPENDENCY_BOUNDS")
    return record


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1", "OWNED_HOSTED_CI_REQUIRED")
    require('VERSION_ID="24.04"' in Path("/etc/os-release").read_text() and subprocess.check_output(["dpkg", "--print-architecture"], text=True).strip() == "amd64", "OWNED_UBUNTU_NOBLE_REQUIRED")
    os.umask(0o077)
    task = Path(tempfile.mkdtemp(prefix="serrian-native-dependency-", dir=os.environ["RUNNER_TEMP"]))
    lists = Path("/var/lib/apt/lists")
    releases = list(lists.glob("*_dists_noble_InRelease"))
    indexes = list(lists.glob("*_dists_noble_main_binary-amd64_Packages*"))
    require(len(releases) == 1 and len(indexes) == 1, "UBUNTU_SIGNED_CACHE_REQUIRED")
    signed = task / "authenticated-release"
    verified = subprocess.run(["gpgv", "--keyring", "/usr/share/keyrings/ubuntu-archive-keyring.gpg", "--output", str(signed), str(releases[0])], capture_output=True)
    require(verified.returncode == 0, "UBUNTU_RELEASE_SIGNATURE")
    packages = subprocess.check_output(["/usr/lib/apt/apt-helper", "cat-file", str(indexes[0])])
    record = authenticate_index(signed.read_text(), packages)
    url = "https://archive.ubuntu.com/ubuntu/" + record["Filename"]
    with urllib.request.urlopen(url, timeout=30) as response:
        require(response.url == url and response.status == 200, "UBUNTU_DOWNLOAD_IDENTITY")
        data = response.read(int(record["Size"]) + 1)
    require(len(data) == int(record["Size"]) and hashlib.sha256(data).hexdigest() == record["SHA256"], "UBUNTU_PACKAGE_HASH")
    source = task / Path(record["Filename"]).name
    source.write_bytes(data)
    cache = Path("/var/cache/apt/archives") / source.name
    if cache.exists():
        require(not cache.is_symlink() and cache.read_bytes() == data, "UBUNTU_CACHE_CONFLICT")
    else:
        subprocess.run(["sudo", "install", "-m", "0644", str(source), str(cache)], check=True)
    require(cache.read_bytes() == data, "UBUNTU_CACHE_PRESERVATION")
    print("OWNED_UBUNTU_PACKAGE_READY: archive signature, index SHA256 and package SHA256 verified; normal APT installation follows.")


if __name__ == "__main__":
    main()
