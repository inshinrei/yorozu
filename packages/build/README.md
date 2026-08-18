# @yorozu/build

Vite plugin, JSR workspace generator, and TypeDoc leftover for the yorozu monorepo. The CLI lives in `packages/build-cli` as a repo-local Go binary.

## How this repo uses it

The root `package.json` `version` is the source of truth for every managed package (`@yorozu/utils`, `@yorozu/io`, `@yorozu/net`, `@yorozu/node`, `@yorozu/build`).

```sh
pnpm build:cli      # go build packages/build-cli/bin/yorozu-build
pnpm build          # build every npm-publishable package (including standalone)
pnpm lint:workspace # workspace: protocol, external version alignment, prefer protected over private/#
pnpm release:dry    # print next version, changelog, and publish list
pnpm release        # bump, build, publish to npm, commit, and tag
```

`pnpm release` is `packages/build-cli/bin/yorozu-build release --with-npm`. First release (no git tag yet) does **not** bump: it publishes the current root version and tags it. Later releases bump the root version and rewrite every managed package to match.

`docs` and `jsr` still run leftover TypeScript via `npx tsx packages/build/src/cli/leftover.ts`.

### Standalone packages

`@yorozu/fetch` sets `yorozu.standalone: true` and keeps its own version. It is still built and published by the same `release` command, but it is not rewritten to the shared root version.

## CLI

```sh
packages/build-cli/bin/yorozu-build
packages/build-cli/bin/yorozu-build build @yorozu/utils
packages/build-cli/bin/yorozu-build build :all
packages/build-cli/bin/yorozu-build lint
packages/build-cli/bin/yorozu-build release --with-npm --dry-run
```

Commands: `lint`, `build`, `publish`, `bump-version`, `gen-changelog`, `find-changed-packages`, `release`, `jsr`, `docs`, `gen-deps-graph`, `cr`.

## Config

Root `build.config.js` sets the tagging schema (`semver`) and JSR source/exclude globs. Per-package `build.config.js` can adjust Vite options and `package.json` before publish. The Go CLI loads only JSON-serializable fields via `scripts/eval-config.mjs`. Function hooks still run inside the Vite plugin and leftover JSR/docs.

The Vite plugin is `yorozuBuild` from `@yorozu/build/vite`, registered in the repo-root `vite.config.ts`.
