/**
 * Custom identifier vocabulary with snake_case and camelCase preservation.
 *
 * `javascript-obfuscator` renames locals and globals from a dictionary. By wrapping
 * entries in `PreservedString`, camelCase casing survives the obfuscator's internal
 * `.toLowerCase()` transform.
 */
import { createRandom } from "./random.ts";

/** Two word pools whose cross product grows the vocabulary, or explicit token sequences. */
export type CompoundSpec =
  | {
      prefixes: readonly string[];
      suffixes: readonly string[];
    }
  | readonly (readonly string[])[];

export type CasingStyle = "snake_case" | "camelCase" | "mixed";

export interface DictionaryOptions {
  /** Project words. */
  words?: readonly string[];
  /** Compound expansion, or `false` to use the words as they are. */
  compound?: CompoundSpec | false;
  /** Natural-language sentences converted into camelCase function/variable names. */
  sentences?: readonly string[];
  /** Casing style for merged compound words. Defaults to `"mixed"`. */
  casing?: CasingStyle;
  /** Total number of names in the dictionary. */
  size: number;
  /** Share of classic `_0x…` names, from 0 to 1. Defaults to 0.25. */
  hexShare?: number;
  /** Seed for the deterministic shuffle. */
  seed: string | number;
}

/**
 * String wrapper that preserves camelCase and mixed casing when passed into
 * javascript-obfuscator's DictionaryIdentifierNamesGenerator.
 */
export class PreservedString extends String {
  override toLowerCase(): string {
    return this.toString();
  }
}

/** Words the obfuscator cannot use as identifier names. */
const RESERVED_WORDS: Record<string, true> = {
  arguments: true,
  await: true,
  break: true,
  case: true,
  catch: true,
  class: true,
  const: true,
  continue: true,
  debugger: true,
  default: true,
  delete: true,
  do: true,
  else: true,
  enum: true,
  eval: true,
  export: true,
  extends: true,
  false: true,
  finally: true,
  for: true,
  function: true,
  if: true,
  implements: true,
  import: true,
  in: true,
  instanceof: true,
  interface: true,
  let: true,
  new: true,
  null: true,
  package: true,
  private: true,
  protected: true,
  public: true,
  return: true,
  static: true,
  super: true,
  switch: true,
  this: true,
  throw: true,
  true: true,
  try: true,
  typeof: true,
  undefined: true,
  var: true,
  void: true,
  while: true,
  with: true,
  yield: true,
};

const IDENTIFIER_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Max identifier length (tolerates sentences converted to camelCase). */
const MAX_WORD_LENGTH = 80;

/** Normalize one word token, preserving its casing. */
export function normalizeWord(raw: string): string | null {
  const normalized = raw
    .trim()
    .replace(/[^a-zA-Z0-9_$]/g, "");

  if (!normalized || !IDENTIFIER_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

/** Merge tokens into snake_case: e.g. ["hide", "payload"] -> "hide_payload". */
export function toSnakeCase(tokens: readonly string[]): string {
  const parts = tokens.map((token) => token.trim().replace(/[^a-zA-Z0-9_$]/g, "")).filter(Boolean);
  return parts.join("_").toLowerCase();
}

/** Merge tokens into camelCase: e.g. ["hide", "payload"] -> "hidePayload". */
export function toCamelCase(tokens: readonly string[]): string {
  const parts = tokens.map((token) => token.trim().replace(/[^a-zA-Z0-9_$]/g, "")).filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word[0]!.toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");
}
/** Convert a natural-language sentence into a camelCase function name. */
export function sentenceToCamelCase(sentence: string): string {
  const tokens = sentence
    .trim()
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .split(/[\s_-]+/)
    .filter(Boolean);

  return toCamelCase(tokens);
}


/**
 * Build the identifier dictionary.
 *
 * Entries are unique, valid identifiers formatted in snake_case and/or camelCase,
 * deterministically shuffled.
 */
export function buildDictionary(options: DictionaryOptions): string[] {
  const size = Math.max(1, Math.floor(options.size));
  const rawShare = options.hexShare ?? 0.25;
  const hexShare = Math.min(0.95, Math.max(0, rawShare));
  const casing = options.casing ?? "mixed";
  const random = createRandom(`${options.seed}:dictionary`);

  const pool: string[] = [];
  const seen = new Set<string>();
  const rejects: string[] = [];

  const add = (raw: string, allowLong = false): void => {
    const word = normalizeWord(raw);

    if (word && !allowLong && word.length > MAX_WORD_LENGTH) {
      throw new Error(
        `Vocabulary entry "${word.slice(0, 48)}…" is ${word.length} characters long. ` +
          "Check your vocabulary file.",
      );
    }

    if (!word) {
      rejects.push(raw);
      return;
    }

    if (Object.hasOwn(RESERVED_WORDS, word.toLowerCase())) {
      rejects.push(raw);
      return;
    }

    if (seen.has(word)) {
      return;
    }

    seen.add(word);
    pool.push(new PreservedString(word) as unknown as string);
  };

  const addCompoundTokens = (tokens: readonly string[]): void => {
    if (tokens.length === 0) return;
    if (tokens.length === 1) {
      add(tokens[0] as string);
      return;
    }

    if (casing === "snake_case") {
      add(toSnakeCase(tokens));
    } else if (casing === "camelCase") {
      add(toCamelCase(tokens));
    } else {
      // Mixed: register both snake_case and camelCase forms
      add(toSnakeCase(tokens));
      add(toCamelCase(tokens));
    }
  };

  // 1. Single words
  for (const word of options.words ?? []) {
    add(word);
  }

  // 2. Compound words / token sequences
  if (options.compound) {
    if ("prefixes" in options.compound && "suffixes" in options.compound) {
      for (const prefix of options.compound.prefixes) {
        for (const suffix of options.compound.suffixes) {
          addCompoundTokens([prefix, suffix]);
        }
      }
    } else if (Array.isArray(options.compound)) {
      for (const sequence of options.compound) {
        if (Array.isArray(sequence)) {
          addCompoundTokens(sequence.map(String));
        } else if (typeof sequence === "string") {
          add(sequence);
        }
      }
    }
  }

  // 3. Sentences converted to camelCase function names. Sentences are long by
  // nature, so they skip the word-length guard that catches pasted YAML blobs.
  for (const sentence of options.sentences ?? []) {
    const fnName = sentenceToCamelCase(sentence);

    if (fnName) {
      add(fnName, true);
    }
  }

  if (pool.length === 0) {
    const sample = rejects.slice(0, 5).join(", ");

    throw new Error(
      `No usable vocabulary words.${sample ? ` Rejected: ${sample}.` : ""} ` +
        "Words must contain letters and must not be reserved words.",
    );
  }

  const hexCount = Math.round(size * hexShare);
  const wordCount = size - hexCount;
  const words: string[] = [];
  const poolWords = new Set<string>(pool.map((p) => p.toString()));
  const generated = new Set<string>();
  let index = 0;

  while (words.length < wordCount) {
    const baseWord = pool[index % pool.length] as string;
    const round = Math.floor(index / pool.length);
    let candidate: string;

    if (round === 0) {
      candidate = baseWord;
    } else if (baseWord.includes("_")) {
      candidate = `${baseWord}_${round + 1}`;
    } else {
      candidate = `${baseWord}${round + 1}`;
    }

    index += 1;

    const candidateStr = candidate.toString();
    if (generated.has(candidateStr) || (round > 0 && poolWords.has(candidateStr))) {
      continue;
    }

    generated.add(candidateStr);
    words.push(new PreservedString(candidate) as unknown as string);
  }

  const hexWords: string[] = [];

  while (hexWords.length < hexCount) {
    const candidate = `_0x${random.hex(6)}`;

    if (generated.has(candidate) || poolWords.has(candidate)) {
      continue;
    }

    generated.add(candidate);
    hexWords.push(candidate);
  }

  return random.shuffle([...words, ...hexWords]);
}

/**
 * Estimate how many identifier names one chunk can consume.
 */
export function estimateIdentifierBudget(code: string): number {
  const pattern = /\b(?:const|let|var|function|class|catch)\b/g;
  let declarations = 0;

  while (pattern.exec(code) !== null) {
    declarations += 1;
  }

  return Math.max(64, Math.ceil(declarations * 2.5) + 64);
}
