import {
  getDoc,
  getOpExamples,
  getSummary,
  getTypeName,
  serializeValueAsJson,
  walkPropertiesInherited,
  type Example,
  type OpExample,
  type Operation,
  type Program,
  type Type,
} from "@typespec/compiler";
import {
  isMetadata,
  isStatusCode,
  resolveRequestVisibility,
  type HttpOperation,
  type HttpOperationResponse,
  type Visibility,
} from "@typespec/http";
import {
  getPolymorphicVariants,
  type PolymorphicInfo,
  type PolymorphicVariant,
} from "./discriminators.js";
import {
  jsonValueForPolymorphicVariant,
  jsonValueForType,
  typeReference,
} from "./type-ref.js";
import {
  applyRoutePrefix,
  asRecord,
  formatStatusCode,
  isSuccessStatusCode,
  readableUriTemplate,
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
 * One variant of a polymorphic body, chosen for a synthetic example.
 */
interface SelectedVariant {
  /** The polymorphic body type. */
  info: PolymorphicInfo;
  /** The variant the example sends or returns. */
  variant: PolymorphicVariant;
}

/**
 * Builds the list of operation example blocks for an operation page.
 *
 * When `@opExample` decorators are present, one block is emitted per decorator.
 * When none are present, synthetic examples are generated from the HTTP
 * metadata (path parameters, query params, body, and response shapes): one
 * per variant when the request or primary response body is polymorphic (see
 * {@link buildSyntheticOperationExamples}), otherwise one.
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

  return buildSyntheticOperationExamples(
    program,
    operation,
    httpOperation,
    routePrefix,
  );
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
 * Builds synthetic {@link OperationExampleDoc}s from HTTP metadata alone.
 *
 * Used when no `@opExample` decorators are present. When the request body or
 * the primary response body is polymorphic, one example is built per variant
 * (titled e.g. `"Example 2: Cat"`), so every derived type has a payload a
 * client can copy. When both are polymorphic, example *n* pairs the *n*th
 * request variant with the *n*th response variant (`create(@body pet: Pet): Pet`
 * sends and returns a `Cat` in the same example). Otherwise a single example is
 * built. Returns an empty array when there is no HTTP metadata (non-HTTP
 * operations cannot produce a meaningful example).
 *
 * @param program - The TypeSpec program.
 * @param operation - The TypeSpec operation.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param routePrefix - Optional route prefix for the request line.
 */
function buildSyntheticOperationExamples(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  routePrefix?: string,
): OperationExampleDoc[] {
  if (!httpOperation) {
    return [];
  }

  const description =
    getSummary(program, operation) ?? getDoc(program, operation);
  const requestBody = httpOperation.parameters.body;
  const requestInfo =
    requestBody?.bodyKind === "single"
      ? getPolymorphicVariants(program, requestBody.type)
      : undefined;
  const responseBody = pickPrimaryResponse(httpOperation.responses)
    ?.responses[0]?.body;
  const responseInfo =
    responseBody?.bodyKind === "single"
      ? getPolymorphicVariants(program, responseBody.type)
      : undefined;
  const count = Math.max(
    requestInfo?.variants.length ?? 1,
    responseInfo?.variants.length ?? 1,
  );

  return Array.from({ length: count }, (_, index) => {
    const requestVariant = selectVariant(requestInfo, index);
    const responseVariant = selectVariant(responseInfo, index);
    const label = (requestVariant ?? responseVariant)?.variant.type;
    return {
      title:
        count > 1 && label
          ? `Example ${index + 1}: ${typeReference(program, label)}`
          : `Example ${index + 1}`,
      description,
      request: buildHttpRequestExample(
        program,
        httpOperation,
        undefined,
        routePrefix,
        requestVariant,
      ),
      response: buildHttpResponseExample(
        program,
        httpOperation,
        undefined,
        responseVariant,
      ),
    };
  });
}

/**
 * Picks the variant of a polymorphic body for the example at `index`. When the
 * body has fewer variants than there are examples, the last one repeats.
 *
 * @param info - The polymorphic body type, or `undefined` when not polymorphic.
 * @param index - Zero-based example index.
 */
function selectVariant(
  info: PolymorphicInfo | undefined,
  index: number,
): SelectedVariant | undefined {
  if (!info) return undefined;
  return {
    info,
    variant: info.variants[Math.min(index, info.variants.length - 1)],
  };
}

/**
 * Renders the JSON body for a selected variant of a polymorphic body.
 *
 * @param program - The TypeSpec program.
 * @param selected - The polymorphic body and the variant to render.
 * @param visibilityFilter - Optional HTTP visibility to filter model properties.
 */
function selectedVariantValue(
  program: Program,
  selected: SelectedVariant,
  visibilityFilter?: Visibility,
): unknown {
  return jsonValueForPolymorphicVariant(
    program,
    selected.info,
    selected.variant,
    new Set<Type>([selected.info.type]),
    visibilityFilter,
  );
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
 * @param bodyVariant - The variant to send when the body is polymorphic.
 */
function buildHttpRequestExample(
  program: Program,
  httpOperation: HttpOperation | undefined,
  parameterValues?: unknown,
  routePrefix?: string,
  bodyVariant?: SelectedVariant,
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
        bodyVariant,
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
 * When an `@opExample` return value carries a `@statusCode` value (e.g.
 * `#{ statusCode: 404, body: ... }`), the response with that status code is
 * used. Otherwise the primary success response is used (falling back to the
 * first response). Response headers are listed after the status line, using
 * sample values (or the `@opExample` values when present). Returns
 * `undefined` when no responses are defined.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param responseValue - Pre-resolved response body from `@opExample`, if any.
 * @param bodyVariant - The variant to return when the body is polymorphic.
 */
function buildHttpResponseExample(
  program: Program,
  httpOperation: HttpOperation | undefined,
  responseValue?: unknown,
  bodyVariant?: SelectedVariant,
): string | undefined {
  if (!httpOperation) {
    return responseValue === undefined
      ? undefined
      : JSON.stringify(responseValue, null, 2);
  }

  const matched =
    responseValue === undefined
      ? undefined
      : pickExampleResponse(program, httpOperation.responses, responseValue);
  const response =
    matched?.response ?? pickPrimaryResponse(httpOperation.responses);
  if (!response) {
    return undefined;
  }

  const content = response.responses[0];
  const example =
    responseValue === undefined
      ? undefined
      : splitResponseExampleValue(program, response, content, responseValue);
  const inferredValue =
    example === undefined
      ? inferResponseBodyValue(program, content, bodyVariant)
      : example.body;
  const lines = [
    `HTTP/1.1 ${formatStatusCode(matched?.statusCode ?? response.statusCodes)}`,
  ];

  for (const [name, property] of Object.entries(content?.headers ?? {})) {
    const value =
      example?.headers[property.name] ??
      sampleValueForType(program, property.type);
    lines.push(`${name}: ${formatHeaderValue(value)}`);
  }

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
 * The parts of an `@opExample` return value that belong to one HTTP response.
 */
interface ResponseExampleParts {
  /** The JSON body value, or `undefined` when the response has no body. */
  body: unknown;
  /** Header values keyed by the TypeSpec property name of each header. */
  headers: Record<string, unknown>;
}

/**
 * Splits an `@opExample` return value into its response body and headers.
 *
 * An example for a response model (e.g. `EntityResponse<Widget>`) holds the
 * whole model: status code, headers and body. Only the body belongs in the
 * JSON payload. When the response has an explicit `@body` / `@bodyRoot`, its
 * value is used as the body. Otherwise metadata properties are removed and the
 * remaining properties form the body.
 *
 * @param program - The TypeSpec program.
 * @param response - The HTTP response the example is rendered for.
 * @param content - The response content entry the example is rendered for.
 * @param value - The serialized `@opExample` return value.
 */
function splitResponseExampleValue(
  program: Program,
  response: HttpOperationResponse,
  content: HttpOperationResponse["responses"][number] | undefined,
  value: unknown,
): ResponseExampleParts {
  const record = asRecord(value);
  if (!record || response.type.kind !== "Model") {
    return { body: value, headers: {} };
  }

  const headers: Record<string, unknown> = {};
  for (const property of Object.values(content?.headers ?? {})) {
    if (record[property.name] !== undefined) {
      headers[property.name] = record[property.name];
    }
  }

  const bodyProperty = content?.body?.property;
  if (bodyProperty && bodyProperty.name in record) {
    return { body: record[bodyProperty.name], headers };
  }

  const metadataNames = new Set(
    [...walkPropertiesInherited(response.type)]
      .filter((property) => isMetadata(program, property))
      .map((property) => property.name),
  );
  if (metadataNames.size === 0) {
    return { body: value, headers };
  }

  const body = Object.fromEntries(
    Object.entries(record).filter(([name]) => !metadataNames.has(name)),
  );
  return {
    body: content?.body && Object.keys(body).length > 0 ? body : undefined,
    headers,
  };
}

/**
 * Formats a sample value for an HTTP header line. Arrays use the
 * comma-separated form HTTP uses for list-valued headers.
 *
 * @param value - The sample value.
 */
function formatHeaderValue(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(",") : String(value);
}

/**
 * Percent-encodes a query parameter name, leaving `$` readable because RFC
 * 3986 allows it in a query and OData-style names (`$expand`) rely on it.
 *
 * @param name - The query parameter wire name.
 */
function encodeQueryName(name: string): string {
  return encodeURIComponent(name).replace(/%24/g, "$");
}

/**
 * Builds the `name=value` entries for one query parameter. An array value is
 * repeated per item when `explode` is set, otherwise comma-separated.
 *
 * @param name - The query parameter wire name.
 * @param value - The sample value.
 * @param explode - Whether the parameter uses exploded (repeated) form.
 */
function queryEntriesFor(
  name: string,
  value: unknown,
  explode: boolean,
): string[] {
  const encodedName = encodeQueryName(name);
  if (!Array.isArray(value)) {
    return [`${encodedName}=${encodeURIComponent(String(value))}`];
  }
  const items = value.map((item) => encodeURIComponent(String(item)));
  return explode
    ? items.map((item) => `${encodedName}=${item}`)
    : [`${encodedName}=${items.join(",")}`];
}

/**
 * Formats the first line of the HTTP request example (verb + path).
 *
 * Path parameters are substituted with percent-encoded sample values.
 * Query parameters are appended as a query string, using their wire names.
 * Unresolved URI template expressions (e.g. `{?filter}`) are stripped.
 *
 * @param httpOperation - The resolved HTTP operation.
 * @param parameterValues - Resolved sample values keyed by TypeSpec parameter name.
 * @param routePrefix - Optional route prefix.
 */
function formatHttpRequestExampleLine(
  httpOperation: HttpOperation,
  parameterValues?: Record<string, unknown>,
  routePrefix?: string,
): string {
  const uriTemplate = readableUriTemplate(httpOperation.uriTemplate);
  let path = routePrefix
    ? applyRoutePrefix(uriTemplate, routePrefix)
    : uriTemplate;
  const queryEntries: string[] = [];

  for (const parameter of httpOperation.parameters.parameters) {
    const value = parameterValues?.[parameter.param.name];
    if (value === undefined) {
      continue;
    }

    if (parameter.type === "path") {
      const encoded = encodeURIComponent(String(value));
      path = path.replaceAll(`{${parameter.name}}`, encoded);
      path = path.replaceAll(`{+${parameter.name}}`, encoded);
      continue;
    }

    if (parameter.type === "query") {
      queryEntries.push(
        ...queryEntriesFor(parameter.name, value, parameter.explode),
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

    headerLines.push(`${parameter.name}: ${formatHeaderValue(value)}`);
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
 * @param bodyVariant - The variant to send when the body is polymorphic.
 */
function extractRequestBodyValue(
  program: Program,
  httpOperation: HttpOperation,
  parameterValues?: unknown,
  visibilityFilter?: Visibility,
  bodyVariant?: SelectedVariant,
): unknown {
  const body = httpOperation.parameters.body;
  if (!body) {
    return undefined;
  }

  const values = asRecord(parameterValues);
  if (values && body.property && values[body.property.name] !== undefined) {
    return values[body.property.name];
  }

  if (body.bodyKind !== "single") {
    return undefined;
  }
  return bodyVariant
    ? selectedVariantValue(program, bodyVariant, visibilityFilter)
    : jsonValueForType(program, body.type, new Set<Type>(), visibilityFilter);
}

/**
 * Infers the response body value for a synthetic example from HTTP response metadata.
 *
 * Returns `undefined` when the response has no body or is not a single-kind body
 * (e.g. multi-part responses are not representable as a single JSON value).
 *
 * @param program - The TypeSpec program.
 * @param responseContent - A single response content entry, or `undefined`.
 * @param bodyVariant - The variant to return when the body is polymorphic.
 */
function inferResponseBodyValue(
  program: Program,
  responseContent: HttpOperationResponse["responses"][number] | undefined,
  bodyVariant?: SelectedVariant,
): unknown {
  if (responseContent?.body?.bodyKind !== "single") {
    return undefined;
  }

  return bodyVariant
    ? selectedVariantValue(program, bodyVariant)
    : jsonValueForType(program, responseContent.body.type, new Set<Type>());
}

/**
 * Finds the response an `@opExample` return value belongs to, by reading the
 * value of each response model's `@statusCode` property from the example.
 *
 * An exact status code wins over a range (`@minValue(400) @maxValue(499)`).
 * The `default` (`*`) response never matches: it comes from a model without a
 * `@statusCode` property, so an example cannot select it. Returns `undefined`
 * when the example carries no status code that any response accepts.
 *
 * @param program - The TypeSpec program.
 * @param responses - All HTTP response objects for an operation.
 * @param value - The serialized `@opExample` return value.
 * @returns The matching response and the example's numeric status code.
 */
function pickExampleResponse(
  program: Program,
  responses: HttpOperationResponse[],
  value: unknown,
): { response: HttpOperationResponse; statusCode: number } | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const candidates: Array<{
    response: HttpOperationResponse;
    statusCode: number;
    rank: number;
  }> = [];
  for (const response of responses) {
    if (response.type.kind !== "Model") continue;
    for (const property of walkPropertiesInherited(response.type)) {
      const statusCode = record[property.name];
      if (!isStatusCode(program, property) || typeof statusCode !== "number") {
        continue;
      }
      const rank = statusCodeMatchRank(response.statusCodes, statusCode);
      if (rank !== undefined) {
        candidates.push({ response, statusCode, rank });
      }
    }
  }

  candidates.sort((left, right) => left.rank - right.rank);
  return candidates[0];
}

/**
 * Ranks how specifically a response's status codes accept `statusCode`:
 * `0` for an exact code, `1` for a range, or `undefined` when the response
 * does not accept it.
 *
 * @param statusCodes - The response's status code or range. Callers only pass
 *   responses declared by a `@statusCode` property, which are never `*`.
 * @param statusCode - The numeric status code from an example.
 */
function statusCodeMatchRank(
  statusCodes: HttpOperationResponse["statusCodes"],
  statusCode: number,
): number | undefined {
  if (typeof statusCodes === "number") {
    return statusCodes === statusCode ? 0 : undefined;
  }
  if (statusCodes === "*") {
    return undefined;
  }
  return statusCode >= statusCodes.start && statusCode <= statusCodes.end
    ? 1
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
