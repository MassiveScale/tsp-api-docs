/**
 * Public entry point for the `@massivescale/tsp-api-docs` TypeSpec emitter.
 * Re-exports the emitter hook and library registration so the TypeSpec compiler
 * can discover and invoke this package as an emitter.
 */
export { $onEmit } from "./emitter.js";
export { $lib } from "./lib.js";
export { $linter } from "./linter.js";
