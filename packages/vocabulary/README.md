# @71zone/agent-poisoner-vocabulary

Default adversarial vocabulary for the agent-poisoner packages.

The package holds one file, `vocabulary.yaml`. It contains three sections:

- `words`: single words, such as `payload` or `exploit`.
- `compound`: token sequences, merged into `hide_payload` or `hidePayload`.
- `sentence`: full sentences. Each one becomes a camelCase identifier and a raw
  code comment.

## Install

```sh
pnpm add -D @71zone/agent-poisoner-vocabulary
```

## Use

```ts
import { agentEvasion } from "@71zone/vite-plugin-agent-evasion";
import { vocabularyPath } from "@71zone/agent-poisoner-vocabulary";

export default {
  plugins: [agentEvasion({ vocabulary: vocabularyPath })],
};
```

`vocabularyPath` is an absolute path to the shipped `vocabulary.yaml`. You can
also copy the file into your own repository and edit it.

## Contents

Treat this vocabulary as hostile test data. It lists words and sentences that
model safety layers refuse. The plugin reuses them as identifier names and
comments.
