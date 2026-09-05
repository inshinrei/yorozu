# @yorozu/build

Build and release toolkit for the yorozu monorepo. It discovers workspace packages, builds them with Vite, rewrites `workspace:` / `catalog:` dependencies, and publishes a single shared version.

## How this repo uses it

The root `package.json` `version` is the source of truth for every managed package (`@yorozu/utils`, `@yorozu/build`, and the other non-standalone workspace packages).

```sh
pnpm build          # build every npm-publishable package (including standalone)
pnpm lint:workspace # workspace: protocol, external version alignment, prefer protected over private/#
pnpm release:dry    # print next version, changelog, and publish list
pnpm release        # bump, build, publish to npm, commit, and tag
```

`pnpm release` is `yorozu-build release --with-npm`. First release (no git tag yet) does **not** bump: it publishes the current root version (`0.1.0`) and tags `v0.1.0`. Later releases bump the root version and rewrite every managed package to match.

### Standalone packages

`@yorozu/fetch`, `@yorozu/io`, `@yorozu/net`, and `@yorozu/node` set `yorozu.standalone: true` and keep their own versions. They are still built and published by the same `release` command, but they are not rewritten to the shared root version.

## CLI

```sh
yorozu-build --help
yorozu-build build @yorozu/utils
yorozu-build build :all
yorozu-build lint
yorozu-build release --with-npm --dry-run
```

Commands: `lint`, `build`, `publish`, `bump-version`, `gen-changelog`, `find-changed-packages`, `release`, `jsr`, `docs`, `gen-deps-graph`, `cr`.

## Config

Root `build.config.js` sets the tagging schema (`semver`) and JSR source/exclude globs. Per-package `build.config.js` can adjust Vite options and `package.json` before publish.

The Vite plugin is `yorozuBuild` from `@yorozu/build/vite`, registered in the repo-root `vite.config.ts`.
