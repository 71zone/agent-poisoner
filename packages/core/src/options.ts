/**
 * Plugin options and the `javascript-obfuscator` defaults.
 */
import { availableParallelism } from "node:os";
import type { ObfuscatorOptions } from "javascript-obfuscator";
import type { CasingStyle, CompoundSpec } from "./vocabulary.ts";

/** Chunk selector: regular expressions and/or a predicate on the chunk file name. */
export type ChunkFilter = RegExp | readonly RegExp[] | ((fileName: string) => boolean);

/** A `.json`, `.yaml`, or `.txt` vocabulary file, or an inline word list. */
export type VocabularySource = readonly string[] | string;

export interface ObfuscateOptions {
  /** Turn the plugin off without removing it. Defaults to `true`. */
  enabled?: boolean;
  /**
   * Custom identifier vocabulary. Inline words, or a path to a `.yaml`/`.json` file
   * or a `.txt` word list. Relative paths resolve against the Vite project root.
   */
  vocabulary?: VocabularySource;
  /** Compound word pools that grow the vocabulary deterministically. */
  compound?: CompoundSpec | false;
  /** Explicit natural-language sentences. */
  sentences?: readonly string[];
  /** Casing style for merged compound identifiers: "snake_case", "camelCase", or "mixed". */
  casing?: CasingStyle;
  /** Uglify expressions (e.g. numbers to complex arithmetic). Defaults to `true`. */
  uglify?: boolean;
  /** Inject raw sentences as random comments at statement boundaries. Defaults to `true`. */
  injectComments?: boolean;
  /** Probability of injecting a comment at an eligible statement separator. Defaults to 0.25. */
  commentFrequency?: number;
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
  sentences: readonly string[] | undefined;
  casing: CasingStyle;
  uglify: boolean;
  injectComments: boolean;
  commentFrequency: number;
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
 * Obfuscator defaults tuned for agent evasion and uglification.
 */
export const DEFAULT_OBFUSCATOR_OPTIONS: ObfuscatorOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "dictionary",
  identifiersPrefix: "",
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 4,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.8,
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
  const fallbackConcurrency = Math.min(4, Math.max(1, availableParallelism()));
  const uglify = options.uglify ?? true;

  const baseObfuscator = {
    ...DEFAULT_OBFUSCATOR_OPTIONS,
    numbersToExpressions: uglify,
    ...options.obfuscatorOptions,
  };

  return {
    enabled: options.enabled ?? true,
    vocabulary: options.vocabulary,
    compound: options.compound ?? false,
    sentences: options.sentences,
    casing: options.casing ?? "mixed",
    uglify,
    injectComments: options.injectComments ?? true,
    commentFrequency: clamp(options.commentFrequency ?? 0.25, 0.05, 1),
    minDictionarySize,
    maxDictionarySize,
    hexShare: clamp(options.hexShare ?? 0.25, 0, 0.95),
    seed: options.seed,
    include: options.include,
    exclude: options.exclude,
    concurrency: Math.floor(clamp(options.concurrency ?? fallbackConcurrency, 1, 32)),
    sourcemap: options.sourcemap ?? "drop",
    obfuscatorOptions: baseObfuscator,
  };
}
