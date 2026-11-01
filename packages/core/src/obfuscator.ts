/**
 * Lazy access to `javascript-obfuscator`.
 *
 * The package is a CommonJS webpack bundle, so Node's named-export detection
 * finds nothing: its members arrive only through `default`. Loading lazily
 * keeps `vite dev` startup untouched.
 */
import type { ObfuscatorOptions } from "javascript-obfuscator";

/** The shape this plugin needs from the obfuscator. */
export interface Obfuscator {
  obfuscate(sourceCode: string, options?: ObfuscatorOptions): { getObfuscatedCode(): string };
}

let runtime: Promise<Obfuscator> | undefined;

function isObfuscator(value: unknown): value is Obfuscator {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "obfuscate" in value &&
    typeof value.obfuscate === "function"
  );
}

/** Load the obfuscator once, in either module interop shape. */
export function loadObfuscator(): Promise<Obfuscator> {
  runtime ??= import("javascript-obfuscator").then((namespace) => {
    const candidate = "default" in namespace ? namespace.default : undefined;

    return isObfuscator(candidate) ? candidate : namespace;
  });

  return runtime;
}

/** Obfuscate one chunk's source code. */
export async function obfuscateCode(code: string, options: ObfuscatorOptions): Promise<string> {
  const obfuscator = await loadObfuscator();

  return obfuscator.obfuscate(code, options).getObfuscatedCode();
}
