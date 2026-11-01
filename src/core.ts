/**
 * Build-tool agnostic obfuscation core.
 *
 * The Vite plugin is a thin adapter around `createObfuscator`, so other build
 * tools (wrangler, esbuild, a release script) can reuse the same vocabulary,
 * seed, and option assembly.
 */
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ObfuscatorOptions } from "javascript-obfuscator";
import { obfuscateCode } from "./obfuscator.ts";
import { type ObfuscateOptions, resolveOptions } from "./options.ts";
import { hashString } from "./random.ts";
import { buildDictionary, type CompoundSpec, estimateIdentifierBudget } from "./vocabulary.ts";

export interface CoreOptions extends ObfuscateOptions {
  /** Base directory for relative vocabulary paths. Defaults to `process.cwd()`. */
  root?: string;
  /** Receives non-fatal problems, such as a capped dictionary. */
  onWarn?: (message: string) => void;
}

/** Obfuscate one chunk of source code. */
export interface ChunkObfuscator {
  (code: string, label?: string): Promise<string>;
}

interface VocabularyFile {
  words?: readonly string[];
  compound?: CompoundSpec;
}

/** Vocabulary file contents: a `.json` document or a word list. */
export async function loadVocabulary(source: string, root: string): Promise<VocabularyFile> {
  const path = isAbsolute(source) ? source : resolve(root, source);
  const content = await readFile(path, "utf8");

  if (path.endsWith(".json")) {
    return readJsonVocabulary(JSON.parse(content), path);
  }

  return {
    words: content
      .split("\n")
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean),
  };
}

function readJsonVocabulary(value: unknown, path: string): VocabularyFile {
  if (Array.isArray(value)) {
    return { words: readWords(value, path) };
  }

  if (typeof value !== "object" || value === null) {
    throw new Error(`${path} must hold a word list or an object with "words" and "compound".`);
  }

  const file: VocabularyFile = {};

  if ("words" in value && value.words !== undefined) {
    file.words = readWords(value.words, path);
  }

  if ("compound" in value && value.compound !== undefined) {
    file.compound = readCompound(value.compound, path);
  }

  return file;
}

function readWords(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path}: expected an array of words.`);
  }

  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error(`${path}: every word must be a string.`);
    }

    return entry;
  });
}

function readCompound(value: unknown, path: string): CompoundSpec {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${path}: "compound" must be an object with prefixes and suffixes.`);
  }

  if (!("prefixes" in value) || !("suffixes" in value)) {
    throw new Error(`${path}: "compound" needs both prefixes and suffixes.`);
  }

  return {
    prefixes: readWords(value.prefixes, path),
    suffixes: readWords(value.suffixes, path),
  };
}

/**
 * Create an obfuscator bound to one vocabulary and option set.
 *
 * The returned function is safe to call concurrently; dictionaries are cached
 * per chunk size. Output is deterministic for the same code and options.
 */
export function createObfuscator(options: CoreOptions = {}): ChunkObfuscator {
  const settings = resolveOptions(options);
  const root = options.root ?? process.cwd();
  const dictionaries = new Map<number, string[]>();
  let vocabularyFile: Promise<VocabularyFile> | undefined;

  const readVocabulary = (): Promise<VocabularyFile> => (vocabularyFile ??= readVocabularySource());

  function readVocabularySource(): Promise<VocabularyFile> {
    const source = settings.vocabulary;

    if (!source) {
      return Promise.resolve({});
    }

    return typeof source === "string"
      ? loadVocabulary(source, root)
      : Promise.resolve({ words: [...source] });
  }

  return async (code, label = "chunk") => {
    const file = await readVocabulary();
    const words = file.words ?? [];
    const compound = settings.compound !== false ? settings.compound : (file.compound ?? false);
    const seed =
      settings.seed ??
      settings.obfuscatorOptions.seed ??
      hashString(`${words.join(",")}|${JSON.stringify(compound)}`);
    const estimate = estimateIdentifierBudget(code);
    const size = Math.min(settings.maxDictionarySize, Math.max(settings.minDictionarySize, estimate));

    if (estimate > settings.maxDictionarySize) {
      options.onWarn?.(
        `${label} needs about ${estimate} identifier names, but maxDictionarySize is ` +
          `${settings.maxDictionarySize}. Raise it to keep every name inside the vocabulary.`,
      );
    }

    let dictionary = dictionaries.get(size);

    if (!dictionary) {
      dictionary = buildDictionary({ words, compound, size, hexShare: settings.hexShare, seed });
      dictionaries.set(size, dictionary);
    }

    const base: ObfuscatorOptions = { ...settings.obfuscatorOptions, seed };
    const useDictionary =
      base.identifierNamesGenerator === undefined || base.identifierNamesGenerator === "dictionary";
    const obfuscatorOptions: ObfuscatorOptions = {
      ...base,
      sourceMap: false,
      ...(useDictionary ? { identifiersDictionary: dictionary } : {}),
    };

    return obfuscateCode(code, obfuscatorOptions);
  };
}
