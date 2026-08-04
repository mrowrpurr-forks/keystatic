#!/usr/bin/env node
// Build + publish this keystatic fork's `@keystatic/core` to GitHub Packages
// as `@mrowrpurr-forks/keystatic-core`, tagged `purr`.
//
//   node scripts/publish-fork.mjs           bump prerelease, build, publish
//   node scripts/publish-fork.mjs --no-build   skip the (slow) rebuild
//   node scripts/publish-fork.mjs --dry-run    do everything except publish
//
// See FORK.md for the why and the blog-side install.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = resolve(repoRoot, 'packages/keystatic');
const pkgPath = resolve(pkgDir, 'package.json');
const packDir = resolve(repoRoot, '.local-packs');

const FORK_NAME = '@mrowrpurr-forks/keystatic-core';
const FORK_REPO = 'https://github.com/mrowrpurr-forks/keystatic';
const REGISTRY = 'https://npm.pkg.github.com';
const DIST_TAG = 'purr';

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--no-build');
const dryRun = args.has('--dry-run');

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { stdio: 'inherit', shell: true, ...opts });

function nextVersion(current) {
  const match = /^(\d+\.\d+\.\d+)-purr\.(\d+)$/.exec(current);
  if (match) return `${match[1]}-purr.${Number(match[2]) + 1}`;
  return `${current.split('-')[0]}-purr.1`;
}

// 1. bump the prerelease version — kept in the real package.json (name stays
//    @keystatic/core), so this is the change you commit after publishing.
const original = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(original);
const version = nextVersion(pkg.version);
pkg.version = version;
const keptContent = `${JSON.stringify(pkg, null, 2)}\n`;
writeFileSync(pkgPath, keptContent);
console.log(`\n📦 ${FORK_NAME}@${version}\n`);

// 2. build the bundles
if (skipBuild) {
  console.log('⏭️  skipping build (--no-build)\n');
} else {
  run('pnpm', ['build:packages'], { cwd: repoRoot });
}

// 3. pack under the fork name (transient rename, always restored)
mkdirSync(packDir, { recursive: true });
const tarball = resolve(
  packDir,
  `${FORK_NAME.replace('@', '').replace('/', '-')}-${version}.tgz`
);
try {
  const forked = JSON.parse(keptContent);
  forked.name = FORK_NAME;
  forked.repository = FORK_REPO;
  forked.publishConfig = { registry: REGISTRY };
  writeFileSync(pkgPath, `${JSON.stringify(forked, null, 2)}\n`);
  run('pnpm', ['pack', '--pack-destination', packDir], { cwd: pkgDir });
} finally {
  writeFileSync(pkgPath, keptContent);
}

// 4. publish the tarball to GitHub Packages
//    GH Packages requires auth even for public installs, so make sure the
//    package-local .npmrc reads the token from the env.
const npmrcPath = resolve(pkgDir, '.npmrc');
const npmrcLine = '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n';
if (!existsSync(npmrcPath) || !readFileSync(npmrcPath, 'utf8').includes('_authToken')) {
  writeFileSync(npmrcPath, npmrcLine);
}

const token = execFileSync('gh', ['auth', 'token'], {
  encoding: 'utf8',
  shell: true,
}).trim();

if (dryRun) {
  console.log(`\n🧪 --dry-run: packed ${tarball} but not publishing.\n`);
} else {
  run(
    'npm',
    [
      'publish',
      tarball,
      '--registry',
      REGISTRY,
      '--tag',
      DIST_TAG,
      '--access',
      'public',
    ],
    { cwd: pkgDir, env: { ...process.env, NODE_AUTH_TOKEN: token } }
  );
  console.log(`\n✅ published ${FORK_NAME}@${version}`);
}

console.log(
  [
    '',
    'Install in the blog (needs GITHUB_TOKEN in env — see FORK.md):',
    '',
    `  GITHUB_TOKEN=$(gh auth token) \\`,
    `    bun add "@keystatic/core@npm:${FORK_NAME}@${version}"`,
    '',
    'Then commit the version bump in this repo.',
    '',
  ].join('\n')
);
