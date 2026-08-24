import {
  getDeprecated,
  getDoc,
  getErrorsDoc,
  getReturnsDoc,
  getSummary,
  walkPropertiesInherited,
  type Model,
  type Operation,
  type Program,
  type Type,
} from "@typespec/compiler";
import {
  getHttpOperation,
  resolveRequestVisibility,
  type HttpOperation,
  type HttpOperationResponse,
} from "@typespec/http";
import type { OperationExampleDoc } from "./operation-examples.js";
import { operationExamples } from "./operation-examples.js";
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
  /** First line of the HTTP request example, e.g. `"POST /api/v1/widgets"`. */
  httpRequest?: string;
  /** Optional query parameters extracted from the HTTP operation. */
  optionalQueryParameters: HttpParameterDoc[];
  /** Request headers extracted from the HTTP operation. */
  requestHeaders: HttpParameterDoc[];
  /** TypeSpec signature string, e.g. `"create(body: CreateRequest) => Widget"`. */
  signature: string;
  /** All parameters of the TypeSpec operation (includes body, path, query, headers). */
  parameters: ParameterDoc[];
  /** HTTP request body documentation, if the operation has a body. */
  requestBody?: RequestBodyDoc;
  /** Markdown type reference string for the primary return type. */
  returnType: string;
  /** One row per HTTP response status code defined on the operation. */
  responses: ResponseDoc[];
  /** Response headers defined on successful responses. */
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
    optionalQueryParameters: buildQueryParameterDocs(
      program,
      httpOperation,
      makeRef,
    ),
    requestHeaders: buildHeaderDocs(program, httpOperation, makeRef),
    signature: `${operation.name}(${formatParametersSignature(program, operation.parameters)}) => ${typeReference(program, operation.returnType)}`,
    parameters: modelProperties(program, operation.parameters, makeRef),
    requestBody: buildRequestBodyDoc(program, httpOperation, makeRef),
    returnType: buildOperationReturnType(
      program,
      operation,
      httpOperation,
      makeRef,
    ),
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
  return [...walkPropertiesInherited(model)].map((property) => ({
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
 * Formats the first line of an HTTP request example, e.g. `"POST /api/v1/widgets"`.
 *
 * @param httpOperation - The resolved HTTP operation.
 * @param routePrefix - Optional prefix to prepend to the URI template.
 */
function formatHttpRequest(
  httpOperation: HttpOperation,
  routePrefix?: string,
): string {
  const path = routePrefix
    ? applyRoutePrefix(httpOperation.uriTemplate, routePrefix)
    : httpOperation.uriTemplate;
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
 * Extracts optional query parameter documentation from an HTTP operation.
 *
 * Only parameters of `type === "query"` are included. Required query parameters
 * are excluded — they should be documented in the main parameters table.
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param makeRef - A type-reference function for Markdown links.
 * @returns An array of optional query parameter docs, or empty when no HTTP op.
 */
function buildQueryParameterDocs(
  program: Program,
  httpOperation: HttpOperation | undefined,
  makeRef: (type: Type) => string,
): HttpParameterDoc[] {
  if (!httpOperation) {
    return [];
  }

  return httpOperation.parameters.parameters
    .filter((parameter) => parameter.type === "query")
    .map((parameter) => ({
      name: parameter.param.name,
      type: makeRef(parameter.param.type),
      requiredLabel: parameter.param.optional ? "No" : "Yes",
      summary:
        getSummary(program, parameter.param) ??
        getDoc(program, parameter.param),
      summaryOrFallback: describeSummary(program, parameter.param),
    }));
}

/**
 * Extracts request header documentation from an HTTP operation.
 *
 * Note: uses `parameter.name` (the wire header name, e.g. `"X-Api-Key"`) for
 * the `name` field rather than `parameter.param.name` (the TypeSpec identifier).
 *
 * @param program - The TypeSpec program.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param makeRef - A type-reference function for Markdown links.
 * @returns An array of request header docs, or empty when no HTTP op.
 */
function buildHeaderDocs(
  program: Program,
  httpOperation: HttpOperation | undefined,
  makeRef: (type: Type) => string,
): HttpParameterDoc[] {
  if (!httpOperation) {
    return [];
  }

  return httpOperation.parameters.parameters
    .filter((parameter) => parameter.type === "header")
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
 * Extracts the unique body type references from a single HTTP response object.
 *
 * Returns `"void"` when the response has no body contents.
 *
 * @param response - One HTTP response object (a single status-code variant).
 * @param makeRef - A type-reference function for Markdown links.
 */
function httpResponseBodyType(
  response: HttpOperationResponse,
  makeRef: (type: Type) => string,
): string {
  const bodyTypes = response.responses
    .filter((content) => content.body)
    .map((content) => makeRef(content.body!.type));
  return bodyTypes.length > 0 ? [...new Set(bodyTypes)].join(" | ") : "void";
}

/**
 * Builds the return type display string for an operation page.
 *
 * For HTTP operations, collects unique body types across all responses and
 * joins them with `" | "`. Falls back to the TypeSpec return type when no
 * response has a body or when there is no HTTP metadata.
 *
 * @param program - The TypeSpec program.
 * @param operation - The TypeSpec operation.
 * @param httpOperation - The resolved HTTP operation, or `undefined`.
 * @param makeRef - A type-reference function for Markdown links.
 */
function buildOperationReturnType(
  program: Program,
  operation: Operation,
  httpOperation: HttpOperation | undefined,
  makeRef: (type: Type) => string,
): string {
  if (!httpOperation) {
    return makeRef(operation.returnType);
  }

  const bodyTypes: string[] = [];
  for (const response of httpOperation.responses) {
    for (const content of response.responses) {
      if (content.body) {
        const ref = makeRef(content.body.type);
        if (!bodyTypes.includes(ref)) {
          bodyTypes.push(ref);
        }
      }
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
  }));
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
  if (!httpOperation) {
    return [];
  }

  const seen = new Set<string>();
  const docs: HttpParameterDoc[] = [];

  for (const response of httpOperation.responses) {
    for (const content of response.responses) {
      if (!content.headers) continue;
      for (const [name, prop] of Object.entries(content.headers)) {
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
