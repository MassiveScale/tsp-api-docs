import {
  getDoc,
  getOpExamples,
  getSummary,
  getTypeName,
  serializeValueAsJson,
  type Example,
  type OpExample,
  type Operation,
  type Program,
  type Type,
} from "@typespec/compiler";
import {
  resolveRequestVisibility,
  type HttpOperation,
  type HttpOperationResponse,
  type Visibility,
} from "@typespec/http";
import { jsonValueForType } from "./type-ref.js";
import {
  applyRoutePrefix,
  asRecord,
  formatStatusCode,
  isSuccessStatusCode,
} from "./utils.js";

/**
 * Serializes a TypeSpec example value to a plain JSON-serializable value.
 *
 * Falls back to the type's name string when `serializeValueAsJson` throws —
 * this can happen for complex or partially-resolved example values.
 *
 * @param program - The TypeSpec program.
 * @param value - The example value or parameters object from a `@opExample` decorator.
 * @param type - The TypeSpec type that `value` conforms to.
 * @returns A JSON-serializable value, or `undefined` when `value` is `undefined`.
 */
function serializeSafely(
  program: Program,
  value: Example["value"] | OpExample["parameters"] | undefined,
  type: Type,
): unknown {
  if (value === undefined) return undefined;
  try {
    return serializeValueAsJson(program, value, type);
  } catch {
    return getTypeName(type);
  }
}

/**
 * Template data model for a single HTTP operation example block.
 * Used in the `operation.md.hbs` Handlebars template.
 */
export interface OperationExampleDoc {
  /** Example title, defaulting to `"Example N"` when not provided by `@opExample`. */
  title: string;
  /** Optional description from the `@opExample` decorator. */
  description?: string;
  /** Multi-line HTTP request example string (verb, path, headers, body). */
  request: string;
  /**
   * Multi-line HTTP response example string, or `undefined` when no response
   * body can be determined (e.g. `204 No Content`).
   */
  response?: string;
}

/**
 * Template data model for a single type example block.
 * Used in the `type.md.hbs` Handlebars template.
 */
export interface JsonExampleDoc {
  /** Example title, defaulting to `"Example N"` when not provided by `@example`. */
  title: string;
  /** Optional description from the `@example` decorator. */
  description?: string;
  /** JSON-stringified example value. */
  json: string;
}

/**
 * Builds the list of operation example blocks for an operation page.
 *
 * When `@opExample` decorators are present, one block is emitted per decorator.
 * When none are present, a single synthetic example is generated from the
 * HTTP metadata (path parameters, query params, body, and response shapes).
 * Returns an empty array when there is no HTTP metadata and no explicit examples.
 *
 * @param program - The TypeSpec program.
 * @param operation - The TypeSpec operation.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param routePrefix - Optional resolved route prefix to prepend to the path.
 * @returns An array of example blocks (zero or more).
 */
export function operationExamples(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  routePrefix?: string,
): OperationExampleDoc[] {
  const examples = getOpExamples(program, operation);

  if (examples.length > 0) {
    return examples.map((example, index) =>
      buildOperationExample(
        program,
        operation,
        httpOperation,
        example,
        index,
        routePrefix,
      ),
    );
  }

  const fallbackExample = buildSyntheticOperationExample(
    program,
    operation,
    httpOperation,
    routePrefix,
  );
  return fallbackExample ? [fallbackExample] : [];
}

/**
 * Converts a flat array of `@example` values into {@link JsonExampleDoc} objects.
 *
 * Used by type pages to render JSON examples from `@example` decorators.
 *
 * @param program - The TypeSpec program.
 * @param type - The TypeSpec type the examples belong to.
 * @param examples - The example values from `getExamples(program, type)`.
 */
export function typedExamples(
  program: Program,
  type: Type,
  examples: readonly Example[],
): JsonExampleDoc[] {
  return examples.map((example, index) => ({
    title: example.title ?? `Example ${index + 1}`,
    description: example.description,
    json: stringifyExample(program, example.value, type),
  }));
}

/**
 * Serializes a single example value to a pretty-printed JSON string.
 *
 * @param program - The TypeSpec program.
 * @param value - The example value from an `@example` decorator.
 * @param type - The TypeSpec type the value conforms to.
 * @returns A JSON-stringified string (may be `"null"` for unresolvable values).
 */
export function stringifyExample(
  program: Program,
  value: Example["value"],
  type: Type,
): string {
  return JSON.stringify(serializeSafely(program, value, type), null, 2);
}

/**
 * Builds an {@link OperationExampleDoc} from a single `@opExample` decorator value.
 *
 * @param program - The TypeSpec program.
 * @param operation - The TypeSpec operation.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param example - The `@opExample` data (may include `parameters` and `returnType`).
 * @param index - Zero-based index used to generate a default title.
 * @param routePrefix - Optional route prefix for the request line.
 */
function buildOperationExample(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  example: OpExample,
  index: number,
  routePrefix?: string,
): OperationExampleDoc {
  const parameterValues = example.parameters
    ? serializeSafely(program, example.parameters, operation.parameters)
    : undefined;
  const responseValue = example.returnType
    ? serializeSafely(program, example.returnType, operation.returnType)
    : undefined;

  return {
    title: example.title ?? `Example ${index + 1}`,
    description: example.description,
    request: buildHttpRequestExample(
      program,
      httpOperation,
      parameterValues,
      routePrefix,
    ),
    response: buildHttpResponseExample(program, httpOperation, responseValue),
  };
}

/**
 * Builds a synthetic {@link OperationExampleDoc} from HTTP metadata alone.
 *
 * Used when no `@opExample` decorators are present. Returns `undefined` when
 * there is no HTTP metadata (non-HTTP operations cannot produce a meaningful example).
 *
 * @param program - The TypeSpec program.
 * @param operation - The TypeSpec operation.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param routePrefix - Optional route prefix for the request line.
 */
function buildSyntheticOperationExample(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  routePrefix?: string,
): OperationExampleDoc | undefined {
  if (!httpOperation) {
    return undefined;
  }

  return {
    title: "Example 1",
    description: getSummary(program, operation) ?? getDoc(program, operation),
    request: buildHttpRequestExample(
      program,
      httpOperation,
      undefined,
      routePrefix,
    ),
    response: buildHttpResponseExample(program, httpOperation),
  };
}

/**
 * Builds the multi-line HTTP request example string.
 *
 * Format:
 * ```
 * POST /api/v1/widgets
 * X-Api-Key: my-key
 * Content-Type: application/json
 *
 * { "name": "Widget" }
 * ```
 *
 * Path parameters are substituted with percent-encoded sample values.
 * Query parameters are appended to the URL.
 * URI template expression placeholders (e.g. `{?filter}`) are stripped.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param parameterValues - Pre-resolved parameter values from `@opExample`, if any.
 * @param routePrefix - Optional route prefix to prepend.
 */
function buildHttpRequestExample(
  program: Program,
  httpOperation: HttpOperation | undefined,
  parameterValues?: unknown,
  routePrefix?: string,
): string {
  if (!httpOperation) {
    return "HTTP metadata is not available for this operation.";
  }

  const visibilityFilter = resolveRequestVisibility(
    program,
    httpOperation.operation,
    httpOperation.verb,
  );
  const sampleValues = resolveHttpParameterValues(
    program,
    httpOperation,
    parameterValues,
  );
  const lines = [
    formatHttpRequestExampleLine(httpOperation, sampleValues, routePrefix),
  ];
  const headerLines = buildRequestHeaderExampleLines(
    httpOperation,
    sampleValues,
  );
  const body = httpOperation.parameters.body;
  const bodyValue = body
    ? extractRequestBodyValue(
        program,
        httpOperation,
        sampleValues,
        visibilityFilter,
      )
    : undefined;

  lines.push(...headerLines);

  if (body) {
    lines.push(`Content-Type: ${body.contentTypes[0] ?? "application/json"}`);
  }

  if (bodyValue !== undefined) {
    lines.push("", JSON.stringify(bodyValue, null, 2));
  }

  return lines.join("\n");
}

/**
 * Builds the multi-line HTTP response example string.
 *
 * Picks the primary success response (falling back to the first response).
 * Returns `undefined` when no responses are defined or the response has no body.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param responseValue - Pre-resolved response body from `@opExample`, if any.
 */
function buildHttpResponseExample(
  program: Program,
  httpOperation: HttpOperation | undefined,
  responseValue?: unknown,
): string | undefined {
  if (!httpOperation) {
    return responseValue === undefined
      ? undefined
      : JSON.stringify(responseValue, null, 2);
  }

  const response = pickPrimaryResponse(httpOperation.responses);
  if (!response) {
    return undefined;
  }

  const content = response.responses[0];
  const inferredValue =
    responseValue ?? inferResponseBodyValue(program, content);
  const lines = [`HTTP/1.1 ${formatStatusCode(response.statusCodes)}`];

  if (inferredValue !== undefined) {
    lines.push(
      `Content-Type: ${content?.body?.contentTypes[0] ?? "application/json"}`,
      "",
      JSON.stringify(inferredValue, null, 2),
    );
  }

  return lines.join("\n");
}

/**
 * Formats the first line of the HTTP request example (verb + path).
 *
 * Path parameters are substituted with percent-encoded sample values.
 * Query parameters are appended as a query string.
 * Unresolved URI template expressions (e.g. `{?filter}`) are stripped.
 *
 * @param httpOperation - The resolved HTTP operation.
 * @param parameterValues - Resolved sample values keyed by parameter name.
 * @param routePrefix - Optional route prefix.
 */
function formatHttpRequestExampleLine(
  httpOperation: HttpOperation,
  parameterValues?: Record<string, unknown>,
  routePrefix?: string,
): string {
  let path = routePrefix
    ? applyRoutePrefix(httpOperation.uriTemplate, routePrefix)
    : httpOperation.uriTemplate;
  const queryEntries: string[] = [];

  for (const parameter of httpOperation.parameters.parameters) {
    const value = parameterValues?.[parameter.param.name];
    if (value === undefined) {
      continue;
    }

    if (parameter.type === "path") {
      path = path.replaceAll(
        `{${parameter.param.name}}`,
        encodeURIComponent(String(value)),
      );
      path = path.replaceAll(
        `{+${parameter.param.name}}`,
        encodeURIComponent(String(value)),
      );
      continue;
    }

    if (parameter.type === "query") {
      const queryName = parameter.param.name;
      queryEntries.push(
        `${encodeURIComponent(queryName)}=${encodeURIComponent(String(value))}`,
      );
    }
  }

  // Strip any unresolved URI template query expressions.
  path = path.replace(/\{\?[^}]+\}/g, "");
  if (queryEntries.length > 0) {
    path = `${path}${path.includes("?") ? "&" : "?"}${queryEntries.join("&")}`;
  }

  return `${httpOperation.verb.toUpperCase()} ${path}`;
}

/**
 * Builds the request header lines for the HTTP request example.
 *
 * Only includes headers for which a sample value is available.
 *
 * @param httpOperation - The resolved HTTP operation.
 * @param parameterValues - Resolved sample values keyed by parameter name.
 */
function buildRequestHeaderExampleLines(
  httpOperation: HttpOperation,
  parameterValues: Record<string, unknown>,
): string[] {
  const headerLines: string[] = [];

  for (const parameter of httpOperation.parameters.parameters) {
    if (parameter.type !== "header") {
      continue;
    }

    const value = parameterValues[parameter.param.name];
    if (value === undefined) {
      continue;
    }

    headerLines.push(`${parameter.name}: ${String(value)}`);
  }

  return headerLines;
}

/**
 * Resolves sample values for all HTTP parameters of an operation.
 *
 * Merges explicit values from `parameterValues` (as provided by `@opExample`)
 * with synthetically generated values for any parameters that were not covered.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation.
 * @param parameterValues - Pre-resolved values from an `@opExample`, if any.
 * @returns A record mapping each parameter's TypeSpec name to its sample value.
 */
function resolveHttpParameterValues(
  program: Program,
  httpOperation: HttpOperation,
  parameterValues?: unknown,
): Record<string, unknown> {
  const resolvedValues: Record<string, unknown> = {
    ...(asRecord(parameterValues) ?? {}),
  };

  for (const parameter of httpOperation.parameters.parameters) {
    if (resolvedValues[parameter.param.name] !== undefined) {
      continue;
    }

    resolvedValues[parameter.param.name] = sampleValueForType(
      program,
      parameter.param.type,
    );
  }

  return resolvedValues;
}

/**
 * Generates a representative sample value for a TypeSpec type.
 *
 * Delegates to {@link jsonValueForType} with an empty visited set.
 *
 * @param program - The TypeSpec program.
 * @param type - The type to sample.
 */
function sampleValueForType(program: Program, type: Type): unknown {
  return jsonValueForType(program, type, new Set<Type>());
}

/**
 * Extracts or synthesizes the request body value for an HTTP request example.
 *
 * When `parameterValues` contains an explicit value for the body property,
 * that value is used. Otherwise, a synthetic value is generated from the
 * body type, filtered to the request visibility.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation.
 * @param parameterValues - Resolved sample values from an `@opExample`, if any.
 * @param visibilityFilter - The HTTP verb visibility to apply when generating.
 */
function extractRequestBodyValue(
  program: Program,
  httpOperation: HttpOperation,
  parameterValues?: unknown,
  visibilityFilter?: Visibility,
): unknown {
  const body = httpOperation.parameters.body;
  if (!body) {
    return undefined;
  }

  const values = asRecord(parameterValues);
  if (values && body.property && values[body.property.name] !== undefined) {
    return values[body.property.name];
  }

  return body.bodyKind === "single"
    ? jsonValueForType(program, body.type, new Set<Type>(), visibilityFilter)
    : undefined;
}

/**
 * Infers the response body value for a synthetic example from HTTP response metadata.
 *
 * Returns `undefined` when the response has no body or is not a single-kind body
 * (e.g. multi-part responses are not representable as a single JSON value).
 *
 * @param program - The TypeSpec program.
 * @param responseContent - A single response content entry, or `undefined`.
 */
function inferResponseBodyValue(
  program: Program,
  responseContent: HttpOperationResponse["responses"][number] | undefined,
): unknown {
  if (!responseContent?.body) {
    return undefined;
  }

  return responseContent.body.bodyKind === "single"
    ? jsonValueForType(program, responseContent.body.type, new Set<Type>())
    : undefined;
}

/**
 * Picks the primary response to use for a synthetic response example.
 *
 * Prefers the first 2xx response. Falls back to the first response of any status.
 * Returns `undefined` when the operation has no responses defined.
 *
 * @param responses - All HTTP response objects for an operation.
 */
function pickPrimaryResponse(
  responses: HttpOperationResponse[],
): HttpOperationResponse | undefined {
  return (
    responses.find((response) => isSuccessStatusCode(response.statusCodes)) ??
    responses[0]
  );
}
