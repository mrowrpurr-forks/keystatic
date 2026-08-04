# Fork notes

This is a fork of [keystatic](https://github.com/Thinkmill/keystatic) that adds
**raw source editing** to the mdx/markdoc editor ([#1454]): a toolbar button
flips the rich text editor to a syntax-highlighted textarea of the underlying
mdx/markdoc, and back. See the commits on
`issues/1454-button-to-edit-raw-text`.

`@keystatic/core` from this fork is published to **GitHub Packages** under the
`mrowrpurr-forks` org as **`@mrowrpurr-forks/keystatic-core`** so real projects
(e.g. the mrowr.ing blog) can install it.

[#1454]: https://github.com/Thinkmill/keystatic/issues/1454

## Build & publish

One command from the repo root:

```bash
pnpm publish:fork
```

It bumps the prerelease version (`0.6.4-purr.N` → `…N+1`), runs
`pnpm build:packages`, packs the package under the fork name, and publishes the
tarball to GitHub Packages tagged `purr`. Flags: `--no-build` (skip the rebuild
when only re-publishing) and `--dry-run` (pack but don't publish).

Then **commit the version bump** it made to `packages/keystatic/package.json`.

Notes:

- The published package is renamed to `@mrowrpurr-forks/keystatic-core`, but the
  rename is only transient — `packages/keystatic/package.json` keeps the name
  `@keystatic/core` and just carries the bumped `-purr.N` version. Only the
  version bump should ever be committed.
- Auth comes from `gh auth token` (needs `write:packages`). The script writes a
  git-ignored `packages/keystatic/.npmrc` that reads the token from the env.
- Prerelease versions are unique per publish on purpose: bun's tarball integrity
  check rejects a re-published same-version tarball, so never reuse a version.

## Install in a consuming project (the blog)

The blog aliases the public package name to the fork so nothing else has to
change:

```bash
# package.json:
#   "@keystatic/core": "npm:@mrowrpurr-forks/keystatic-core@0.6.4-purr.N"

GITHUB_TOKEN=$(gh auth token) \
  bun add "@keystatic/core@npm:@mrowrpurr-forks/keystatic-core@0.6.4-purr.N"
```

The blog's `bunfig.toml` points the `@mrowrpurr-forks` scope at the registry:

```toml
[install.scopes]
"@mrowrpurr-forks" = { url = "https://npm.pkg.github.com", token = "$GITHUB_TOKEN" }
```

### GitHub Packages needs a token even for public installs

Unlike npmjs, GitHub Packages requires auth for *every* install, public or not.
So:

- **Locally:** `export GITHUB_TOKEN=$(gh auth token)` before `bun install`.
- **On Vercel (or any CI):** add a `GITHUB_TOKEN` env var — a PAT with
  `read:packages` is enough — or dependency resolution fails.

### Alternative: publish to npmjs instead

If the mandatory token is annoying, publish to npmjs under a personal scope
(e.g. `@mrowrpurr/keystatic-core`) instead. npmjs public packages install with
no auth anywhere, so the blog wouldn't need `GITHUB_TOKEN` and `bunfig.toml`
could go away. The publish script would just drop the GitHub registry/token
bits.
