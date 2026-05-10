import { resolvePath } from "@typespec/compiler";
import { createTestLibrary, type TypeSpecTestLibrary } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

export const TspApiDocsTestLibrary: TypeSpecTestLibrary = createTestLibrary({
  name: "tsp-api-docs",
  packageRoot: resolvePath(fileURLToPath(import.meta.url), "../../../../"),
});
