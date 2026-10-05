import {
  getDeprecated,
  getDoc,
  getErrorsDoc,
  getReturnsDoc,
  getSummary,
  walkPropertiesInherited,
  type Model,
  type ModelProperty,
  type Operation,
  type Program,
  type Type,
} from "@typespec/compiler";
import {
  getHttpOperation,
  resolveRequestVisibility,
  type HttpOperation,
  type HttpOperationParameter,
  type HttpOperationResponse,
} from "@typespec/http";
import type { OperationExampleDoc } from "./operation-examples.js";
import { operationExamples } from "./operation-examples.js";
import { responsePayloadType } from "./payloads.js";
import {
  jsonValueForType,
  makeLinkedTypeRef,
  typeReference,
} from "./type-ref.js";
import {
  applyRoutePrefix,
  FALLBACK_SUMMARY,
  breadcrumbsForOperation,
  describeSummary,
  formatExternalDocsLink,
  formatStatusCode,
  isSuccessStatusCode,
  readableUriTemplate,
  toTitleCaseLabel,
} from "./utils.js";

/**
 * Documentation for a single TypeSpec operation parameter.
 * Used for both the "Parameters" table and the TypeSpec signature line.
 */
export interface ParameterDoc {
  /** Parameter name as declared in the TypeSpec source. */
  name: string;
  /** Markdown type reference string (may contain links). */
  type: string;
  /** `"Yes"` for required parameters, `"No"` for optional. */
  requiredLabel: string;
  /** Raw summary from `@summary` or `@doc`, if present. */
  summary?: string;
  /** Summary falling back to {@link FALLBACK_SUMMARY} when absent. */
  summaryOrFallback: string;
}

/**
 * Documentation for a single HTTP-layer parameter (query string or header).
 * Structurally identical to {@link ParameterDoc} but typed separately for
 * template clarity.
 */
export interface HttpParameterDoc {
  /** Parameter name as it appears in the HTTP request (e.g. `"X-Api-Key"`). */
  name: string;
  /** Markdown type reference string. */
  type: string;
  /** `"Yes"` for required parameters, `"No"` for optional. */
  requiredLabel: string;
  /** Raw summary from `@summary` or `@doc`, if present. */
  summary?: string;
  /** Summary falling back to {@link FALLBACK_SUMMARY} when absent. */
  summaryOrFallback: string;
}

/**
 * Documentation for the HTTP request body of an operation.
 */
export interface RequestBodyDoc {
  /** Markdown type reference string for the body type. */
  type: string;
  /** List of accepted `Content-Type` values (e.g. `["application/json"]`). */
  contentTypes: string[];
  /** Human-readable description of the body requirement. */
  description: string;
  /**
   * JSON-stringified example of the request body, or `undefined` when the body
   * is a multi-part or non-single kind where a synthetic example is impractical.
   */
  jsonExample?: string;
}

/**
 * Documentation for a single HTTP response variant returned by an operation.
 */
export interface ResponseDoc {
  /** Formatted status code string, e.g. `"200 OK"` or `"400 Bad Request"`. */
  statusCode: string;
  /** Markdown type reference string for the response body type, or `"void"`. */
  type: string;
  /** Human-readable description sourced from `@doc`, `@summary`, or a fallback. */
  description: string;
  /** Response headers returned with this status code, keyed by wire name. */
  headers: HttpParameterDoc[];
}

/**
 * The complete data model passed to the `operation.md.hbs` Handlebars template.
 */
export interface OperationPageModel {
  /** Page title in title-case, e.g. `"Widgets Create"`. */
  title: string;
  /** Raw summary from `@summary` or `@doc` on the operation, if present. */
  summary?: string;
  /** Deprecation message from `@deprecated`, if present. */
  deprecated?: string;
  /** API version label, e.g. `"v1.0"`, when the service is versioned. */
  versionLabel?: string;
  /** Resolved API name from emitter options, if set. */
  apiName?: string;
  /** Ordered breadcrumb labels, e.g. `["API", "Widgets", "create"]`. */
  breadcrumbs: string[];
  /**
   * First line of the HTTP request, e.g. `"GET /api/v1/widgets/{id}{?$expand}"`.
   * Percent-encoded names inside URI template expressions are decoded so the
   * line reads the way a client would type it.
   */
  httpRequest?: string;
  /** Path parameters extracted from the HTTP operation, by wire name. */
  pathParameters: HttpParameterDoc[];
  /** Query parameters extracted from the HTTP operation, by wire name. */
  optionalQueryParameters: HttpParameterDoc[];
  /** Request headers extracted from the HTTP operation, by wire name. */
  requestHeaders: HttpParameterDoc[];
  /** Request cookies extracted from the HTTP operation, by wire name. */
  requestCookies: HttpParameterDoc[];
  /** TypeSpec signature string, e.g. `"create(body: CreateRequest) => Widget"`. */
  signature: string;
  /**
   * All parameters of the TypeSpec operation, by TypeSpec name. The built-in
   * template renders these only for operations without HTTP metadata; HTTP
   * operations document the same parameters by wire name in the path, query,
   * header, cookie and body sections instead.
   */
  parameters: ParameterDoc[];
  /** HTTP request body documentation, if the operation has a body. */
  requestBody?: RequestBodyDoc;
  /** Markdown type reference string for the primary return type. */
  returnType: string;
  /** One row per HTTP response status code defined on the operation. */
  responses: ResponseDoc[];
  /**
   * Every response header across all status codes, deduplicated by wire name.
   * See {@link ResponseDoc.headers} for the headers of a single status code.
   */
  responseHeaders: HttpParameterDoc[];
  /** Text from `@returns` on the operation, if present. */
  returnsDoc?: string;
  /** Doc-comment content from the operation's `@errorsDoc` tag, if present. */
  errorsDoc?: string;
  /** Markdown link rendered from `@externalDocs` on the operation, if present. */
  externalDocs?: string;
  /** One or more code examples (from `@opExample` or synthetically generated). */
  examples: OperationExampleDoc[];
}

/**
 * Builds the complete {@link OperationPageModel} for a single TypeSpec operation.
 *
 * Resolves the HTTP operation metadata if available, and delegates to helper
 * functions for each section of the page (parameters, body, responses, examples).
 * When no HTTP operation metadata is available (e.g. non-HTTP services), HTTP-
 * specific sections are omitted or set to safe defaults.
 *
 * @param program - The TypeSpec program.
 * @param operation - The operation to document.
 * @param typePathById - Map from entity ID to relative path for Markdown links.
 * @param versionLabel - Optional version string for versioned services.
 * @param apiName - Optional resolved API name from emitter options.
 * @param routePrefix - Optional resolved route prefix (e.g. `"api/v1"`).
 * @returns A fully-populated operation page data model.
 */
export function buildOperationPage(
  program: Program,
  operation: Operation,
  typePathById: Map<string, string>,
  versionLabel?: string,
  apiName?: string,
  routePrefix?: string,
): OperationPageModel {
  const summary = getSummary(program, operation) ?? getDoc(program, operation);
  const httpOperation = resolveHttpOperation(program, operation);

  const operationLabel = operation.interface?.name
    ? `${operation.interface.name} ${operation.name}`
    : operation.name;

  const makeRef = makeLinkedTypeRef(program, typePathById, (p) => `../${p}`);

  return {
    title: toTitleCaseLabel(operationLabel),
    summary,
    deprecated: getDeprecated(program, operation),
    versionLabel,
    apiName,
    breadcrumbs: breadcrumbsForOperation(program, operation),
    httpRequest: httpOperation
      ? formatHttpRequest(httpOperation, routePrefix)
      : undefined,
    pathParameters: buildHttpParameterDocs(
      program,
      httpOperation,
      "path",
      makeRef,
    ),
    optionalQueryParameters: buildHttpParameterDocs(
      program,
      httpOperation,
      "query",
      makeRef,
    ),
    requestHeaders: buildHttpParameterDocs(
      program,
      httpOperation,
      "header",
      makeRef,
    ),
    requestCookies: buildHttpParameterDocs(
      program,
      httpOperation,
      "cookie",
      makeRef,
    ),
    signature: `${operation.name}(${formatParametersSignature(program, operation.parameters)}) => ${typeReference(program, operation.returnType)}`,
    parameters: modelProperties(program, operation.parameters, makeRef),
    requestBody: buildRequestBodyDoc(program, httpOperation, makeRef),
    returnType: buildOperationReturnType(operation, httpOperation, makeRef),
    responses: buildResponseDocs(program, operation, httpOperation, makeRef),
    responseHeaders: buildResponseHeaderDocs(program, httpOperation, makeRef),
    returnsDoc: getReturnsDoc(program, operation),
    errorsDoc: getErrorsDoc(program, operation),
    externalDocs: formatExternalDocsLink(program, operation),
    examples: operationExamples(program, operation, httpOperation, routePrefix),
  };
}

/**
 * Resolves the HTTP operation metadata for a TypeSpec operation.
 *
 * Returns `undefined` (rather than throwing) when the operation is not an HTTP
 * operation or when the `@typespec/http` library reports any diagnostics.
 * Callers should treat `undefined` as "no HTTP layer available" and degrade
 * gracefully (omit request line, skip headers, etc.).
 *
 * @param program - The TypeSpec program.
 * @param operation - The operation to resolve.
 */
export function resolveHttpOperation(
  program: Program,
  operation: Operation,
): HttpOperation | undefined {
  try {
    const [httpOperation, diagnostics] = getHttpOperation(program, operation);
    return diagnostics.length === 0 ? httpOperation : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Converts the inherited properties of a model into an array of {@link ParameterDoc}.
 *
 * Used for both operation parameter models and type property tables.
 *
 * @param program - The TypeSpec program.
 * @param model - The model whose properties to document.
 * @param makeRef - A type-reference function (may produce Markdown links).
 * @returns One {@link ParameterDoc} per property, in declaration order.
 */
export function modelProperties(
  program: Program,
  model: Model,
  makeRef: (type: Type) => string,
): ParameterDoc[] {
  return propertyDocs(program, walkPropertiesInherited(model), makeRef);
}

/**
 * Converts model properties into an array of {@link ParameterDoc}, one per
 * property, in iteration order.
 *
 * @param program - The TypeSpec program.
 * @param properties - The properties to document.
 * @param makeRef - A type-reference function (may produce Markdown links).
 */
export function propertyDocs(
  program: Program,
  properties: Iterable<ModelProperty>,
  makeRef: (type: Type) => string,
): ParameterDoc[] {
  return [...properties].map((property) => ({
    name: property.name,
    type: makeRef(property.type),
    requiredLabel: property.optional ? "No" : "Yes",
    summary: getSummary(program, property) ?? getDoc(program, property),
    summaryOrFallback: describeSummary(program, property),
  }));
}

/**
 * Formats the parameter list of an operation as a TypeSpec-style signature string.
 *
 * Example: `"id: string, body?: CreateRequest"`.
 *
 * @param program - The TypeSpec program.
 * @param model - The parameters model of the operation.
 * @returns A comma-separated parameter signature string.
 */
export function formatParametersSignature(
  program: Program,
  model: Model,
): string {
  return modelProperties(program, model, (type) => typeReference(program, type))
    .map(
      (property) =>
        `${property.name}${property.requiredLabel === "No" ? "?" : ""}: ${property.type}`,
    )
    .join(", ");
}

/**
 * Formats the HTTP request line, e.g. `"GET /api/v1/widgets/{id}{?$expand}"`.
 *
 * @param httpOperation - The resolved HTTP operation.
 * @param routePrefix - Optional prefix to prepend to the URI template.
 */
function formatHttpRequest(
  httpOperation: HttpOperation,
  routePrefix?: string,
): string {
  const uriTemplate = readableUriTemplate(httpOperation.uriTemplate);
  const path = routePrefix
    ? applyRoutePrefix(uriTemplate, routePrefix)
    : uriTemplate;
  return `${httpOperation.verb.toUpperCase()} ${path}`;
}

/**
 * Builds the {@link RequestBodyDoc} for an HTTP operation, if it has a body.
 *
 * Generates a synthetic JSON example from the body type using the HTTP verb's
 * request visibility filter so write-only fields are included and read-only
 * fields are excluded.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param makeRef - A type-reference function for Markdown links.
 * @returns A {@link RequestBodyDoc} or `undefined` if there is no body.
 */
function buildRequestBodyDoc(
  program: Program,
  httpOperation: HttpOperation | undefined,
  makeRef: (type: Type) => string,
): RequestBodyDoc | undefined {
  const body = httpOperation?.parameters.body;
  if (!body) {
    return undefined;
  }

  const visibility = resolveRequestVisibility(
    program,
    httpOperation!.operation,
    httpOperation!.verb,
  );
  const typeName = makeRef(body.type);
  return {
    type: typeName,
    contentTypes:
      body.contentTypes.length > 0
        ? [...body.contentTypes]
        : ["application/json"],
    description: `Supply a request body of type ${typeName}.`,
    jsonExample:
      body.bodyKind === "single"
        ? JSON.stringify(
            jsonValueForType(program, body.type, new Set<Type>(), visibility),
            null,
            2,
          )
        : undefined,
  };
}

/**
 * Extracts documentation for one kind of HTTP parameter (path, query, header
 * or cookie) from an HTTP operation.
 *
 * Uses `parameter.name`, the wire name a client types (e.g. `"$expand"` or
 * `"If-Match"`), rather than `parameter.param.name`, the TypeSpec identifier.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param kind - The parameter location to extract.
 * @param makeRef - A type-reference function for Markdown links.
 * @returns The matching parameter docs, or empty when there is no HTTP op.
 */
function buildHttpParameterDocs(
  program: Program,
  httpOperation: HttpOperation | undefined,
  kind: HttpOperationParameter["type"],
  makeRef: (type: Type) => string,
): HttpParameterDoc[] {
  if (!httpOperation) {
    return [];
  }

  return httpOperation.parameters.parameters
    .filter((parameter) => parameter.type === kind)
    .map((parameter) => ({
      name: parameter.name,
      type: makeRef(parameter.param.type),
      requiredLabel: parameter.param.optional ? "No" : "Yes",
      summary:
        getSummary(program, parameter.param) ??
        getDoc(program, parameter.param),
      summaryOrFallback: describeSummary(program, parameter.param),
    }));
}

/**
 * Builds the type reference string for the body of a single HTTP response.
 *
 * Implicit bodies are shown as their named response model, so the reference
 * links to that model's type page. Returns `"void"` when the response has no
 * body contents.
 *
 * @param response - One HTTP response object (a single status-code variant).
 * @param makeRef - A type-reference function for Markdown links.
 */
function httpResponseBodyType(
  response: HttpOperationResponse,
  makeRef: (type: Type) => string,
): string {
  const bodyTypes = response.responses
    .map((content) => responsePayloadType(response, content))
    .filter((type): type is Type => type !== undefined)
    .map(makeRef);
  return bodyTypes.length > 0 ? [...new Set(bodyTypes)].join(" | ") : "void";
}

/**
 * Builds the return type display string for an operation.
 *
 * For HTTP operations, this is what a caller receives on success: the body
 * types of every 2xx response (`"void"` for a 2xx response without a body),
 * deduplicated and joined with `" | "`. Error responses are listed in the
 * responses table instead. When the operation declares no 2xx response, the
 * body types of all responses are used. Falls back to the TypeSpec return
 * type when there is no HTTP metadata or no responses at all.
 *
 * @param operation - The TypeSpec operation.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param makeRef - A type-reference function for Markdown links.
 */
export function buildOperationReturnType(
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  makeRef: (type: Type) => string,
): string {
  if (!httpOperation) {
    return makeRef(operation.returnType);
  }

  const successResponses = httpOperation.responses.filter((response) =>
    isSuccessStatusCode(response.statusCodes),
  );
  const responses =
    successResponses.length > 0 ? successResponses : httpOperation.responses;

  const bodyTypes: string[] = [];
  for (const response of responses) {
    const ref = httpResponseBodyType(response, makeRef);
    if (!bodyTypes.includes(ref)) {
      bodyTypes.push(ref);
    }
  }

  return bodyTypes.length > 0
    ? bodyTypes.join(" | ")
    : makeRef(operation.returnType);
}

/**
 * Builds one {@link ResponseDoc} per HTTP response status code defined on an operation.
 *
 * When no HTTP metadata is available, returns a single synthetic `"default"`
 * response using the TypeSpec return type and `@returns` doc.
 *
 * @param program - The TypeSpec program.
 * @param operation - The TypeSpec operation.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param makeRef - A type-reference function for Markdown links.
 */
function buildResponseDocs(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  makeRef: (type: Type) => string,
): ResponseDoc[] {
  if (!httpOperation) {
    return [
      {
        statusCode: "default",
        type: makeRef(operation.returnType),
        description:
          getReturnsDoc(program, operation) ??
          `Returns ${makeRef(operation.returnType)}.`,
        headers: [],
      },
    ];
  }

  return httpOperation.responses.map((response) => ({
    statusCode: formatStatusCode(response.statusCodes),
    type: httpResponseBodyType(response, makeRef),
    description:
      response.description ??
      getSummary(program, response.type) ??
      getDoc(program, response.type) ??
      FALLBACK_SUMMARY,
    headers: responseHeaderDocs(program, [response], makeRef),
  }));
}

/**
 * Collects the response headers of the given responses, deduplicated by wire
 * name, so a header declared on several content entries (or several status
 * codes) appears once.
 *
 * @param program - The TypeSpec program.
 * @param responses - The HTTP responses whose headers to collect.
 * @param makeRef - A type-reference function for Markdown links.
 */
function responseHeaderDocs(
  program: Program,
  responses: HttpOperationResponse[],
  makeRef: (type: Type) => string,
): HttpParameterDoc[] {
  const seen = new Set<string>();
  const docs: HttpParameterDoc[] = [];

  for (const response of responses) {
    for (const content of response.responses) {
      for (const [name, prop] of Object.entries(content.headers ?? {})) {
        if (seen.has(name)) continue;
        seen.add(name);
        docs.push({
          name,
          type: makeRef(prop.type),
          requiredLabel: prop.optional ? "No" : "Yes",
          summary: getSummary(program, prop) ?? getDoc(program, prop),
          summaryOrFallback: describeSummary(program, prop),
        });
      }
    }
  }

  return docs;
}

/**
 * Collects unique response header documentation across all response variants
 * of an HTTP operation.
 *
 * Deduplicates by header name so that headers defined on multiple response
 * variants (e.g. `ETag` on both 200 and 201) appear only once.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param makeRef - A type-reference function for Markdown links.
 * @returns An array of unique response header docs, or empty when no HTTP op.
 */
function buildResponseHeaderDocs(
  program: Program,
  httpOperation: HttpOperation | undefined,
  makeRef: (type: Type) => string,
): HttpParameterDoc[] {
  return httpOperation
    ? responseHeaderDocs(program, httpOperation.responses, makeRef)
    : [];
}
