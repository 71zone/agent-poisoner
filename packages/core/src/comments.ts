/**
 * Deterministically inject raw sentences as block comments at token boundaries.
 *
 * A real JavaScript tokenizer finds the `;` and `}` tokens, so regex literals,
 * template expressions, strings, and existing comments cannot be mistaken for
 * statement ends. Every candidate is parsed before it is returned: a result
 * that does not parse is discarded, and the original code wins.
 */
import { parse, tokenizer } from "acorn";
import type { SeededRandom } from "./random.ts";

export interface CommentInjectionOptions {
  /** Receives a note when comment injection could not produce parsable code. */
  onWarn?: (message: string) => void;
}

const MAX_ATTEMPTS = 3;

const PARSE_OPTIONS = {
  ecmaVersion: "latest",
  allowHashBang: true,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
} as const;

const TOKEN_OPTIONS = { ...PARSE_OPTIONS, sourceType: "module" as const };

/** A chunk is safe when either module or script parsing accepts it. */
function parses(code: string): boolean {
  for (const sourceType of ["module", "script"] as const) {
    try {
      parse(code, { ...PARSE_OPTIONS, sourceType });
      return true;
    } catch {
      // Try the other goal symbol.
    }
  }

  return false;
}

/** One pass over the token stream. Throws when the input cannot be tokenized. */
function insertOnce(
  code: string,
  sentences: readonly string[],
  random: SeededRandom,
  probability: number,
): string {
  const tokens = tokenizer(code, TOKEN_OPTIONS);
  const braces: Array<"block" | "template"> = [];
  let result = "";
  let copied = 0;
  let sentenceIndex = 0;

  for (;;) {
    const token = tokens.getToken();

    if (token.type.label === "eof") {
      break;
    }

    result += code.slice(copied, token.end);
    copied = token.end;

    const label = token.type.label;
    let isBoundary = label === ";";

    if (label === "{") {
      braces.push("block");
    } else if (label === "${") {
      braces.push("template");
    } else if (label === "}") {
      // The `}` that closes `${...}` is followed by template text, so a
      // comment there would become part of the string. Inner braces are fine.
      isBoundary = braces.pop() !== "template";
    }

    if (isBoundary && random.int(100) < probability * 100) {
      // Keep the sentence on one line and stop it from closing its own comment.
      const body = (sentences[sentenceIndex % sentences.length] as string)
        .replace(/\*\//g, "* /")
        .replace(/[\r\n\u2028\u2029]+/g, " ");
      sentenceIndex += 1;
      result += `/* ${body} */`;
    }
  }

  return result + code.slice(copied);
}

export function injectRandomComments(
  code: string,
  sentences: readonly string[],
  random: SeededRandom,
  probability = 0.25,
  options: CommentInjectionOptions = {},
): string {
  if (!sentences || sentences.length === 0 || probability <= 0) {
    return code;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let candidate: string;

    try {
      candidate = insertOnce(code, sentences, random, probability);
    } catch {
      break;
    }

    if (parses(candidate)) {
      return candidate;
    }
  }

  options.onWarn?.(
    `comment injection skipped: ${MAX_ATTEMPTS} attempts did not produce parsable code`,
  );

  return code;
}
