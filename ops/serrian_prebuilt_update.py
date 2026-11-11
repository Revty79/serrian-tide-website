#!/usr/bin/env python3
"""Permanent prebuilt frontend; original A5 owns all cutover and rollback logic."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

spec = importlib.util.spec_from_file_location("serrian_release", Path(__file__).with_name("prebuilt_release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
legacy, require, Stopped = release.legacy, release.require, release.Stopped
MODULES = ("serrian_prebuilt_update.py", "prebuilt_release.py", "serrian_update.py")
GH_BINARY_SHA = "b768184570b12536be4ac1528893f6340d1c6a7b40b56ad45bca9cd0e87ad34d"


def adapter(base, module, git, github, registry, confirm, emit, metrics):
    class PrebuiltOperator(base):
        def release_image(self):
            return release.IMAGE + "@" + self.registry_digest

        def build(self, *_args):
            raise Stopped("LOCAL_BUILD_DISABLED: ordinary updates only deploy verified registry images. Keep the running website and retry later.")

        def docker(self, *args, **kwargs):
            # All application/probe/lock images must already be present locally.
            if args and args[0] in ("run", "create"):
                args = (args[0], "--pull=never", *args[1:])
            return super().docker(*args, **kwargs)

        def update(self):
            # Original deploy_locked invokes this before checks. Fast-forward is
            # deferred until consent, preserving even the checkout on decline.
            pass

        def deploy_locked(self, host, approval):
            require(host["approval"] == approval, "HOST_CHANGED: read-only approval changed; no cutover.")
            current = legacy.deployed_commit(self, host)
            require(git.ancestor(current, self.commit), "DOWNGRADE_REFUSED: retain the newer/different running release.")
            legacy.verify_ledger(host["report"]["database"]["ledger"], legacy.expected_ledger(git, self.commit))
            require(legacy.configuration_epoch(git, current, legacy=True) == legacy.configuration_epoch(git, self.commit), "CONFIGURATION_APPROVAL_REQUIRED: this release changes configuration; separate review is required.")
            module.resource_check(host["resources"]["memoryAvailable"], host["resources"]["diskFree"], build_mib=2048)
            started = time.monotonic()
            self.registry_digest = registry.resolve(self.commit)
            evidence = registry.verify(self.commit, self.registry_digest, github.publication(self.commit))
            metrics["registryAndProvenanceSeconds"] = time.monotonic() - started
            self.save("registry-provenance.json", evidence)
            emit("Verified signed image " + self.release_image())
            cached = self.docker("image", "inspect", self.release_image(), allow_failure=True).returncode == 0
            metrics["downloadSeconds"] = 0 if cached else registry.pull(self.registry_digest)
            metrics["imageAlreadyCached"] = cached
            image_id = registry.identity(self, self.registry_digest)
            if current == self.commit:
                _archive, source_hash = self.expected_source()
                require(host["container"]["Image"] == image_id and self.checked_image(image_id, source_hash) == image_id and self.http_health(host["container"]["Id"], 3003), "CURRENT_IDENTITY: matching source is not the verified healthy registry image; review separately.")
                emit("Already deployed and healthy. No download, build or restart.")
                return {"passed": True, "unchanged": True, "commit": self.commit, "image": image_id}
            started = time.monotonic()
            result = super().deploy_locked(host, approval)
            metrics["applicationChecksAndCutoverSeconds"] = time.monotonic() - started - metrics.get("confirmationSeconds", 0)
            return result

        def cutover(self, host, image_id, source_hash):
            # A5 has completed the real source/build, DB/files/auth/schema and
            # isolated Next.js smoke checks before the single owner confirmation.
            self.save("prebuilt-ci.json", {"checks": github.verify(self.commit)})
            emit("Image and A5 checks passed. PostgreSQL, mounts, sessions and port 3003 will be preserved.")
            emit("Leave the website and tunnel running. Close pgAdmin and stop other database/file writers before confirming.")
            started = time.monotonic()
            answer = confirm("Update now? [y/N]: ")
            metrics["confirmationSeconds"] = time.monotonic() - started
            if answer.strip().lower() not in ("y", "yes"):
                emit("Cancelled. The running website and checkout are unchanged.")
                return {"passed": True, "cancelled": True, "commit": self.commit}
            github.verify(self.commit)
            fresh = self.host()
            require(fresh["approval"] == host["approval"], "HOST_CHANGED: the writer/configuration changed while awaiting confirmation.")
            module.resource_check(fresh["resources"]["memoryAvailable"], fresh["resources"]["diskFree"], build_mib=2048)
            require(registry.identity(self, self.registry_digest) == image_id, "IMAGE_CHANGED: local digest identity changed before cutover.")
            super().update()
            started = time.monotonic()
            result = super().cutover(fresh, image_id, source_hash)
            metrics["cutoverAndHealthSeconds"] = time.monotonic() - started
            return result
    return PrebuiltOperator


def update(config, github=None, registry=None, confirm=input, emit=print):
    started = time.monotonic()
    github = github or release.GitHub()
    registry = registry or release.Registry(config["verifier"])
    git = legacy.Git(config["repo"])
    emit("Fetching main and checking tested, published releases...")
    git.fetch()
    commit, skipped = release.select_release(git, github)
    checks = github.verify(commit)
    if skipped:
        emit("Newer main commits are not fully released and will not be deployed.")
    title = "".join(c for c in git.run("show", "-s", "--format=%s", commit) if c.isprintable())[:160]
    emit("Selected " + commit + " - " + title)
    metrics = {}
    with legacy.selected_operator(git, commit, github) as (original, module):
        cls = adapter(type(original), module, git, github, registry, confirm, emit, metrics)
        operator = cls(git.repo, commit)
        try:
            host = operator.host()
            result = operator.deploy(host["approval"], module.FROZEN)
            metrics["totalSecondsExcludingConfirmation"] = time.monotonic() - started - metrics.get("confirmationSeconds", 0)
            result.update({"mode": "verified-prebuilt", "digest": operator.registry_digest, "checks": checks, "timings": metrics, "localBuild": False})
            operator.save("prebuilt-result.json", result)
            if not result.get("cancelled") and not result.get("unchanged"):
                emit("Update complete: " + commit + ". The previous container and image are retained.")
            emit("Elapsed excluding confirmation: " + str(round(metrics["totalSecondsExcludingConfirmation"], 1)) + " seconds.")
            return result
        except module.Refused as error:
            raise Stopped(str(error)) from None


def main(argv=None):
    parser = argparse.ArgumentParser(description="Download a verified Serrian Tide release and update after one confirmation.")
    parser.add_argument("--installation", required=True, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        require(sys.platform.startswith("linux") and os.getuid() != 0, "OWNER_REQUIRED: run serrian-update without sudo.")
        os.umask(0o077)
        root = legacy.private_directory(Path(args.installation).absolute().parent)
        config = legacy.private_json(root / "installation.json")
        require(config.get("version") == 2 and config.get("uid") == os.getuid() and config.get("command") == "/usr/local/bin/serrian-update" and config.get("verifier") == str(root / "gh"), "INSTALLATION_CHANGED: preserve and review the private updater package.")
        require(config.get("modules") == {name: legacy.digest((root / name).read_bytes()) for name in MODULES} and legacy.digest((root / "gh").read_bytes()) == GH_BINARY_SHA, "INSTALLATION_CHANGED: updater/verifier bytes differ from the installed release.")
        for name in (*MODULES, "gh"):
            info = (root / name).lstat()
            require((root / name).resolve() == root / name and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0, "INSTALLATION_PERMISSIONS: package must remain private and owner-controlled.")
        import fcntl
        descriptor = os.open(root / "update.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Stopped("UPDATE_BUSY: another update is active.") from None
            def confirmation(message):
                require(sys.stdin.isatty(), "INTERACTIVE_CONFIRMATION_REQUIRED: run serrian-update in your terminal.")
                return input(message)
            def interrupted(_signal, _frame):
                raise Stopped("INTERRUPTED: retain the running website and private A5 recovery receipts.")
            signal.signal(signal.SIGINT, interrupted)
            signal.signal(signal.SIGTERM, interrupted)
            result = update(config, confirm=confirmation)
            with (root / ("result-" + uuid.uuid4().hex + ".json")).open("x", encoding="utf-8") as output:
                json.dump(result, output, indent=2)
        return 0
    except (Stopped, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, EOFError) as error:
        print(str(error) if isinstance(error, Stopped) else "UPDATE_STOPPED: preserve the running website and private receipts; no fallback build.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
