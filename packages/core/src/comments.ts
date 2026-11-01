/**
 * Deterministically inject raw sentences as block comments at statement boundaries.
 *
 * Comments are placed at `;` or `}` that are outside of string literals,
 * template literals, and existing comments. The exact sentence string is preserved
 * with no case modification or punctuation changes.
 */
import type { SeededRandom } from "./random.ts";

export function injectRandomComments(
  code: string,
  sentences: readonly string[],
  random: SeededRandom,
  probability = 0.25,
): string {
  if (!sentences || sentences.length === 0) {
    return code;
  }

  let result = "";
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inComment = false;
  let inBlockComment = false;
  let sentenceIndex = 0;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index] as string;
    const prev = index > 0 ? (code[index - 1] as string) : "";
    const next = index < code.length - 1 ? (code[index + 1] as string) : "";

    // Escape character handling
    if (prev === "\\") {
      result += char;
      continue;
    }

    // Single-line comment: // ... \n
    if (char === "/" && next === "/" && !inSingle && !inDouble && !inTemplate && !inBlockComment) {
      inComment = true;
    } else if (char === "\n" && inComment) {
      inComment = false;
    }

    // Block comment: /* ... */
    if (char === "/" && next === "*" && !inSingle && !inDouble && !inTemplate && !inComment) {
      inBlockComment = true;
    } else if (char === "*" && next === "/" && inBlockComment) {
      inBlockComment = false;
    }

    // Strings
    if (char === "'" && !inDouble && !inTemplate && !inComment && !inBlockComment) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle && !inTemplate && !inComment && !inBlockComment) {
      inDouble = !inDouble;
    } else if (char === "`" && !inSingle && !inDouble && !inComment && !inBlockComment) {
      inTemplate = !inTemplate;
    }

    result += char;

    const isOutside = !inSingle && !inDouble && !inTemplate && !inComment && !inBlockComment;

    if (isOutside && (char === ";" || char === "}") && random.int(100) < probability * 100) {
      const raw = sentences[sentenceIndex % sentences.length] as string;
      sentenceIndex += 1;
      // Sanitize */ to prevent premature comment closure
      const safeComment = raw.replace(/\*\//g, "* /");
      result += `/* ${safeComment} */`;
    }
  }

  return result;
}
