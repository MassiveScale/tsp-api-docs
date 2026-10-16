/**
 * @module decorators
 *
 * TypeScript implementations for the decorators declared in `lib/decorators.tsp`.
 */

import type {
  DecoratorContext,
  DecoratorImplementations,
  Interface,
  Model,
  Namespace,
  Operation,
  Program,
} from "@typespec/compiler";
import { $lib } from "./lib.js";

const globalQueryOptionsKey = $lib.createStateSymbol("globalQueryOptions");

function globalQueryOptionsImpl(
  context: DecoratorContext,
  target: Namespace | Interface | Operation,
  ...options: Model[]
): void {
  context.program.stateMap(globalQueryOptionsKey).set(target, options);
}

/**
 * Namespaced decorator export consumed by the TypeSpec compiler.
 * Binding via `$decorators` (rather than a bare `$globalQueryOptions`) keeps
 * the implementation scoped to `MassiveScale.ApiDocs`.
 */
export const $decorators: DecoratorImplementations = {
  "MassiveScale.ApiDocs": {
    globalQueryOptions: globalQueryOptionsImpl,
  },
};

/**
 * Returns the models named by the nearest `@globalQueryOptions` that applies
 * to an operation: the operation itself, then its interface, then each
 * enclosing namespace outward. The nearest one replaces outer ones.
 *
 * @param program - The TypeSpec program.
 * @param operation - The operation to resolve.
 * @returns The option models, or an empty array when none apply.
 */
export function getGlobalQueryOptions(
  program: Program,
  operation: Operation,
): Model[] {
  const state = program.stateMap(globalQueryOptionsKey);
  let namespace = operation.namespace ?? operation.interface?.namespace;
  const scopes: (Operation | Interface | Namespace | undefined)[] = [
    operation,
    operation.interface,
  ];
  while (namespace) {
    scopes.push(namespace);
    namespace = namespace.namespace;
  }

  for (const scope of scopes) {
    if (scope && state.has(scope)) {
      return state.get(scope) as Model[];
    }
  }
  return [];
}
