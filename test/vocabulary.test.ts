import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDictionary, estimateIdentifierBudget, normalizeWord } from "../src/vocabulary.ts";

const IDENTIFIER = /^[a-z_$][a-z0-9_$]*$/;

describe("normalizeWord", () => {
  it("lowercases and strips punctuation", () => {
    assert.equal(normalizeWord("  Gold Coin!  "), "goldcoin");
    assert.equal(normalizeWord("_spin2win"), "_spin2win");
  });

  it("rejects entries with nothing usable left", () => {
    assert.equal(normalizeWord("!!!"), null);
    assert.equal(normalizeWord("2fast"), null);
  });
});

describe("buildDictionary", () => {
  const words = ["vault", "spin", "lucky", "gold"];

  it("is deterministic for the same seed", () => {
    const first = buildDictionary({ words, size: 120, seed: "release" });
    const second = buildDictionary({ words, size: 120, seed: "release" });

    assert.deepEqual(first, second);
  });

  it("changes order when the seed changes", () => {
    const first = buildDictionary({ words, size: 120, seed: "release" });
    const second = buildDictionary({ words, size: 120, seed: "preview" });

    assert.notDeepEqual(first, second);
  });

  it("mixes vocabulary words and hexadecimal names at the requested share", () => {
    const dictionary = buildDictionary({ words, size: 200, hexShare: 0.25, seed: 1 });
    const hex = dictionary.filter((entry) => entry.startsWith("_0x"));

    assert.equal(dictionary.length, 200);
    assert.equal(hex.length, 50);
    assert.equal(new Set(dictionary).size, 200);
    assert.ok(dictionary.every((entry) => IDENTIFIER.test(entry)));
  });

  it("fills beyond the vocabulary with numeric suffixes", () => {
    const dictionary = buildDictionary({
      words: ["vault"],
      size: 4,
      hexShare: 0,
      seed: 1,
    });

    assert.deepEqual([...dictionary].sort(), ["vault", "vault2", "vault3", "vault4"]);
  });

  it("grows the vocabulary from compound pools", () => {
    const dictionary = buildDictionary({
      words: [],
      compound: { prefixes: ["gold", "spin"], suffixes: ["vault", "wheel"] },
      size: 3,
      hexShare: 0,
      seed: 1,
    });
    const compound = buildDictionary({
      words: [],
      compound: { prefixes: ["gold", "spin"], suffixes: ["vault", "wheel"] },
      size: 4,
      hexShare: 0,
      seed: 1,
    }).sort();

    assert.equal(compound.length, 4);
    assert.deepEqual(compound, ["goldvault", "goldwheel", "spinvault", "spinwheel"]);
    assert.equal(dictionary.length, 3);
  });
  it("accepts token sequence arrays in compound", () => {
    const dictionary = buildDictionary({
      words: [],
      compound: [
        ["alpha", "beta"],
        ["gamma", "delta"],
      ],
      size: 2,
      hexShare: 0,
      seed: 1,
    }).sort();

    assert.deepEqual(dictionary, ["alphabeta", "gammadelta"]);
  });

  it("fails loudly when no word is usable", () => {
    assert.throws(
      () => buildDictionary({ words: ["class", "const", "!!!"], size: 10, seed: 1 }),
      /No usable vocabulary words/,
    );
  });

  it("rejects a line that is not a word", () => {
    assert.throws(
      () =>
        buildDictionary({
          words: ["prefixes: [gold, lucky, spin, jade, red, great, new, year, silver, dragon] suffixes: [vault, wheel, chest, coin, gem, prize, luck]"],
          size: 10,
          seed: 1,
        }),
      /Check that the file extension matches its format/,
    );
  });
});

describe("estimateIdentifierBudget", () => {
  it("has a floor and grows with declarations", () => {
    const small = estimateIdentifierBudget("const value = 1;");
    const large = estimateIdentifierBudget("const a = 1; let b = 2; function c() {} class D {}");

    assert.ok(small >= 64);
    assert.ok(large > small);
  });
});
