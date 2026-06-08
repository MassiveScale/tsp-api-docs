import {
  getDeprecated,
  getDoc,
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
  formatStatusCode,
  toTitleCaseLabel,
} from "./utils.js";

export interface ParameterDoc {
  name: string;
  type: string;
  requiredLabel: string;
  summary?: string;
  summaryOrFallback: string;
}

export interface HttpParameterDoc {
  name: string;
  type: string;
  requiredLabel: string;
  summary?: string;
  summaryOrFallback: string;
}

export interface RequestBodyDoc {
  type: string;
  contentTypes: string[];
  description: string;
  jsonExample?: string;
}

export interface ResponseDoc {
  statusCode: string;
  type: string;
  description: string;
}

export interface OperationPageModel {
  title: string;
  summary?: string;
  deprecated?: string;
  versionLabel?: string;
  apiName?: string;
  breadcrumbs: string[];
  httpRequest?: string;
  optionalQueryParameters: HttpParameterDoc[];
  requestHeaders: HttpParameterDoc[];
  signature: string;
  parameters: ParameterDoc[];
  requestBody?: RequestBodyDoc;
  returnType: string;
  responses: ResponseDoc[];
  responseHeaders: HttpParameterDoc[];
  returnsDoc?: string;
  errorsDoc?: string;
  examples: OperationExampleDoc[];
}

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
    errorsDoc: undefined,
    examples: operationExamples(program, operation, httpOperation, routePrefix),
  };
}

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

function formatHttpRequest(
  httpOperation: HttpOperation,
  routePrefix?: string,
): string {
  const path = routePrefix
    ? applyRoutePrefix(httpOperation.uriTemplate, routePrefix)
    : httpOperation.uriTemplate;
  return `${httpOperation.verb.toUpperCase()} ${path}`;
}

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

function httpResponseBodyType(
  response: HttpOperationResponse,
  makeRef: (type: Type) => string,
): string {
  const bodyTypes = response.responses
    .filter((content) => content.body)
    .map((content) => makeRef(content.body!.type));
  return bodyTypes.length > 0 ? [...new Set(bodyTypes)].join(" | ") : "void";
}

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
