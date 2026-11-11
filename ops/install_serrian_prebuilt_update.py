#!/usr/bin/env python3
"""Reviewed one-time managed-command upgrade; no website/configuration changes."""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import platform
import shlex
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

spec = importlib.util.spec_from_file_location("serrian_prebuilt_installer_runtime", Path(__file__).with_name("serrian_prebuilt_update.py"))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
legacy, require, Stopped = runtime.legacy, runtime.require, runtime.Stopped
GH_VERSION = "2.103.3"
GH_ARCHIVE_SHA = "4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d"

# Only this fixed, narrowly scoped filesystem helper runs as root. Existing
# root-owned launcher is retained durably before replacement; no root Git/Python
# imports from the checkout, Docker, credentials or service actions.
PUBLISH = r'''
import fcntl, hashlib, os, pathlib, stat, sys, uuid
source, expected, owner, previous = pathlib.Path(sys.argv[1]), sys.argv[2], int(sys.argv[3]), sys.argv[4]
target = pathlib.Path('/usr/local/bin/serrian-update'); parent = target.parent
def require(value, code):
    if not value: sys.exit(code)
require(os.geteuid() == 0 and parent.resolve() == parent, 'INSTALL_ROOT_PATH')
info = parent.stat()
require(info.st_uid == 0 and not info.st_mode & 0o022, 'INSTALL_ROOT_PERMISSIONS')
fd = os.open(parent / '.serrian-update-install.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == owner and not info.st_mode & 0o077 and info.st_size < 4096, 'INSTALL_STAGED_PERMISSIONS')
        data = stream.read()
    require(hashlib.sha256(data).hexdigest() == expected and data.startswith(b'#!/bin/sh\n# Serrian Tide managed prebuilt updater v2\n'), 'INSTALL_STAGED_IDENTITY')
    if target.exists() or target.is_symlink():
        info = target.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022 and hashlib.sha256(target.read_bytes()).hexdigest() == previous, 'INSTALL_COMMAND_CHANGED')
        retained = parent / ('.serrian-update-retained-' + uuid.uuid4().hex)
        os.link(target, retained, follow_symlinks=False)
    else:
        require(previous == 'absent', 'INSTALL_COMMAND_CHANGED')
    temporary = parent / ('.serrian-update-new-' + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o755)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data); stream.flush(); os.fchmod(stream.fileno(), 0o755); os.fsync(stream.fileno())
    directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
        if previous == 'absent': os.link(temporary, target, follow_symlinks=False)
        else: os.replace(temporary, target)
        os.fsync(directory)
    finally: os.close(directory)
    if temporary.exists(): temporary.unlink()
'''


def launcher(package):
    return ("#!/bin/sh\n# Serrian Tide managed prebuilt updater v2\nexec /usr/bin/python3 -I -B " + shlex.quote(str(package / "serrian_prebuilt_update.py")) + " --installation " + shlex.quote(str(package / "installation.json")) + ' "$@"\n').encode()


def prior_command(target, git, root):
    if not target.exists() and not target.is_symlink():
        return "absent"
    info = target.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022 and info.st_size < 4096, "INSTALL_CONFLICT: preserve the unrelated/unprotected command.")
    content = target.read_bytes()
    lines = content.decode().splitlines()
    require(len(lines) == 3 and lines[0] == "#!/bin/sh" and lines[1] == "# Serrian Tide managed updater v1", "INSTALL_CONFLICT: only the reviewed original managed updater can be upgraded automatically.")
    arguments = shlex.split(lines[2])
    require(len(arguments) == 8 and arguments[:4] == ["exec", "/usr/bin/python3", "-I", "-B"] and arguments[5] == "--installation" and arguments[7] == "$@", "INSTALL_CONFLICT: unrecognized launcher is preserved.")
    entry, configuration = Path(arguments[4]), Path(arguments[6])
    package = legacy.private_directory(entry.parent)
    require(package.parent == root and configuration == package / "installation.json" and entry.name == "serrian_update.py", "INSTALL_CONFLICT: unexpected existing private package.")
    config = legacy.private_json(configuration)
    require(config.get("version") == 1 and config.get("repo") == str(git.repo) and config.get("uid") == os.getuid() and config.get("command") == str(target) and legacy.SHA.fullmatch(config.get("commit", "")) and package.name == config["commit"], "INSTALL_CONFLICT: existing updater contract differs.")
    require(git.ancestor(config["commit"], "origin/main"), "INSTALL_CONFLICT: existing updater source is not on main.")
    data = git.blob(config["commit"], "ops/serrian_update.py")
    require(entry.read_bytes() == data and config.get("runtimeSha256") == legacy.digest(data), "INSTALL_CONFLICT: existing updater bytes changed.")
    # Decline to replace even a launcher while its own command is active.
    import fcntl
    descriptor = os.open(package / "update.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stopped("UPDATE_BUSY: let the running update finish before installing.") from None
    return legacy.digest(content)


def download_verifier():
    url = f"https://github.com/cli/cli/releases/download/v{GH_VERSION}/gh_{GH_VERSION}_linux_amd64.tar.gz"
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(64 * 1024 * 1024 + 1)
        require(len(data) <= 64 * 1024 * 1024 and legacy.digest(data) == GH_ARCHIVE_SHA, "VERIFIER_DOWNLOAD: pinned GitHub CLI archive checksum failed.")
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            result = {}
            for name, path in (("gh", "bin/gh"), ("gh-LICENSE", "LICENSE")):
                member = archive.getmember(f"gh_{GH_VERSION}_linux_amd64/" + path)
                require(member.isfile() and member.size <= 80 * 1024 * 1024, "VERIFIER_ARCHIVE: unsupported member.")
                result[name] = archive.extractfile(member).read()
        require(legacy.digest(result["gh"]) == runtime.GH_BINARY_SHA, "VERIFIER_DOWNLOAD: executable checksum differs.")
        return result
    except (OSError, tarfile.TarError):
        raise Stopped("VERIFIER_DOWNLOAD: unable to obtain the pinned verifier; existing updater and website retained.") from None


def install(repo, commit, github=None):
    require(sys.platform.startswith("linux") and os.getuid() != 0 and platform.machine() in ("x86_64", "amd64"), "OWNER_PLATFORM: install as the normal owner on Ubuntu amd64, without sudo.")
    require(legacy.SHA.fullmatch(commit), "INSTALL_RELEASE: reviewed full commit required.")
    os.umask(0o077)
    git = legacy.Git(repo)
    git.fetch()
    require(git.ancestor(commit, "origin/main"), "INSTALL_RELEASE: source is not on main.")
    sources = {name: git.blob(commit, "ops/" + name) for name in (*runtime.MODULES, "install_serrian_prebuilt_update.py")}
    for name, data in sources.items():
        require(data.replace(b"\r\n", b"\n") == Path(__file__).with_name(name).read_bytes().replace(b"\r\n", b"\n"), "INSTALL_SOURCE: extracted files differ from the reviewed source.")
    print("Verifying exact source CI and signed-image release readiness...", flush=True)
    evidence = (github or runtime.release.GitHub()).verify(commit)
    root = legacy.private_directory(Path.home() / ".local/share/serrian-update", create=True)
    parent = legacy.private_directory(root / "prebuilt", create=True)
    package = parent / commit
    target = Path("/usr/local/bin/serrian-update")
    content = launcher(package)
    config = {"version": 2, "uid": os.getuid(), "repo": str(git.repo), "commit": commit, "command": str(target), "verifier": str(package / "gh"), "modules": {name: legacy.digest(sources[name]) for name in runtime.MODULES}}
    if target.exists() and not target.is_symlink() and target.read_bytes() == content:
        info = target.lstat()
        require(info.st_uid == 0 and not info.st_mode & 0o022, "INSTALL_CONFLICT: command permissions changed.")
        legacy.private_directory(package)
        observed = legacy.private_json(package / "installation.json")
        require(all(observed.get(k) == v for k, v in config.items()) and all((package / n).read_bytes() == sources[n] for n in runtime.MODULES) and legacy.digest((package / "gh").read_bytes()) == runtime.GH_BINARY_SHA, "INSTALL_CONFLICT: package changed; no overwrite.")
        print("Prebuilt serrian-update is already installed. No website change.", flush=True)
        return {"passed": True, "unchanged": True}
    previous = prior_command(target, git, root)
    config["ci"] = evidence
    if package.exists():
        legacy.private_directory(package)
        observed = legacy.private_json(package / "installation.json")
        require(all(observed.get(k) == v for k, v in config.items() if k != "ci") and all((package / n).read_bytes() == sources[n] for n in runtime.MODULES) and legacy.digest((package / "gh").read_bytes()) == runtime.GH_BINARY_SHA, "INSTALL_INCOMPLETE: retained partial package requires review.")
    else:
        verifier = download_verifier()
        package.mkdir(mode=0o700)
        for name, data in {**{n: sources[n] for n in runtime.MODULES}, **verifier}.items():
            with (package / name).open("xb") as stream:
                stream.write(data)
            (package / name).chmod(0o700 if name == "gh" else 0o600)
        with (package / "installation.json").open("x", encoding="utf-8") as stream:
            json.dump(config, stream, indent=2)
    with tempfile.TemporaryDirectory(prefix="serrian-prebuilt-install-") as directory:
        staged = Path(directory) / "launcher"
        staged.write_bytes(content)
        staged.chmod(0o600)
        print("Installing the reviewed prebuilt launcher; retaining the original command/package. Sudo may ask for your Ubuntu password. No website deployment.", flush=True)
        result = subprocess.run(["sudo", "/usr/bin/python3", "-I", "-B", "-c", PUBLISH, str(staged), hashlib.sha256(content).hexdigest(), str(os.getuid()), previous], stdout=subprocess.PIPE)
        require(result.returncode == 0, "INSTALL_STOPPED: original command/package and website retained; inspect the private installation.")
    require(target.read_bytes() == content and target.stat().st_uid == 0, "INSTALL_VERIFY: launcher differs; no website deployment attempted.")
    print("Installed. Future ordinary updates: serrian-update", flush=True)
    return {"passed": True, "commit": commit, "command": str(target), "websiteChanged": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="/apps/serrian-tide-next")
    parser.add_argument("--commit", required=True)
    args = parser.parse_args(argv)
    try:
        install(args.repo, args.commit)
        return 0
    except (Stopped, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, Stopped) else "INSTALL_STOPPED: preserve the existing command and private package; website untouched.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
