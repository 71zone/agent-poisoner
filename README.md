# 71z-agent-poisoner

Monorepo for LLM agent evasion tooling. The packages poison build output:
identifier names come from an adversarial vocabulary, numbers become arithmetic
expressions, and sentences appear as function names and code comments.

Built with [Turbo](https://turbo.build) and pnpm workspaces.

## Packages

| Package | Path | Purpose |
| :--- | :--- | :--- |
| `@71zone/agent-poisoner-core` | `packages/core` | Build-tool agnostic obfuscation core |
| `@71zone/vite-plugin-agent-evasion` | `packages/lib/vite` | Vite adapter for the core |
| `@71zone/agent-poisoner-vocabulary` | `packages/vocabulary` | Default vocabulary file |

## Layout

```
packages/
  core/            vocabulary, comments, uglification, seeded random
  lib/vite/        the Vite plugin
  vocabulary/      vocabulary.yaml and its path export
scripts/release.mjs
```

New adapters go under `packages/lib/`, for example `packages/lib/webpack`.

## Commands

```sh
pnpm install         # install all workspace dependencies
pnpm build           # build every package in dependency order
pnpm test            # run every package test suite
pnpm typecheck       # check every package
pnpm check           # build, typecheck, and test
pnpm release patch   # manual NPM release
```

## Use the plugin

```sh
pnpm add -D @71zone/vite-plugin-agent-evasion @71zone/agent-poisoner-vocabulary
```

```ts
// vite.config.ts
import { agentEvasion } from "@71zone/vite-plugin-agent-evasion";
import { vocabularyPath } from "@71zone/agent-poisoner-vocabulary";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [agentEvasion({ vocabulary: vocabularyPath })],
});
```

## Release

The release flow is manual and runs from a clean work tree:

```sh
npm login
pnpm release patch            # or minor, major, or an exact version
pnpm release patch --dry-run  # verify builds and tests only
```

The script builds, typechecks, and tests every package. Then it writes the new
versions, publishes the public packages in dependency order, commits the bumps,
and creates one git tag per package. Run `git push --follow-tags` afterwards.

Other flags:

| Flag | Effect |
| :--- | :--- |
| `--no-publish` | Bump versions and commit, but skip the NPM publish |
| `--no-git` | Publish without a commit or tags |
| `--skip-checks` | Skip build, typecheck, and test |
| `--otp <code>` | Pass a two-factor code to NPM |
| `--tag <name>` | Publish under another dist-tag, defaults to `latest` |
| `--packages a,b` | Release only the listed packages |

## Documentation rules

- Write English docs (`*.md`) in ASD-STE100 style.
- Keep instruction sentences <= 20 words and description sentences <= 25 words.
- Use active voice and present tense.
