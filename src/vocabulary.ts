/**
 * Custom identifier vocabulary.
 *
 * `javascript-obfuscator` can rename locals from a dictionary instead of the
 * classic `_0x1f4a` names. This module builds that dictionary: project words,
 * deterministic compound words, and a configurable share of classic
 * hexadecimal names mixed in.
 */
import { createRandom } from "./random.ts";

/** Two word pools whose cross product grows the vocabulary, or explicit token sequences. */
export type CompoundSpec =
  | {
      prefixes: readonly string[];
      suffixes: readonly string[];
    }
  | readonly (readonly string[])[];

export interface DictionaryOptions {
  /** Project words. Mixed case and punctuation are normalized away. */
  words?: readonly string[];
  /** Compound expansion, or `false` to use the words as they are. */
  compound?: CompoundSpec | false;
  /** Total number of names in the dictionary. */
  size: number;
  /** Share of classic `_0x…` names, from 0 to 1. Defaults to 0.25. */
  hexShare?: number;
  /** Seed for the deterministic shuffle. */
  seed: string | number;
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

const IDENTIFIER_PATTERN = /^[a-z_$][a-z0-9_$]*$/;

/**
 * Longest accepted vocabulary entry.
 *
 * Identifier names are short. A longer entry means the source is not a word list:
 * for example a YAML line read as a plain-text word list.
 */
const MAX_WORD_LENGTH = 48;

/**
 * Normalize one vocabulary entry to a usable identifier.
 *
 * The obfuscator lowercases every dictionary entry, so normalization does too.
 * Returns `null` when nothing usable remains.
 */
export function normalizeWord(raw: string): string | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_$]/g, "");

  if (!normalized || !IDENTIFIER_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Build the identifier dictionary.
 *
 * Entries are unique, valid identifiers, shuffled deterministically by `seed`.
 * Words repeat with a numeric suffix when `size` exceeds the vocabulary pool.
 */
export function buildDictionary(options: DictionaryOptions): string[] {
  const size = Math.max(1, Math.floor(options.size));
  const hexShare = clamp(options.hexShare ?? 0.25, 0, 0.95);
  const random = createRandom(`${options.seed}:dictionary`);

  const pool: string[] = [];
  const seen = new Set<string>();
  const rejects: string[] = [];

  const add = (raw: string): void => {
    const word = normalizeWord(raw);

    if (word && word.length > MAX_WORD_LENGTH) {
      throw new Error(
        `[vite-plugin-obfuscate] Vocabulary entry "${word.slice(0, MAX_WORD_LENGTH)}…" is ` +
          `${word.length} characters long. Check that the file extension matches its format: ` +
          "`.json`, `.yaml`, or a plain `.txt` word list.",
      );
    }

    if (!word) {
      rejects.push(raw);
      return;
    }

    if (Object.hasOwn(RESERVED_WORDS, word)) {
      rejects.push(raw);
      return;
    }

    if (seen.has(word)) {
      return;
    }

    seen.add(word);
    pool.push(word);
  };

  for (const word of options.words ?? []) {
    add(word);
  }

  if (options.compound) {
    if ("prefixes" in options.compound && "suffixes" in options.compound) {
      for (const prefix of options.compound.prefixes) {
        for (const suffix of options.compound.suffixes) {
          add(`${prefix}${suffix}`);
        }
      }
    } else if (Array.isArray(options.compound)) {
      for (const sequence of options.compound) {
        if (Array.isArray(sequence)) {
          add(sequence.map(String).join(""));
        } else if (typeof sequence === "string") {
          add(sequence);
        }
      }
    }
  }

  if (pool.length === 0) {
    const sample = rejects.slice(0, 5).join(", ");

    throw new Error(
      `[vite-plugin-obfuscate] No usable vocabulary words.${sample ? ` Rejected: ${sample}.` : ""} ` +
        "Words must contain letters and must not be reserved words.",
    );
  }

  const hexCount = Math.round(size * hexShare);
  const wordCount = size - hexCount;
  const words: string[] = [];
  const poolWords = new Set<string>(pool);
  const generated = new Set<string>();
  let index = 0;

  while (words.length < wordCount) {
    const word = pool[index % pool.length] as string;
    const round = Math.floor(index / pool.length);
    const candidate = round === 0 ? word : `${word}${round + 1}`;

    index += 1;

    if (generated.has(candidate) || (round > 0 && poolWords.has(candidate))) {
      continue;
    }

    generated.add(candidate);
    words.push(candidate);
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
 *
 * Deliberately over-approximate: any occurrence of a declaration keyword in the
 * chunk counts, including the ones inside strings and comments. A dictionary
 * that is too large is harmless; one that is too small degrades names into
 * case permutations.
 */
export function estimateIdentifierBudget(code: string): number {
  const pattern = /\b(?:const|let|var|function|class|catch)\b/g;
  let declarations = 0;

  while (pattern.exec(code) !== null) {
    declarations += 1;
  }

  return Math.max(64, Math.ceil(declarations * 2.5) + 64);
}
