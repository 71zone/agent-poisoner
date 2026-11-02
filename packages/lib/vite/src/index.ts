/**
 * Vite plugin for LLM agent evasion: obfuscates emitted chunks with a custom
 * snake_case and camelCase vocabulary, uglifies expressions, and injects
 * sentences as function names and code comments.
 *
 * The plugin is a thin adapter: the obfuscation lives in
 * `@71z/agent-poisoner-core`.
 */
import { vocabularyPath } from "@71z/agent-poisoner-vocabulary";
import type { Plugin, ResolvedConfig } from "vite";
import {
  type ChunkFilter,
  type ChunkObfuscator,
  type ObfuscateOptions,
  createObfuscator,
  resolveOptions,
} from "@71z/agent-poisoner-core";

export type {
  CasingStyle,
  ChunkFilter,
  ChunkObfuscator,
  CompoundSpec,
  CoreOptions,
  ObfuscateOptions,
  ResolvedObfuscateOptions,
  VocabularyFile,
  VocabularySource,
} from "@71z/agent-poisoner-core";
export {
  buildDictionary,
  createObfuscator,
  createRandom,
  DEFAULT_OBFUSCATOR_OPTIONS,
  estimateIdentifierBudget,
  hashString,
  injectRandomComments,
  loadObfuscator,
  loadVocabulary,
  normalizeWord,
  obfuscateCode,
  resolveOptions,
  sentenceToCamelCase,
  toCamelCase,
  toSnakeCase,
} from "@71z/agent-poisoner-core";
export { vocabularyPath } from "@71z/agent-poisoner-vocabulary";
const PLUGIN_NAME = "@71z/vite-agent-poisoner";
const LOG_PREFIX = `[${PLUGIN_NAME}]`;

/** Matches emitted JavaScript, and nothing else. */
const JS_CHUNK = /\.(?:mjs|js)$/;

function matchesFilter(filter: ChunkFilter | undefined, fileName: string): boolean | undefined {
  if (!filter) {
    return undefined;
  }

  if (typeof filter === "function") {
    return filter(fileName);
  }

  return (Array.isArray(filter) ? filter : [filter]).some((pattern) => pattern.test(fileName));
}

/** Decide whether one emitted chunk gets obfuscated. */
export function shouldObfuscate(
  fileName: string,
  options: Pick<ObfuscateOptions, "include" | "exclude">,
): boolean {
  if (matchesFilter(options.exclude, fileName)) {
    return false;
  }

  if (!JS_CHUNK.test(fileName)) {
    return false;
  }

  return matchesFilter(options.include, fileName) ?? true;
}

/** Bounded parallelism: obfuscation is CPU heavy and chunks arrive together. */
function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      const { promise, resolve } = Promise.withResolvers<void>();
      waiting.push(resolve);
      await promise;
    }

    active += 1;

    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

/** The plugin. Pass options to set the vocabulary and evasion settings. */
export function agentPoisoner(options: ObfuscateOptions = {}): Plugin {
  const settings = resolveOptions({
    ...options,
    vocabulary: options.vocabulary ?? vocabularyPath,
  });
  const limit = createLimiter(settings.concurrency);
  let config: ResolvedConfig | undefined;
  let minifyDisabled = false;
  let core: ChunkObfuscator | undefined;
  let warnSink: (message: string) => void = () => {};

  return {
    name: PLUGIN_NAME,
    apply: "build",
    enforce: "post",

    config(userConfig) {
      if (!settings.enabled || userConfig.build?.minify === false) {
        return undefined;
      }

      minifyDisabled = true;

      return {
        build: {
          minify: false,
          cssMinify: userConfig.build?.cssMinify ?? true,
        },
      };
    },

    configResolved(resolved) {
      config = resolved;

      if (minifyDisabled) {
        resolved.logger.info(
          `${LOG_PREFIX} build.minify is off: the obfuscator compacts the output, and a later ` +
            "minifier would rename every obfuscated identifier.",
        );
      }

      if (settings.obfuscatorOptions.identifierNamesGenerator !== "dictionary") {
        resolved.logger.warn(
          `${LOG_PREFIX} identifierNamesGenerator is "${String(settings.obfuscatorOptions.identifierNamesGenerator)}", ` +
            "so the custom vocabulary is not used.",
        );
      }

      if (resolved.build.sourcemap) {
        if (settings.sourcemap === "fail") {
          throw new Error(
            `${LOG_PREFIX} build.sourcemap is on, and source maps cannot survive obfuscation. ` +
              'Turn source maps off or set sourcemap: "drop".',
          );
        }

        resolved.logger.warn(`${LOG_PREFIX} source maps are dropped for obfuscated chunks.`);
      }
    },

    async renderChunk(code, chunk) {
      if (!settings.enabled || !shouldObfuscate(chunk.fileName, options)) {
        return null;
      }

      warnSink = (message) => {
        this.warn(message);
      };

      core ??= createObfuscator({
        ...options,
        ...(settings.vocabulary ? { vocabulary: settings.vocabulary } : {}),
        root: config?.root ?? process.cwd(),
        onWarn: (message) => warnSink(message),
      });

      const run = core;

      try {
        const obfuscated = await limit(() => run(code, chunk.fileName));

        this.info(`${LOG_PREFIX} ${chunk.fileName}: ${code.length} -> ${obfuscated.length} bytes`);

        return { code: obfuscated, map: null };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        this.error(`${LOG_PREFIX} ${chunk.fileName}: ${reason}`);
      }
    },
  };
}
/** Backward-compatible alias for `agentPoisoner`. */
export const agentEvasion = agentPoisoner;

/** Backward-compatible alias for `agentPoisoner`. */
export const obfuscate = agentPoisoner;

export default agentPoisoner;
