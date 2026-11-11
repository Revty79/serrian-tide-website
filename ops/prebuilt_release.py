"""Immutable registry discovery and signed provenance. No deployment or fallback.

GitHub CLI performs cryptographic Sigstore verification; parsed labels and JSON
alone never authorize an image. Registry credentials stay in Docker's existing
credential store. The public repository attestation endpoint needs no new login.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.request

spec = importlib.util.spec_from_file_location("serrian_prebuilt_legacy", Path(__file__).with_name("serrian_update.py"))
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
require, Stopped = legacy.require, legacy.Stopped
REPOSITORY = legacy.REPOSITORY
IMAGE = "ghcr.io/revty79/serrian-tide-website"
WORKFLOW = "prebuilt-release.yml"
WORKFLOWS = {**legacy.WORKFLOWS, WORKFLOW: "publish"}
REPOSITORY_ID, OWNER_ID = "1345519067", "132003666"
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")


class GitHub(legacy.GitHub):
    def recent(self):
        return {name: self.latest(self.runs(name), name) for name in WORKFLOWS}

    def publication(self, commit):
        run = self.latest(self.runs(WORKFLOW, commit), WORKFLOW).get(commit)
        require(self.passed(run), "IMAGE_NOT_RELEASED: the exact image publication workflow has not passed; no local build will start.")
        payload = self.get(f"actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs?per_page=100&page=1")
        jobs = payload.get("jobs", [])
        require(isinstance(jobs, list) and 0 < len(jobs) == payload.get("total_count") <= 100 and any(j.get("name") == "publish" for j in jobs), "IMAGE_CI_JOBS: incomplete publication evidence.")
        require(all(j.get("head_sha") == commit and j.get("run_id") == run["id"] and j.get("run_attempt") == run["run_attempt"] and j.get("status") == "completed" and j.get("conclusion") == "success" for j in jobs), "IMAGE_CI_JOBS: unsuccessful or mismatched publication attempt.")
        return {"workflow": WORKFLOW, "run": run["id"], "attempt": run["run_attempt"], "commit": commit}

    def verify(self, commit):
        return [*super().verify(commit), self.publication(commit)]


def select_release(git, github):
    recent = github.recent()
    head = git.run("rev-parse", "HEAD")
    for position, commit in enumerate(git.run("rev-list", "--first-parent", "--max-count=100", "origin/main").splitlines()):
        if all(github.passed(recent[name].get(commit)) for name in WORKFLOWS) and git.ancestor(head, commit):
            return commit, position
    raise Stopped("NO_ELIGIBLE_IMAGE: no forward main release has all four exact CI passes. Keep the website running and retry later; no local build will start.")


def command(args, timeout=180):
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise Stopped("IMAGE_TOOL_FAILED: image verification/download could not complete; no local build or cutover is authorized.") from None
    require(result.returncode == 0, "IMAGE_VERIFICATION_FAILED: registry access, download or signed verification failed. Preserve the running website; check registry access and retry. No local build will start.")
    return result.stdout


def descriptor(payload):
    require(isinstance(payload, dict), "IMAGE_PLATFORM: exactly one linux/amd64 image is required; an index requires separate review.")
    value = payload.get("Descriptor", {})
    require(DIGEST.fullmatch(value.get("digest", "")) and value.get("platform", {}).get("os") == "linux" and value.get("platform", {}).get("architecture") == "amd64", "IMAGE_PLATFORM: malformed digest or incompatible platform.")
    return value["digest"]


def verify_statement(results, commit, digest, publication):
    require(isinstance(results, list) and results, "IMAGE_ATTESTATION: no verified statement.")
    for result in results:
        verified = result.get("verificationResult", {})
        certificate = verified.get("signature", {}).get("certificate", {})
        statement = verified.get("statement", {})
        invocation = f"https://github.com/{REPOSITORY}/actions/runs/{publication['run']}/attempts/{publication['attempt']}"
        if (str(certificate.get("sourceRepositoryIdentifier")) == REPOSITORY_ID
                and str(certificate.get("sourceRepositoryOwnerIdentifier")) == OWNER_ID
                and certificate.get("sourceRepositoryDigest") == commit
                and certificate.get("sourceRepositoryRef") == "refs/heads/main"
                and certificate.get("runnerEnvironment") == "github-hosted"
                and certificate.get("buildTrigger") == "push"
                and certificate.get("runInvocationURI") == invocation
                and verified.get("verifiedTimestamps")
                and statement.get("predicateType") == "https://slsa.dev/provenance/v1"
                and any(s.get("name") == IMAGE and s.get("digest", {}).get("sha256") == digest.removeprefix("sha256:") for s in statement.get("subject", []))):
            return {"repositoryId": REPOSITORY_ID, "source": commit, "digest": digest, "invocation": invocation}
    raise Stopped("IMAGE_ATTESTATION_IDENTITY: signed source, repository identity, workflow attempt or subject does not match this release.")


class Registry:
    def __init__(self, verifier):
        self.verifier = str(verifier)

    def resolve(self, commit):
        require(legacy.SHA.fullmatch(commit), "IMAGE_SOURCE: full source identity required.")
        return descriptor(json.loads(command(["docker", "manifest", "inspect", "--verbose", IMAGE + ":sha-" + commit])))

    def verify(self, commit, digest, publication):
        require(DIGEST.fullmatch(digest), "IMAGE_DIGEST: invalid immutable identity.")
        url = f"https://api.github.com/repos/{REPOSITORY}/attestations/{digest}?per_page=100"
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "serrian-update/2"}
        token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = "Bearer " + token
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), legacy.NoRedirect()).open(urllib.request.Request(url, headers=headers), timeout=30) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
            require(len(raw) <= 8 * 1024 * 1024, "IMAGE_ATTESTATION: oversized response.")
            bundles = json.loads(raw).get("attestations", [])
            require(isinstance(bundles, list) and 0 < len(bundles) <= 100, "IMAGE_ATTESTATION: signed evidence unavailable.")
        except (OSError, ValueError):
            raise Stopped("IMAGE_ATTESTATION_UNAVAILABLE: cannot retrieve signed release evidence; no cutover or build.") from None
        with tempfile.TemporaryDirectory(prefix="serrian-attestation-") as directory:
            bundle = Path(directory) / "bundle.jsonl"
            bundle.write_text("\n".join(json.dumps(b["bundle"]) for b in bundles), encoding="utf-8")
            output = command([self.verifier, "attestation", "verify", "oci://" + IMAGE + "@" + digest,
                              "--bundle", str(bundle), "--repo", REPOSITORY,
                              "--signer-workflow", REPOSITORY + "/.github/workflows/" + WORKFLOW,
                              "--signer-digest", commit, "--source-digest", commit,
                              "--source-ref", "refs/heads/main", "--deny-self-hosted-runners", "--format", "json"])
            return verify_statement(json.loads(output), commit, digest, publication)

    def pull(self, digest):
        require(DIGEST.fullmatch(digest), "IMAGE_DIGEST: invalid immutable identity.")
        started = time.monotonic()
        command(["docker", "pull", "--platform", "linux/amd64", IMAGE + "@" + digest], timeout=1800)
        return time.monotonic() - started

    def identity(self, operator, digest):
        reference = IMAGE + "@" + digest
        image = operator.inspect(reference, image=True)
        require(reference in image.get("RepoDigests", []) and image.get("Os") == "linux" and image.get("Architecture") == "amd64", "IMAGE_DIGEST: downloaded image identity/platform does not match.")
        require(image["Config"].get("Labels", {}).get("org.opencontainers.image.source") == "https://github.com/" + REPOSITORY, "IMAGE_SOURCE: wrong source repository.")
        return image["Id"]
