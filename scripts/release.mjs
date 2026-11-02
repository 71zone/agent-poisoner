#!/usr/bin/env node
/**
 * Manual NPM release for the agent-poisoner monorepo.
 *
 * Steps, in order:
 *   1. Read every workspace package.
 *   2. Compute the next version for each package.
 *   3. Verify: build, typecheck, and test with Turbo.
 *   4. Write the new versions into the package manifests.
 *   5. Publish the public packages in dependency order.
 *   6. Commit the bumps and tag each published package.
 *
 * Usage:
 *   pnpm release patch                 # 0.1.0 -> 0.1.1
 *   pnpm release minor
 *   pnpm release major
 *   pnpm release 0.2.0-rc.1            # exact version
 *   pnpm release patch --dry-run       # verify only, change nothing
 *   pnpm release patch --skip-checks   # do not build or test
 *   pnpm release patch --no-git        # do not commit or tag
 *   pnpm release patch --otp 123456    # two-factor code
 *   pnpm release patch --tag next      # NPM dist-tag, defaults to latest
 *   pnpm release patch --packages a,b  # restrict the release to some packages
 */
import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = new URL("..", import.meta.url).pathname;
const PACKAGES_DIR = join(ROOT, "packages");
const BUMP_TYPES = ["patch", "minor", "major"];

main().catch((error) => {
  console.error(`release failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packages = await readPackages();

  if (packages.length === 0) {
    throw new Error("no workspace packages found under packages/");
  }

  const selected = selectPackages(packages, args.packages);
  const order = sortByDependencies(selected);
  const plan = order.map((pkg) => ({ pkg, version: nextVersion(pkg.version, args.bump) }));

  console.log(`release ${args.bump} of ${plan.length} package(s):`);

  for (const { pkg, version } of plan) {
    console.log(`  ${pkg.name}: ${pkg.version} -> ${version}`);
  }

  if (!args.dryRun && !args.noGit) {
    await assertCleanTree();
  }

  if (!args.skipChecks) {
    await verify();
  }

  if (args.dryRun) {
    console.log("dry run: nothing changed");
    return;
  }

  if (!args.noPublish && !args.skipAuthCheck) {
    await assertNpmAuth();
  }

  for (const { pkg, version } of plan) {
    pkg.version = version;
    await writeManifest(pkg);
  }

  if (args.noPublish) {
    console.log("skipped the npm publish");
  } else {
    for (const { pkg, version } of plan) {
      await publish(pkg, args);
      console.log(`published ${pkg.name}@${version}`);
    }
  }

  if (args.noGit) {
    console.log("skipped the git commit and tags");
    return;
  }

  await commitAndTag(plan, args.bump);
}

function parseArgs(argv) {
  const args = {
    bump: undefined,
    dryRun: false,
    noGit: false,
    noPublish: false,
    skipChecks: false,
    skipAuthCheck: false,
    otp: undefined,
    tag: "latest",
    packages: undefined,
  };

  const rest = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--no-git":
        args.noGit = true;
        break;
      case "--no-publish":
        args.noPublish = true;
        break;
      case "--skip-checks":
        args.skipChecks = true;
        break;
      case "--skip-auth-check":
        args.skipAuthCheck = true;
        break;
      case "--otp":
        index += 1;
        args.otp = argv[index];
        break;
      case "--tag":
        index += 1;
        args.tag = argv[index];
        break;
      case "--packages":
        index += 1;
        args.packages = (argv[index] ?? "").split(",").map((name) => name.trim()).filter(Boolean);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`unknown option ${arg}`);
        }

        rest.push(arg);
    }
  }

  args.bump = rest[0];

  if (!args.bump) {
    printHelp();
    throw new Error("missing version argument: patch, minor, major, or an exact version");
  }

  if (!BUMP_TYPES.includes(args.bump) && !isVersion(args.bump)) {
    throw new Error(`invalid version argument ${args.bump}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: pnpm release <patch|minor|major|x.y.z> [options]

Options:
  --dry-run           verify only; change no files and publish nothing
  --no-publish        bump versions and commit, but do not publish
  --skip-checks       do not run build, typecheck, or test
  --skip-auth-check   do not check npm login first
  --no-git            do not commit or tag
  --otp <code>        two-factor code for npm
  --tag <dist-tag>    npm dist-tag, defaults to latest
  --packages <names>  comma-separated package names to release`);
}

/** Recursively read workspace manifests, skipping node_modules and dist. */
async function readPackages() {
  const packages = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }

      const path = join(directory, entry.name);
      const children = await readdir(path, { withFileTypes: true });

      if (children.some((child) => child.isFile() && child.name === "package.json")) {
        const manifestPath = join(path, "package.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

        packages.push({
          name: manifest.name,
          version: manifest.version,
          private: manifest.private === true,
          directory: path,
          manifestPath,
          manifest,
          dependencies: [
            ...Object.keys(manifest.dependencies ?? {}),
            ...Object.keys(manifest.devDependencies ?? {}),
            ...Object.keys(manifest.peerDependencies ?? {}),
          ],
        });
      }

      await walk(path);
    }
  }

  await walk(PACKAGES_DIR);

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function selectPackages(packages, names) {
  if (!names) {
    return packages.filter((pkg) => !pkg.private);
  }

  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const selected = names.map((name) => {
    const found = byName.get(name);

    if (!found) {
      throw new Error(`unknown package ${name}`);
    }

    return found;
  });

  return selected.filter((pkg) => !pkg.private);
}

/** Publish dependencies before the packages that need them. */
function sortByDependencies(packages) {
  const names = new Set(packages.map((pkg) => pkg.name));
  const visited = new Set();
  const sorted = [];

  function visit(pkg) {
    if (visited.has(pkg.name)) {
      return;
    }

    visited.add(pkg.name);

    for (const dependency of pkg.dependencies) {
      const local = packages.find((candidate) => candidate.name === dependency);

      if (local && names.has(dependency)) {
        visit(local);
      }
    }

    sorted.push(pkg);
  }

  for (const pkg of packages) {
    visit(pkg);
  }

  return sorted;
}

function isVersion(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function nextVersion(version, bump) {
  if (!BUMP_TYPES.includes(bump)) {
    return bump;
  }

  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);

  if (!match) {
    throw new Error(`cannot bump ${version}`);
  }

  const [major, minor, patch] = match.slice(1).map(Number);

  if (bump === "major") {
    return `${major + 1}.0.0`;
  }

  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

async function writeManifest(pkg) {
  pkg.manifest.version = pkg.version;
  const content = `${JSON.stringify(pkg.manifest, null, 2)}\n`;
  await writeFile(pkg.manifestPath, content);
}

async function assertCleanTree() {
  const { stdout } = await run("git", ["status", "--porcelain"], { cwd: ROOT });

  if (stdout.trim()) {
    throw new Error(`the work tree is dirty. Commit or stash first:\n${stdout.trim()}`);
  }
}

async function assertNpmAuth() {
  try {
    const { stdout } = await run("npm", ["whoami"], { cwd: ROOT });
    console.log(`npm user: ${stdout.trim()}`);
  } catch {
    throw new Error("not logged in to npm. Run `npm login` first, or pass --skip-auth-check");
  }
}

async function verify() {
  console.log("verifying: turbo run build typecheck test");
  await runInherit("pnpm", ["turbo", "run", "build", "typecheck", "test"]);
}

async function publish(pkg, args) {
  const flags = ["publish", "--access", "public", "--no-git-checks", "--tag", args.tag];

  if (args.otp) {
    flags.push("--otp", args.otp);
  }

  await runInherit("pnpm", flags, { cwd: pkg.directory });
}

async function commitAndTag(plan, bump) {
  const paths = plan.map(({ pkg }) => relative(ROOT, pkg.manifestPath));

  await runInherit("git", ["add", "--", ...paths], { cwd: ROOT });
  const version = plan[0]?.version ?? bump;
  const { stdout: staged } = await run("git", ["diff", "--cached", "--name-only"], { cwd: ROOT });

  if (staged.trim()) {
    await runInherit("git", ["commit", "-m", `chore: release v${version}`], { cwd: ROOT });
  }
  for (const { pkg, version } of plan) {
    await runInherit("git", ["tag", `${pkg.name}@${version}`], { cwd: ROOT });
    console.log(`tagged ${pkg.name}@${version}`);
  }
}

async function runInherit(command, args, options = {}) {
  const { stdout } = await run(command, args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, ...options });

  if (stdout) {
    process.stdout.write(stdout);
  }
}
