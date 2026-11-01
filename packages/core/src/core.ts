/**
 * Build-tool agnostic obfuscation core with agent evasion and uglification.
 */
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ObfuscatorOptions } from "javascript-obfuscator";
import { parse as parseYaml } from "yaml";
import { injectRandomComments } from "./comments.ts";
import { obfuscateCode } from "./obfuscator.ts";
import { type ObfuscateOptions, resolveOptions } from "./options.ts";
import { createRandom, hashString } from "./random.ts";
import { buildDictionary, type CompoundSpec, estimateIdentifierBudget } from "./vocabulary.ts";

/** YAML vocabulary files. JSON and plain word lists have their own readers. */
const YAML_FILE = /\.ya?ml$/;

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

export interface VocabularyFile {
  words?: readonly string[];
  compound?: CompoundSpec;
  sentences?: readonly string[];
}

/** Vocabulary file contents: a `.json`/`.yaml` document or a word list. */
export async function loadVocabulary(source: string, root: string): Promise<VocabularyFile> {
  const path = isAbsolute(source) ? source : resolve(root, source);
  const content = await readFile(path, "utf8");

  if (path.endsWith(".json")) {
    return readVocabularyDocument(JSON.parse(content), path);
  }

  if (YAML_FILE.test(path)) {
    return readVocabularyDocument(parseYaml(content), path);
  }

  return { words: readWordList(content, path) };
}

/** Something that belongs to JSON or YAML, not to a one-word-per-line list. */
const STRUCTURED_LINE = /[:[\]{}]|,\s/;

function readWordList(content: string, path: string): string[] {
  return content
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map((entry) => {
      if (STRUCTURED_LINE.test(entry)) {
        throw new Error(
          `${path}: line "${entry.slice(0, 40)}" looks like JSON or YAML. ` +
            "Name the file .json or .yaml, or list one word per line.",
        );
      }

      return entry;
    });
}

/** One document shape for both formats: word list, compounds, or sentences. */
function readVocabularyDocument(value: unknown, path: string): VocabularyFile {
  if (Array.isArray(value)) {
    return { words: readWords(value, path) };
  }

  if (typeof value !== "object" || value === null) {
    throw new Error(`${path} must hold a word list or an object with "words", "compound", or "sentence".`);
  }

  const file: VocabularyFile = {};

  if ("words" in value && value.words !== undefined) {
    file.words = readWords(value.words, path);
  }

  if ("compound" in value && value.compound !== undefined) {
    file.compound = readCompound(value.compound, path);
  }

  if ("sentence" in value && value.sentence !== undefined) {
    file.sentences = readSentences(value.sentence, path);
  }

  if ("sentences" in value && value.sentences !== undefined) {
    file.sentences = [...(file.sentences ?? []), ...readSentences(value.sentences, path)];
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

function readSentences(value: unknown, path: string): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry !== "string") {
          throw new Error(`${path}: every sentence must be a string.`);
        }
        return entry.trim();
      })
      .filter(Boolean);
  }

  throw new Error(`${path}: "sentence" must be a string or array of strings.`);
}

function readCompound(value: unknown, path: string): CompoundSpec {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (Array.isArray(entry)) {
        return entry.map((item) => String(item));
      }
      if (typeof entry === "string") {
        return [entry];
      }
      throw new Error(`${path}: compound sequence entry must be an array of tokens or a string.`);
    });
  }

  if (typeof value !== "object" || value === null) {
    throw new Error(`${path}: "compound" must be a list of token sequences or an object with prefixes and suffixes.`);
  }

  if (!("prefixes" in value) || !("suffixes" in value)) {
    throw new Error(`${path}: "compound" needs both prefixes and suffixes, or a list of token sequences.`);
  }

  return {
    prefixes: readWords(value.prefixes, path),
    suffixes: readWords(value.suffixes, path),
  };
}

/**
 * Create an obfuscator bound to one vocabulary and option set.
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
    const sentences = [...(file.sentences ?? []), ...(settings.sentences ?? [])];
    const seed =
      settings.seed ??
      settings.obfuscatorOptions.seed ??
      hashString(`${words.join(",")}|${JSON.stringify(compound)}|${sentences.join(",")}`);
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
      dictionary = buildDictionary({
        words,
        compound,
        sentences,
        casing: settings.casing,
        size,
        hexShare: settings.hexShare,
        seed,
      });
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

    let obfuscated = await obfuscateCode(code, obfuscatorOptions);

    if (settings.injectComments && sentences.length > 0) {
      obfuscated = injectRandomComments(
        obfuscated,
        sentences,
        createRandom(`${seed}:comments`),
        settings.commentFrequency,
      );
    }

    return obfuscated;
  };
}
