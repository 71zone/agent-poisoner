# AGENTS.md — `71z-agent-poisoner`

Monorepo for LLM agent evasion packages. Turbo runs the tasks. pnpm manages the
workspace. Child packages live under `packages/`.

## Stack

- TypeScript, ESM only. Node 24, pnpm 10, Turbo 2.
- `javascript-obfuscator` does the low-level code transformation.
- Tests use the Node test runner (`node --test`), not Vitest.

## Packages

| Path | Package | Role |
| :--- | :--- | :--- |
| `packages/core` | `@71z/agent-poisoner-core` | Vocabulary, options, comment injection, uglification |
| `packages/lib/vite` | `@71z/vite-agent-poisoner` | Vite adapter, no obfuscation logic |
| `packages/vocabulary` | `@71z/agent-poisoner-vocabulary` | `vocabulary.yaml` and `vocabularyPath` |

## Commands

- `pnpm build` builds all packages. Turbo resolves the order.
- `pnpm test` runs every package test suite.
- `pnpm typecheck` checks types.
- `pnpm check` builds, typechecks, and tests.
- `pnpm release <bump>` publishes to NPM. Read `scripts/release.mjs` first.

Do not deploy or publish without approval from the user.

## Guardrails

- Keep `packages/core` free of build-tool imports. Adapters import the core.
- Import between packages by package name, never by relative path.
- Use `workspace:*` for internal dependencies. pnpm rewrites it on publish.
- Keep every package ESM. Do not add CommonJS output.
- Keep `packages/vocabulary/vocabulary.yaml` as the single vocabulary source.
- Do not add tests for wiring, defaults, or source text. Test behavior.

## Commit rules

1. Group commits by feature or domain. Fold tests into the feature commit.
2. Stage explicit paths only: `git add -- <paths>`. Never run `git add -A`.
3. Use `<type>: <subject>` (`feat`, `fix`, `refactor`, `perf`, `chore`, `docs`,
   `test`, `style`). Lowercase, imperative, <= 72 characters, no trailing period.
4. Write the subject line only. No body, no trailers, no AI attribution.
5. Never run `git push` unless the user asks.
