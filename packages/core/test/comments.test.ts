import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "acorn";
import { injectRandomComments } from "../src/comments.ts";
import { createRandom } from "../src/random.ts";

function assertParses(code: string, sourceType: "module" | "script" = "module"): void {
  assert.doesNotThrow(() => parse(code, { ecmaVersion: "latest", sourceType, allowHashBang: true }));
}

function inject(code: string, probability = 1): string {
  return injectRandomComments(code, ["note"], createRandom("comments"), probability);
}

describe("injectRandomComments", () => {
  it("leaves regex literals with quotes, slashes, and braces intact", () => {
    const code = String.raw`
const quoted = /['"]/;
const slashes = /\/\//;
const ratio = 6 / 2 / 3;
const phone = /^0\d{9}$/.test("0123456789");
`;
    const output = inject(code);

    assertParses(output);
    assert.match(output, /\/\* note \*\//);
    assert.ok(output.includes("/['\"]/"));
    assert.ok(output.includes("/^0\\d{9}$/"));
  });

  it("leaves template expressions with quotes, braces, and nesting intact", () => {
    const code = `
const inner = \`nested \${1 + 2}\`;
const outer = \`a\${"}"}b\${\`c\${inner}d\`}e\`;
const braces = \`{\${ { a: 1 }.a }}\`;
`;
    const output = inject(code);
    const values = new Function(`${output}\nreturn [inner, outer, braces];`)() as string[];

    assertParses(output);
    assert.deepEqual(values, ["nested 3", "a}bcnested 3de", "{1}"]);
    assert.ok(output.includes('`a${"}"}b${`c${inner}d`}e`'));
  });

  it("handles strings that end in an escaped backslash", () => {
    const code = String.raw`
const a = "x\\";
const b = 'y\\';
`;
    const output = inject(code);
    const values = new Function(`${output}\nreturn [a, b];`)() as string[];

    assertParses(output);
    assert.deepEqual(values, ["x\\", "y\\"]);
  });

  it("handles optional calls, logical assignment, separators, class fields, and exports", () => {
    const code = `
export let total = 1_000_000;
class Counter {
  count = 0;
  bump(step = 1) { this.count ??= 0; this.count += step; }
}
const inc = (fn, value) => fn?.(value);
inc((value) => value + 1, 10);
`;
    const output = inject(code);

    assertParses(output);
    assert.match(output, /\/\* note \*\//);
  });

  it("skips injection and warns when the result cannot be parsed", () => {
    const warnings: string[] = [];
    const invalid = "const broken = ;";
    const output = injectRandomComments(invalid, ["note"], createRandom(1), 1, {
      onWarn: (message) => warnings.push(message),
    });

    assert.equal(output, invalid);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] as string, /comment injection skipped/);
  });

  it("always parses a bundle-shaped input across many seeds", () => {
    const bundle = String.raw`
(function () {
  var _0xabc = ["\x41", "a*/b", 'q"q'];
  function _0xdef(_0x1, _0x2) { return _0x1?.(_0x2) ?? _0xabc[0]; }
  var _0x123 = /[}\]'"\/]/g;
  var _0x456 = ` + "`level ${_0xabc.length} ${ { a: 1 }.a }`" + String.raw`;
  function _0x789(_0x3) {
    if (!/^0\d{9}$/.test(_0x3)) { return _0x456.replace(_0x123, ""); }
    return _0xdef((_0x4) => _0x4 + 0x1f, _0x3);
  }
  globalThis.__fuzz = _0x789("0123456789");
})();
`;
    const sentences = ["note one", "note two"];

    for (let seed = 0; seed < 250; seed += 1) {
      const output = injectRandomComments(bundle, sentences, createRandom(seed), 0.5);

      assertParses(output, "script");
    }
  });
});
