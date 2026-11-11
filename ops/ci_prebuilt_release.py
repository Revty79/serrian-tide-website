"""Owned CI transport/publisher. Never loads a host environment or private data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

from ubuntu_deploy import Operator
from prebuilt_release import IMAGE, REPOSITORY, Registry, legacy, require


def context():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted" and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY and os.environ.get("GITHUB_EVENT_NAME") == "push" and os.environ.get("GITHUB_REF") == "refs/heads/main", "CI_PUBLICATION_CONTEXT: only the owned public-main hosted workflow may publish.")
    commit = os.environ["GITHUB_SHA"]
    require(legacy.SHA.fullmatch(commit) and subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == commit, "CI_SOURCE: checkout does not match the push.")
    return commit


def output(name, value):
    require(re.fullmatch(r"[a-z-]+", name) and "\n" not in str(value), "CI_OUTPUT: invalid metadata.")
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as stream:
        stream.write(f"{name}={value}\n")


def export_image(commit, directory):
    directory.mkdir(parents=True, exist_ok=False)
    operator = Operator(Path.cwd(), commit)
    _archive, source = operator.expected_source()
    image_id = operator.checked_image("serriantide:" + commit, source)
    receipt = json.loads(operator.docker("run", "--rm", "--network", "none", "--read-only", image_id, "node", "-e", "console.log(require('fs').readFileSync('.serrian-build.json','utf8'))").stdout)
    target = directory / "website.tar"
    operator.docker("image", "save", "--output", str(target), image_id)
    h = hashlib.sha256()
    with target.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    metadata = {"version": 1, "commit": commit, "imageId": image_id, "sourceHash": source, "tarSha256": h.hexdigest(), "bytes": target.stat().st_size, "build": receipt}
    (directory / "transport.json").write_text(json.dumps(metadata))
    print(json.dumps({"publicImageBytes": metadata["bytes"], "imageId": image_id, "sourceHash": source}), flush=True)


def wait_checks(commit):
    github = legacy.GitHub()
    deadline = time.monotonic() + 5400
    while time.monotonic() < deadline:
        runs = {name: github.latest(github.runs(name, commit), name).get(commit) for name in legacy.WORKFLOWS}
        failed = any(run and run.get("status") == "completed" and not github.passed(run) for run in runs.values())
        require(not failed, "SOURCE_CI_FAILED: no image publication; preserve failed evidence.")
        if all(github.passed(run) for run in runs.values()):
            evidence = github.verify(commit)
            deployment = next(e for e in evidence if e["workflow"] == "deployment-a5.yml")
            output("run", deployment["run"])
            output("artifact", f"website-{commit}-{deployment['run']}-{deployment['attempt']}")
            print("All three exact source workflows and latest-attempt jobs passed.", flush=True)
            return
        print("Waiting for exact source validation/recovery/deployment results; no image is eligible.", flush=True)
        time.sleep(30)
    raise legacy.Stopped("SOURCE_CI_TIMEOUT: source checks did not close; no publication.")


def load_image(commit, directory):
    metadata = json.loads((directory / "transport.json").read_text())
    require(metadata.get("version") == 1 and metadata.get("commit") == commit and re.fullmatch(r"sha256:[a-f0-9]{64}", metadata.get("imageId", "")), "TRANSPORT_IDENTITY: malformed image evidence.")
    h = hashlib.sha256()
    with (directory / "website.tar").open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    require(h.hexdigest() == metadata["tarSha256"] and (directory / "website.tar").stat().st_size == metadata["bytes"], "TRANSPORT_CORRUPT: archive differs from the tested image.")
    operator = Operator(Path.cwd(), commit)
    operator.docker("image", "load", "--input", str(directory / "website.tar"))
    _archive, source = operator.expected_source()
    require(source == metadata["sourceHash"], "TRANSPORT_SOURCE: tested source differs from current exact commit.")
    require(operator.checked_image(metadata["imageId"], source) == metadata["imageId"], "TRANSPORT_BUILD: image did not preserve its tested identity.")
    # Deny private authorities at runtime; source context was already a Git-only
    # allowlist. Do not supply credentials, fixture mounts or the Docker socket.
    audit = "const fs=require('fs');for(const p of ['/app/.env','/app/.env.local','/app/.env.production','/app/.git','/app/storage','/app/artifacts'])if(fs.existsSync(p))throw Error('PRIVATE_IMAGE_PATH');console.log('PUBLIC_SOURCE_IMAGE_OK')"
    operator.docker("run", "--rm", "--network", "none", "--read-only", metadata["imageId"], "node", "-e", audit)
    operator.smoke(metadata["imageId"])
    return operator, metadata


def publish(commit, directory):
    legacy.GitHub().verify(commit)
    operator, metadata = load_image(commit, directory)
    target = IMAGE + ":sha-" + commit
    existing = operator.docker("manifest", "inspect", "--verbose", target, allow_failure=True)
    if existing.returncode == 0:
        # Reruns never replace a published commit with a different build.
        registry = Registry("gh")
        digest = registry.resolve(commit)
        registry.pull(digest)
        require(registry.identity(operator, digest) == metadata["imageId"], "IMMUTABLE_TAG_OCCUPIED: preserve the existing image; do not overwrite a different build.")
    else:
        require(any(marker in (existing.stderr + existing.stdout).lower() for marker in (b"manifest unknown", b"no such manifest")), "REGISTRY_UNAVAILABLE: cannot prove the commit tag is absent; no overwrite is authorized.")
        operator.docker("tag", metadata["imageId"], target)
        operator.docker("push", target)
        digest = Registry("gh").resolve(commit)
    output("digest", digest)
    print(json.dumps({"commit": commit, "digest": digest, "imageId": metadata["imageId"], "sourceHash": metadata["sourceHash"]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("export", "wait", "publish"))
    parser.add_argument("--directory", default="artifacts/prebuilt-public-image")
    args = parser.parse_args()
    commit = context()
    if args.action == "wait":
        wait_checks(commit)
    elif args.action == "export":
        export_image(commit, Path(args.directory).resolve())
    else:
        publish(commit, Path(args.directory).resolve())


if __name__ == "__main__":
    main()
