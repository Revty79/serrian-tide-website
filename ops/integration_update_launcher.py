"""Fast real root-helper checks on an explicitly owned ephemeral Ubuntu runner.

Hosted runner images make /usr/local/bin world writable for global npm installs.
Prove the production refusal, then harden only that directory on this disposable
runner. Never change owner-machine permissions or recurse into existing tools.
"""
import hashlib
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from install_serrian_update import PUBLISH_LAUNCHER, launcher


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true"
    assert os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
    assert os.environ.get("SERRIAN_A5_OWNED_DOCKER") == "1"
    assert 'VERSION_ID="24.04"' in Path('/etc/os-release').read_text()
    assert os.getuid() != 0
    os.umask(0o077)
    parent = Path('/usr/local/bin')
    target = parent / 'serrian-update'
    assert parent.resolve() == parent and parent.stat().st_uid == 0
    assert not target.exists() and not target.is_symlink()
    task = Path(tempfile.mkdtemp(prefix='serrian-launcher-owned-'))
    staged = task / 'launcher'
    content = launcher(task / 'synthetic-package')
    staged.write_bytes(content)
    staged.chmod(0o600)
    expected = hashlib.sha256(content).hexdigest()
    command = ['sudo', '-n', '/usr/bin/python3', '-I', '-B', '-c', PUBLISH_LAUNCHER, str(staged), expected, str(os.getuid())]
    mode = stat.S_IMODE(parent.stat().st_mode)
    print('OWNED_LAUNCHER_PARENT uid=0 mode=' + oct(mode), flush=True)
    if mode & 0o022:
        result = subprocess.run(command, capture_output=True, text=True)
        assert result.returncode != 0 and 'INSTALL_ROOT_PERMISSIONS:' in result.stderr
        assert not target.exists() and stat.S_IMODE(parent.stat().st_mode) == mode
        print('PASS ONE_COMMAND unsafe launcher parent refused without changing permissions', flush=True)
        # CI fixture preparation only; production installer never repairs this.
        subprocess.run(['sudo', '-n', 'chmod', '0755', '--', str(parent)], check=True)
    bad = command.copy()
    bad[-2] = '0' * 64
    result = subprocess.run(bad, capture_output=True, text=True)
    assert result.returncode != 0 and 'INSTALL_STAGED_IDENTITY:' in result.stderr and not target.exists()
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        print(result.stderr, flush=True)
    assert result.returncode == 0 and target.read_bytes() == content
    assert target.stat().st_uid == 0 and stat.S_IMODE(target.stat().st_mode) == 0o755
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode != 0 and target.read_bytes() == content
    # Preserve the exclusively created smoke launcher; leave its normal name free
    # for the later complete installer against real application releases.
    subprocess.run(['sudo', '-n', 'mv', '--', str(target), str(task / 'retained-root-launcher')], check=True)
    print('PASS ONE_COMMAND root helper rejects changed bytes, publishes exact root0755 launcher, and never overwrites an existing command', flush=True)


if __name__ == '__main__':
    main()
