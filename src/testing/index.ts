import { resolvePath } from "@typespec/compiler";
import {
  createTestLibrary,
  type TypeSpecTestLibrary,
} from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

/**
 * TypeSpec test library registration for `tsp-api-docs`.
 *
 * Import this into test files and pass it to the test host's `libraries` array
 * so the TypeSpec compiler testing harness can locate the emitter package root
 * and resolve templates, built-in types, and emitter options during unit tests.
 *
 * @example
 * ```ts
 * import { TspApiDocsTestLibrary } from "@massivescale/tsp-api-docs/testing";
 * const tester = createTestRunner({ libraries: [TspApiDocsTestLibrary] });
 * ```
 */
export const TspApiDocsTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "tsp-api-docs",
  // Walk up four directories from dist/src/testing/index.js to reach the package root.
  packageRoot: resolvePath(fileURLToPath(import.meta.url), "../../../../"),
});
