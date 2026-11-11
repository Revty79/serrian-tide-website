#!/usr/bin/env python3
"""One-time owner-run installer. Sudo installs only a small fixed launcher.

No website/container/database/env/storage action is performed by installation.
Never overwrite an unrelated command or installation, and never run Git as root.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import stat
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location("serrian_installer_runtime", Path(__file__).with_name("serrian_update.py"))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

# Root executes only this fixed filesystem helper, not repository Python code.
# link() publishes exclusively; an existing command is never replaced, even if
# it appears between the owner's checks and the sudo call.
PUBLISH_LAUNCHER = r'''
import hashlib, os, pathlib, stat, sys, uuid
source, expected, owner = pathlib.Path(sys.argv[1]), sys.argv[2], int(sys.argv[3])
target = pathlib.Path('/usr/local/bin/serrian-update')
parent = target.parent
assert os.geteuid() == 0 and parent.resolve() == parent
info = parent.stat()
assert stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o022 == 0
fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
with os.fdopen(fd, 'rb') as stream:
    info = os.fstat(stream.fileno())
    assert stat.S_ISREG(info.st_mode) and info.st_uid == owner and info.st_mode & 0o077 == 0 and info.st_size < 4096
    data = stream.read()
assert hashlib.sha256(data).hexdigest() == expected and data.startswith(b'#!/bin/sh\n# Serrian Tide managed updater v1\n')
temporary = parent / ('.serrian-update-' + uuid.uuid4().hex)
try:
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o755)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data); stream.flush(); os.fchmod(stream.fileno(), 0o755); os.fsync(stream.fileno())
    os.link(temporary, target, follow_symlinks=False)
    fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)
finally:
    if temporary.exists(): temporary.unlink()
'''


def launcher(package):
    entry = shlex.quote(str(package / "serrian_update.py"))
    config = shlex.quote(str(package / "installation.json"))
    return ("#!/bin/sh\n# Serrian Tide managed updater v1\nexec /usr/bin/python3 -I -B " + entry + " --installation " + config + ' "$@"\n').encode()


def install(repo, commit, github=None):
    runtime.require(sys.platform.startswith("linux") and os.getuid() != 0, "OWNER_REQUIRED: install as the normal website owner, not root. Sudo is used only for the permanent launcher.")
    runtime.require(runtime.SHA.fullmatch(commit), "INSTALL_RELEASE: a reviewed full installation commit is required.")
    os.umask(0o077)
    git = runtime.Git(repo)
    git.fetch()
    runtime.require(git.ancestor(commit, "origin/main"), "INSTALL_RELEASE: the reviewed installer is not on origin/main.")
    source = git.blob(commit, "ops/serrian_update.py")
    installer = git.blob(commit, "ops/install_serrian_update.py")
    runtime.require(source.replace(b"\r\n", b"\n") == Path(runtime.__file__).read_bytes().replace(b"\r\n", b"\n") and installer.replace(b"\r\n", b"\n") == Path(__file__).read_bytes().replace(b"\r\n", b"\n"), "INSTALL_SOURCE: extracted installer files differ from the reviewed Git release.")
    print("Verifying the installation release against all required GitHub CI...", flush=True)
    evidence = (github or runtime.GitHub()).verify(commit)
    # No sudo or website configuration access occurs before CI and source checks.
    root = runtime.private_directory(Path.home() / ".local/share/serrian-update", create=True)
    package = root / commit
    target = Path("/usr/local/bin/serrian-update")
    content = launcher(package)
    if target.exists() or target.is_symlink():
        info = target.lstat()
        runtime.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o022 == 0 and target.read_bytes() == content, "INSTALL_CONFLICT: an existing serrian-update command is preserved. Review it before installing a different tool version.")
        runtime.private_directory(package)
        configuration = runtime.private_json(package / "installation.json")
        runtime.require(configuration["repo"] == str(git.repo) and configuration["uid"] == os.getuid() and configuration["runtimeSha256"] == runtime.digest(source) and (package / "serrian_update.py").read_bytes() == source, "INSTALL_CONFLICT: the existing installation differs; no file was overwritten.")
        print("serrian-update is already installed. No website change.", flush=True)
        return {"passed": True, "unchanged": True, "commit": commit}
    configuration = {"version": 1, "uid": os.getuid(), "repo": str(git.repo), "commit": commit, "runtimeSha256": runtime.digest(source), "command": str(target), "ci": evidence}
    if package.exists():
        runtime.private_directory(package)
        previous = runtime.private_json(package / "installation.json")
        runtime.require(all(previous.get(key) == value for key, value in configuration.items() if key != "ci") and (package / "serrian_update.py").read_bytes() == source, "INSTALL_INCOMPLETE: a differing partial installation is retained for review; no files are overwritten.")
    else:
        package.mkdir(mode=0o700)
        with (package / "serrian_update.py").open("xb") as stream:
            stream.write(source)
        with (package / "installation.json").open("x", encoding="utf-8") as stream:
            json.dump(configuration, stream, indent=2)
    try:
        with tempfile.TemporaryDirectory(prefix="serrian-update-install-") as directory:
            staged = Path(directory) / "launcher"
            staged.write_bytes(content)
            staged.chmod(0o600)
            print("Installing /usr/local/bin/serrian-update. Sudo may ask for your Ubuntu password; the website remains running.", flush=True)
            result = subprocess.run(["sudo", "/usr/bin/python3", "-I", "-B", "-c", PUBLISH_LAUNCHER, str(staged), hashlib.sha256(content).hexdigest(), str(os.getuid())], stdout=subprocess.PIPE)
            runtime.require(result.returncode == 0, "INSTALL_STOPPED: launcher installation did not finish. The private package is retained for review; the website is unchanged.")
        info = target.lstat()
        runtime.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o022 == 0 and target.read_bytes() == content, "INSTALL_VERIFY: the installed launcher did not match; no website deployment was attempted.")
        print("Installed. Future ordinary updates: serrian-update", flush=True)
        return {"passed": True, "commit": commit, "command": str(target)}
    except Exception:
        # Retain new package/evidence; never clean unknown or pre-existing files.
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="/apps/serrian-tide-next")
    parser.add_argument("--commit", required=True)
    args = parser.parse_args(argv)
    try:
        install(args.repo, args.commit)
        return 0
    except (runtime.Stopped, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, runtime.Stopped) else "INSTALL_STOPPED: retain the existing command and private installation evidence; the website was not changed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
