# Agent instructions

Workspace packages share one lockstep version (currently on the root `package.json`). Packages under `packages/_standalone/` are **not** in that lockstep (`yorozu.standalone`).

## Version bump on user-facing commits

Every commit whose conventional type is `feat`, `fix`, `perf`, or `revert` must increment the **patch** of:

- the repo root `package.json`
- every managed workspace package (`packages/*/package.json` except `_standalone` and test fixtures)

by **+1**, in **the same commit** as the code change. Do not leave a follow-up `chore: ver bump` for those types.

Do **not** bump on `docs`, `test`, `chore`, `ci`, `style`, or `refactor`.

Do **not** bump standalone packages. Do not publish from a bump-only thought; publishing stays `pnpm release`.

`feat` is still a patch here (not minor). Use `pnpm exec tsx packages/build/src/cli/main.ts bump-version --type minor|major` only when the human explicitly wants a minor/major cut.

Example: root and managed packages at `1.0.30` + `fix(utils): …` → all of those `package.json` files become `1.0.31` in that fix commit.

## Code style

- `let` over `const` except arrow functions and exported/module-level constants
- 4-space indent, no semicolons, double quotes
