/**
 * Public API of the agent-poisoner core.
 *
 * The core is build-tool agnostic: it turns source code into obfuscated source
 * code. Adapters, such as the Vite plugin, only decide when to call it.
 */

export type {
  ChunkFilter,
  ObfuscateOptions,
  ResolvedObfuscateOptions,
  VocabularySource,
} from "./options.ts";
export { DEFAULT_OBFUSCATOR_OPTIONS, resolveOptions } from "./options.ts";

export type { ChunkObfuscator, CoreOptions, VocabularyFile } from "./core.ts";
export { createObfuscator, loadVocabulary } from "./core.ts";

export type { Obfuscator } from "./obfuscator.ts";
export { loadObfuscator, obfuscateCode } from "./obfuscator.ts";

export type { CasingStyle, CompoundSpec, DictionaryOptions } from "./vocabulary.ts";
export {
  buildDictionary,
  estimateIdentifierBudget,
  normalizeWord,
  PreservedString,
  sentenceToCamelCase,
  toCamelCase,
  toSnakeCase,
} from "./vocabulary.ts";

export { injectRandomComments } from "./comments.ts";

export type { SeededRandom } from "./random.ts";
export { createRandom, hashString } from "./random.ts";
