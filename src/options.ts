/**
 * Plugin options and the `javascript-obfuscator` defaults.
 */
import { availableParallelism } from "node:os";
import type { ObfuscatorOptions } from "javascript-obfuscator";
import type { CompoundSpec } from "./vocabulary.ts";

/** Chunk selector: regular expressions and/or a predicate on the chunk file name. */
export type ChunkFilter = RegExp | readonly RegExp[] | ((fileName: string) => boolean);

/** A `.json` or `.txt` vocabulary file, or an inline word list. */
export type VocabularySource = readonly string[] | string;

export interface ObfuscateOptions {
  /** Turn the plugin off without removing it. Defaults to `true`. */
  enabled?: boolean;
  /**
   * Custom identifier vocabulary. Inline words, or a path to a `.json` file
   * (`string[]` or `{ words, compound }`) or a `.txt` file with one word per
   * line. Relative paths resolve against the Vite project root.
   */
  vocabulary?: VocabularySource;
  /** Compound word pools that grow the vocabulary deterministically. */
  compound?: CompoundSpec | false;
  /** Lower bound for the per-chunk dictionary. Defaults to 512. */
  minDictionarySize?: number;
  /** Upper bound for the per-chunk dictionary. Defaults to 32768. */
  maxDictionarySize?: number;
  /** Share of classic `_0x…` names mixed into the vocabulary. Defaults to 0.25. */
  hexShare?: number;
  /** Seed for the identifier shuffle. Defaults to a hash of the vocabulary. */
  seed?: string | number;
  /** Chunks to obfuscate. Defaults to every emitted `.js` and `.mjs` chunk. */
  include?: ChunkFilter;
  /** Chunks to leave alone. Wins over `include`. */
  exclude?: ChunkFilter;
  /** Parallel obfuscation jobs. Defaults to the available parallelism, capped at 4. */
  concurrency?: number;
  /** Sourcemap policy for obfuscated chunks. Defaults to `drop`. */
  sourcemap?: "drop" | "fail";
  /** Extra `javascript-obfuscator` options, merged over the defaults. */
  obfuscatorOptions?: ObfuscatorOptions;
}

export interface ResolvedObfuscateOptions {
  enabled: boolean;
  vocabulary: VocabularySource | undefined;
  compound: CompoundSpec | false;
  minDictionarySize: number;
  maxDictionarySize: number;
  hexShare: number;
  seed: string | number | undefined;
  include: ChunkFilter | undefined;
  exclude: ChunkFilter | undefined;
  concurrency: number;
  sourcemap: "drop" | "fail";
  obfuscatorOptions: ObfuscatorOptions;
}

/**
 * Obfuscator defaults.
 *
 * The expensive transforms stay off: control-flow flattening and string-array
 * call transforms multiply the cost of every function call, which ruins frame
 * loops and request handlers. Opt in per project.
 */
export const DEFAULT_OBFUSCATOR_OPTIONS: ObfuscatorOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "dictionary",
  identifiersPrefix: "",
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: "variable",
  stringArrayWrappersChainedCalls: true,
  target: "browser",
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

/** Validate and normalize user options. */
export function resolveOptions(options: ObfuscateOptions = {}): ResolvedObfuscateOptions {
  const minDictionarySize = Math.floor(clamp(options.minDictionarySize ?? 512, 16, 262144));
  const maxDictionarySize = Math.floor(
    clamp(options.maxDictionarySize ?? 32768, minDictionarySize, 262144),
  );
  const fallbackConcurrency = Math.min(4, Math.max(1, availableConcurrency()));

  return {
    enabled: options.enabled ?? true,
    vocabulary: options.vocabulary,
    compound: options.compound ?? false,
    minDictionarySize,
    maxDictionarySize,
    hexShare: clamp(options.hexShare ?? 0.25, 0, 0.95),
    seed: options.seed,
    include: options.include,
    exclude: options.exclude,
    concurrency: Math.floor(clamp(options.concurrency ?? fallbackConcurrency, 1, 32)),
    sourcemap: options.sourcemap ?? "drop",
    obfuscatorOptions: { ...DEFAULT_OBFUSCATOR_OPTIONS, ...options.obfuscatorOptions },
  };
}

function availableConcurrency(): number {
  return availableParallelism();
}

