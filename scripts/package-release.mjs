import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORY = "GizClaw/music-video-games";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const digest = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const tarballName = ({ name, version }) => `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

function workspaces() {
  const packages = readdirSync(join(ROOT, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join(ROOT, "packages", entry.name);
      return { directory, manifest: json(join(directory, "package.json")) };
    }).filter(({ manifest }) => !manifest.private)
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  assert(packages.length > 0, "No public workspace packages");
  const versions = new Map(packages.map(({ manifest: pkg }) => [pkg.name, pkg.version]));
  assert.equal(versions.size, packages.length, "Duplicate package names");
  for (const { manifest: pkg } of packages) {
    assert.match(pkg.name, /^@gizclaw\/mvg-[a-z0-9-]+$/);
    assert.match(pkg.version, SEMVER, `${pkg.name} needs its own stable SemVer`);
    for (const group of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, version] of Object.entries(pkg[group] || {})) {
        assert(!/^(workspace|file|link):/.test(version), `${pkg.name}: unpublished dependency ${name}`);
        if (versions.has(name)) assert.equal(version, versions.get(name), `${pkg.name}: ${name} version mismatch`);
      }
    }
  }
  return packages;
}

export function timestampTag() {
  return `v${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}`;
}

export function packRelease(directory, tag = timestampTag()) {
  assert.match(tag, /^v\d{8}-\d{6}$/);
  const output = resolve(directory);
  mkdirSync(output, { recursive: true });
  assert.deepEqual(readdirSync(output), [], "Package output must be empty");
  const staging = mkdtempSync(join(tmpdir(), "mvg-pack-"));
  try {
    const entries = workspaces().map(({ directory: source, manifest }) => {
      const stage = join(staging, basename(source));
      cpSync(source, stage, { recursive: true, filter: (path) => !["node_modules", "dist", "__pycache__"].includes(basename(path)) });
      cpSync(join(ROOT, "LICENSE"), join(stage, "LICENSE"));
      const [packed] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", output], { cwd: stage, encoding: "utf8" }));
      assert.equal(packed.name, manifest.name);
      assert.equal(packed.version, manifest.version);
      assert.equal(packed.filename, tarballName(manifest));
      const bytes = readFileSync(join(output, packed.filename));
      assert.equal(packed.integrity, `sha512-${createHash("sha512").update(bytes).digest("base64")}`);
      return { name: packed.name, version: packed.version, tarball: packed.filename, size: bytes.length, sha256: digest(bytes) };
    });
    const index = {
      format: 1, repository: REPOSITORY, version: tag,
      source_commit: git("rev-parse", "HEAD"),
      working_tree: git("status", "--porcelain") !== "",
      workflow: ".github/workflows/release.yml",
      package_count: entries.length, packages: entries,
    };
    const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
    writeFileSync(join(output, "npm-index.json"), indexBytes);
    writeFileSync(join(output, "SHA256SUMS"), [
      ...entries.map((pkg) => `${pkg.sha256}  ${pkg.tarball}`),
      `${digest(indexBytes)}  npm-index.json`,
    ].join("\n") + "\n");
    verifyRelease(output);
    return index;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function verifyRelease(directory) {
  const indexBytes = readFileSync(join(directory, "npm-index.json"));
  const index = JSON.parse(indexBytes);
  const expected = workspaces();
  assert.equal(index.format, 1);
  assert.equal(index.repository, REPOSITORY);
  assert.match(index.version, /^v\d{8}-\d{6}$/);
  assert.equal(index.source_commit, git("rev-parse", "HEAD"));
  assert.equal(index.workflow, ".github/workflows/release.yml");
  assert.equal(typeof index.working_tree, "boolean");
  if (process.env.GITHUB_ACTIONS === "true") assert.equal(index.working_tree, false, "Cannot release a dirty checkout");
  assert.equal(index.package_count, expected.length);
  assert.equal(index.packages.length, expected.length);
  const checksums = [];
  for (const [i, { manifest }] of expected.entries()) {
    const pkg = index.packages[i];
    assert.equal(pkg.name, manifest.name);
    assert.equal(pkg.version, manifest.version);
    assert.equal(pkg.tarball, tarballName(manifest));
    const path = join(directory, pkg.tarball);
    const bytes = readFileSync(path);
    assert.equal(bytes.length, pkg.size);
    assert.equal(digest(bytes), pkg.sha256, `${pkg.tarball}: checksum differs`);
    const archived = JSON.parse(execFileSync("tar", ["-xOf", path, "package/package.json"], { encoding: "utf8" }));
    assert.deepEqual(archived, manifest, `${pkg.tarball}: package.json differs from source`);
    const files = execFileSync("tar", ["-tzf", path], { encoding: "utf8" }).trim().split("\n");
    assert(files.includes("package/LICENSE"), `${pkg.tarball}: missing license`);
    assert(files.every((file) => file.startsWith("package/") && !/(^|\/)(node_modules|__pycache__|\.git)(\/|$)|\.pyc$/.test(file)), `${pkg.tarball}: unexpected archive contents`);
    checksums.push(`${pkg.sha256}  ${pkg.tarball}`);
  }
  checksums.push(`${digest(indexBytes)}  npm-index.json`);
  assert.equal(readFileSync(join(directory, "SHA256SUMS"), "utf8"), checksums.join("\n") + "\n");
  assert.deepEqual(readdirSync(directory).sort(), [...index.packages.map((pkg) => pkg.tarball), "npm-index.json", "SHA256SUMS"].sort(), "Release inventory differs");
  return index;
}

function checkHistory(directory, historyFile) {
  const index = verifyRelease(directory);
  const releases = json(historyFile).flat().filter((release) => !release.draft);
  for (const pkg of index.packages) {
    for (const release of releases) {
      for (const asset of release.assets || []) {
        if (asset.name !== pkg.tarball) continue;
        assert.equal(asset.digest, `sha256:${pkg.sha256}`, `${pkg.name}@${pkg.version} was published with different contents in ${release.tag_name}; bump this package's version`);
      }
    }
  }
  console.log(`Package identities checked against ${releases.length} published releases`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory, extra] = process.argv.slice(2);
  assert(directory, "usage: node scripts/package-release.mjs pack|verify|history <directory> [tag|history.json]");
  if (command === "pack") console.log(JSON.stringify(packRelease(directory, extra), null, 2));
  else if (command === "verify") console.log(JSON.stringify(verifyRelease(directory), null, 2));
  else if (command === "history") checkHistory(directory, extra);
  else throw new Error(`Unknown command: ${command}`);
}
