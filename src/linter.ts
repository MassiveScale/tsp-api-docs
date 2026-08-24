/**
 * @module linter
 *
 * Linter rule and rule-set registration for the emitter, discovered by the
 * TypeSpec compiler via the `$linter` export.
 */

import { defineLinter } from "@typespec/compiler";
import { missingErrorsDocRule } from "./rules/missing-errors-doc.js";

/** The TypeSpec linter registration for `tsp-api-docs`, exposing its rules and rule sets. */
export const $linter = defineLinter({
  rules: [missingErrorsDocRule],
  ruleSets: {
    recommended: { enable: { "tsp-api-docs/missing-errors-doc": true } },
    all: { enable: { "tsp-api-docs/missing-errors-doc": true } },
  },
});
