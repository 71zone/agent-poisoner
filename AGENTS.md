# AGENTS.md

Workspace: https://github.com/71zone/bauvatcf-workspace

Shared Vite plugin that obfuscates build output for the other repositories.

## Stack

- TypeScript, ESM only. `javascript-obfuscator` does the obfuscation.
- Node 24, pnpm 10. Tests use the built-in Node test runner.
- Consumed by `bauvatcf-web` through a pnpm `link:` dependency.

## Commands

- `pnpm build` compiles `src/` to `dist/`. `pnpm install` runs it through `prepare`.
- `pnpm test` runs every test in `test/`.
- `pnpm typecheck` checks types, including the tests.

## Guardrails

- Publish `dist/`, never `src/`: consumers must not typecheck our sources.
- Consumers read `dist/`. Run `pnpm build` after you edit `src/`, before you build a
  consumer: a stale `dist` silently replaces vocabulary names with the old behavior.
- Relative imports carry the `.ts` extension. Node needs it to run the sources
  and the build rewrites it to `.js`.
- Keep obfuscation in `renderChunk`. `generateBundle` runs after chunk hashes are
  fixed, so a change there breaks cache busting.
- Keep the default obfuscator options cheap. The consumers ship code that runs
  per frame or per request.
- Vocabulary output must stay deterministic: same code and seed, same bytes.
- Do not touch other repositories in the workspace.
