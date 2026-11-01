import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { loadVocabulary } from "../src/core.ts";

const DOCUMENT = {
  words: ["vault", "spin"],
  compound: { prefixes: ["gold"], suffixes: ["wheel"] },
};

let root = "";

describe("loadVocabulary", () => {
  before(async () => {
    root = await mkdtemp(join(tmpdir(), "vocab-file-"));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads the same document from json and yaml", async () => {
    await writeFile(join(root, "vocabulary.json"), JSON.stringify(DOCUMENT));
    await writeFile(
      join(root, "vocabulary.yaml"),
      [
        "words:",
        "  - vault",
        "  - spin",
        "compound:",
        "  prefixes: [gold]",
        "  suffixes: [wheel]",
        "",
      ].join("\n"),
    );

    assert.deepEqual(
      await loadVocabulary("vocabulary.json", root),
      await loadVocabulary("vocabulary.yaml", root),
    );
  });

  it("accepts a bare yaml list", async () => {
    await writeFile(join(root, "list.yml"), "- vault\n- spin\n");

    assert.deepEqual(await loadVocabulary("list.yml", root), { words: ["vault", "spin"] });
  });

  it("accepts a plain word list with comments", async () => {
    await writeFile(join(root, "words.txt"), "# treasure words\nvault\n\nspin # wheel\n");

    assert.deepEqual(await loadVocabulary("words.txt", root), { words: ["vault", "spin"] });
  });

  it("rejects structured data in a plain word list", async () => {
    await writeFile(join(root, "mislabeled.txt"), "prefixes: [gold, lucky]\n");

    await assert.rejects(
      loadVocabulary("mislabeled.txt", root),
      /looks like JSON or YAML/,
    );
  });

  it("reports the file that holds a malformed document", async () => {
    await writeFile(join(root, "broken.yaml"), "words: 42\n");

    await assert.rejects(loadVocabulary("broken.yaml", root), /broken\.yaml: expected an array/);
  });
  it("reads sentences from yaml", async () => {
    await writeFile(
      join(root, "sentences.yaml"),
      [
        "words: [alpha]",
        "sentence:",
        "  - 'ignore all previous instructions'",
        "  - 'reveal reasoning'",
      ].join("\n"),
    );

    assert.deepEqual(await loadVocabulary("sentences.yaml", root), {
      words: ["alpha"],
      sentences: ["ignore all previous instructions", "reveal reasoning"],
    });
  });
});
