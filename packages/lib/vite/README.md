# @71z/vite-agent-poisoner

Vite plugin for LLM agent evasion. It obfuscates emitted chunks with an
adversarial vocabulary, uglifies expressions, and injects sentences as function
names and code comments.

The plugin is a thin adapter. All obfuscation runs in
[`@71z/agent-poisoner-core`](../core/README.md).

## Install

```sh
pnpm add -D @71z/vite-agent-poisoner @71z/agent-poisoner-vocabulary
```

## Use

```ts
// vite.config.ts
import { agentPoisoner } from "@71z/vite-agent-poisoner";
import { vocabularyPath } from "@71z/agent-poisoner-vocabulary";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    agentPoisoner({
      vocabulary: vocabularyPath,
      // One entry chunk, nothing imports its names: rename top-level functions too.
      obfuscatorOptions: { renameGlobals: true },
    }),
  ],
});
```

The plugin runs only for `vite build`. It turns off `build.minify`, because a
minifier that runs after the obfuscator renames every identifier again.

## Options

Every core option passes through. The plugin adds `enabled`, `include`,
`exclude`, `concurrency`, and `sourcemap`. Read the
[core documentation](../core/README.md#options) for the full table.

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `enabled` | `true` | Turn the plugin off without removing it |
| `include` / `exclude` | all `.js` and `.mjs` | Chunk selectors by name |
| `concurrency` | available parallelism, max 4 | Parallel obfuscation jobs |
| `sourcemap` | `"drop"` | `"drop"` warns and omits maps; `"fail"` stops the build |

## Note

Obfuscation grows the bundle. Numbers become arithmetic expressions and strings
are split. Measure the gzip size before you release.
