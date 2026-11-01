/**
 * Default adversarial vocabulary.
 *
 * The package ships `vocabulary.yaml`, the same file the plugin reads. Import
 * `vocabularyPath` to hand an absolute path to the `vocabulary` option.
 */
import { fileURLToPath } from "node:url";

/** Absolute path to the bundled `vocabulary.yaml`. */
export const vocabularyPath: string = fileURLToPath(
  new URL("../vocabulary.yaml", import.meta.url),
);
