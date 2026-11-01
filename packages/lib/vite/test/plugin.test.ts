import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import { build, resolveConfig } from "vite";
import { obfuscate } from "../src/index.ts";

const WORDS = ["vault", "spin", "lucky", "gold", "wheel", "chest"];

const LIB = `
export function computeTotal(items: number[]): number {
  const carried = items.reduce((carry, item) => carry + item * 2, 0);
  const label = \`total:\${carried}\`;
  return label.length + carried;
}

class Counter {
  value = 0;

  add(step: number): number {
    this.value += step;
    return this.value;
  }
}

export const countUp = (): number => new Counter().add(3);
`;

const APP = `
import { computeTotal } from "./lib.ts";

const label = computeTotal([1, 2, 3]);
const node = document.createElement("p");
node.textContent = String(label);
document.body.append(node);
`;

const HTML = `<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>`;

let root = "";

async function writeProject(): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "index.html"), HTML);
  await writeFile(join(root, "src/lib.ts"), LIB);
  await writeFile(join(root, "src/main.ts"), APP);
}

async function buildApp(outDir: string, seed: string): Promise<string[]> {
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [obfuscate({ vocabulary: WORDS, seed, minDictionarySize: 64 })],
    build: { outDir, emptyOutDir: true },
  });

  return (await readdir(join(root, outDir, "assets"))).filter((file) => file.endsWith(".js"));
}

describe("obfuscate plugin", () => {
  before(async () => {
    root = await mkdtemp(join(tmpdir(), "vite-plugin-agent-evasion-"));
    await writeProject();
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("turns off the bundler minifier", async () => {
    const config = await resolveConfig(
      { root, configFile: false, plugins: [obfuscate({ vocabulary: WORDS })] },
      "build",
    );

    assert.equal(config.build.minify, false);
  });

  it("keeps dev builds untouched", async () => {
    const plugin = obfuscate({ vocabulary: WORDS });

    assert.equal(plugin.apply, "build");
  });

  it("obfuscates an emitted chunk and keeps the module working", async () => {
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [obfuscate({ vocabulary: WORDS, seed: "lib", minDictionarySize: 64 })],
      build: {
        lib: { entry: join(root, "src/lib.ts"), formats: ["es"], fileName: "lib" },
        outDir: "dist-lib",
        emptyOutDir: true,
      },
    });

    const outDir = join(root, "dist-lib");
    const built = (await readdir(outDir)).filter(
      (entry) => entry.endsWith(".js") || entry.endsWith(".mjs"),
    );
    const file = join(outDir, built[0] as string);
    const code = await readFile(file, "utf8");
    // The path exists only after the build, so this import cannot be static.
    const module = (await import(pathToFileURL(file).href)) as {
      computeTotal(items: number[]): number;
      countUp(): number;
    };

    assert.match(code, /vault|spin|lucky|gold|wheel|chest/);
    assert.equal(code.includes("carried"), false);
    assert.equal(module.computeTotal([1, 2, 3]), "total:12".length + 12);
    assert.equal(module.countUp(), 3);
  });

  it("rehashes chunks after obfuscation", async () => {
    const first = await buildApp("dist-seed-a", "seed-a");
    const second = await buildApp("dist-seed-b", "seed-b");

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.notEqual(first[0], second[0]);
  });

  it("skips chunks matched by exclude", async () => {
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [obfuscate({ vocabulary: WORDS, exclude: [/index/] })],
      build: { outDir: "dist-excluded", emptyOutDir: true },
    });

    const chunks = await readdir(join(root, "dist-excluded", "assets"));
    const file = chunks.find((entry) => entry.endsWith(".js")) as string;
    const code = await readFile(join(root, "dist-excluded", "assets", file), "utf8");

    assert.match(code, /computeTotal/);
  });
});
