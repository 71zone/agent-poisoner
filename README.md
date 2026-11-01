# vite-plugin-obfuscate

Vite plugin that obfuscates build output with
[`javascript-obfuscator`](https://github.com/javascript-obfuscator/javascript-obfuscator).

Two things make it different from a plain wrapper:

1. **Custom vocabulary.** Identifier names come from your project words, not from
   `_0x1f4a` noise. A configurable share stays classic hexadecimal, so the output
   is mixed.
2. **Deterministic output.** The same source and seed always produce the same
   bundle, so builds stay reproducible and chunk hashes stay stable.

## Install

```bash
pnpm add -D @71zone/vite-plugin-obfuscate
```

The package ships compiled `dist/` files and builds itself on `pnpm install`.

## Use

```ts
// vite.config.ts
import { obfuscate } from "@71zone/vite-plugin-obfuscate";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [obfuscate({ vocabulary: "obfuscate.vocabulary.json" })],
});
```

```json
// obfuscate.vocabulary.json
{
  "words": ["vault", "spin", "luck", "gold"],
  "compound": {
    "prefixes": ["gold", "lucky"],
    "suffixes": ["vault", "wheel"]
  }
}
```

Words become identifiers such as `goldvault` or `spin`, and compound pools grow
the list to `goldvault`, `goldwheel`, `luckyvault`, `luckywheel`. The plugin
extends the list further with numeric suffixes when a chunk needs more names.

## Options

| Option | Default | Meaning |
|:---|:---|:---|
| `enabled` | `true` | Turn the plugin off without removing it. |
| `vocabulary` | none | Inline words, or a path to `.json` (array or `{ words, compound }`) or `.txt` (one word per line). |
| `compound` | `false` | Compound word pools; overrides the pool from the vocabulary file. |
| `hexShare` | `0.25` | Share of classic `_0x…` names mixed into the vocabulary. |
| `minDictionarySize` | `512` | Lower bound for the per-chunk dictionary. |
| `maxDictionarySize` | `32768` | Upper bound; the plugin warns when a chunk needs more. |
| `seed` | vocabulary hash | Seed for the identifier shuffle. |
| `include` / `exclude` | all `.js`, `.mjs` chunks | Chunk selectors: `RegExp`, `RegExp[]`, or a predicate. |
| `concurrency` | parallelism, max 4 | Parallel obfuscation jobs. |
| `sourcemap` | `"drop"` | `"drop"` warns and omits maps; `"fail"` stops the build. |
| `obfuscatorOptions` | see below | Merged over the defaults. |

### Default obfuscator options

Safe defaults for code that runs per frame or per request:

- `compact`, `simplify`, `stringArray` with `base64`, `splitStrings`,
  `transformObjectKeys`.
- Off: `controlFlowFlattening`, `deadCodeInjection`, `selfDefending`,
  `debugProtection`, `disableConsoleOutput`, `stringArrayCallsTransform`.
- `renameGlobals: false`, so exported and global names stay stable.

Turn on `controlFlowFlattening` only for cold code. It multiplies the cost of
every call.

## Behavior

- Runs for `vite build` only. Development and preview are untouched.
- Obfuscates in `renderChunk`, so chunk hashes cover the obfuscated bytes.
- Turns `build.minify` off. A minifier after the obfuscator would rename every
  identifier back to `a`, `b`, `c`. CSS minification is preserved.
- Drops source maps for obfuscated chunks: they cannot survive renaming.

## Reuse outside Vite

```ts
import { createObfuscator } from "@71zone/vite-plugin-obfuscate";

const run = createObfuscator({ vocabulary: ["vault", "spin"], seed: "release" });
const output = await run(sourceCode, "app.js");
```

## Commands

- `pnpm build` compiles `src/` to `dist/`.
- `pnpm test` runs the tests with the Node test runner.
- `pnpm typecheck` runs `tsc --noEmit`.
