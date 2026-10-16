using TypeSpec.Reflection;

namespace MassiveScale.ApiDocs;

/**
 * Documents query options that shared infrastructure (middleware, filters, a
 * gateway) accepts on every request, without adding them to the operation
 * signature. Because the HTTP model is unchanged, OpenAPI output and generated
 * server and client code are unaffected; only the API docs list them.
 *
 * Each property of each model becomes one row in the operation's query
 * parameter table, after the query parameters the route declares. The wire
 * name comes from `@query("name")` when present, otherwise the property name.
 * A declared query parameter wins over a global option with the same wire name.
 *
 * Apply it to a namespace, an interface, or an operation. The nearest one
 * replaces any outer one: an interface can set a default, and an operation can
 * state its own list. `@globalQueryOptions()` with no arguments means none.
 *
 * @param options Models whose properties are the global query options.
 *
 * @example
 * ```typespec
 * model CommonQueryOptions {
 *   @query("$filter") filter?: string;
 *   @query("$top") top?: int32;
 *   @query("$skip") skip?: int32;
 *   @query("$select") select?: string;
 * }
 *
 * @globalQueryOptions(CommonQueryOptions)
 * interface Widgets {
 *   list(): Widget[];
 *
 *   @globalQueryOptions(PickProperties<CommonQueryOptions, "select">)
 *   get(@path id: string): Widget;
 * }
 * ```
 */
extern dec globalQueryOptions(
  target: Namespace | Interface | Operation,
  ...options: Model[]
);
