/**
 * Vite plugin for LLM agent evasion: obfuscates emitted chunks with
 * custom snake_case/camelCase vocabulary, uglifies expressions, and injects
 * sentences as function names and code comments.
 */
import type { Plugin, ResolvedConfig } from "vite";
import { type ChunkObfuscator, createObfuscator } from "./core.ts";
import { type ChunkFilter, type ObfuscateOptions, resolveOptions } from "./options.ts";

export type { ChunkFilter, ObfuscateOptions, VocabularySource } from "./options.ts";
export type { CasingStyle, CompoundSpec } from "./vocabulary.ts";
export type { ChunkObfuscator, CoreOptions } from "./core.ts";
export { createObfuscator, loadVocabulary } from "./core.ts";
export { obfuscateCode } from "./obfuscator.ts";
export { DEFAULT_OBFUSCATOR_OPTIONS } from "./options.ts";
export {
  buildDictionary,
  estimateIdentifierBudget,
  normalizeWord,
  sentenceToCamelCase,
  toCamelCase,
  toSnakeCase,
} from "./vocabulary.ts";
export { injectRandomComments } from "./comments.ts";

const PLUGIN_NAME = "@71zone/vite-plugin-agent-evasion";
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
export function agentEvasion(options: ObfuscateOptions = {}): Plugin {
  const settings = resolveOptions(options);
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

/** Backward-compatible alias for agentEvasion. */
export const obfuscate = agentEvasion;

export default agentEvasion;
