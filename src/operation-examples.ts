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
import { asRecord, formatStatusCode, isSuccessStatusCode } from "./utils.js";

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

export interface OperationExampleDoc {
  title: string;
  description?: string;
  request: string;
  response?: string;
}

export interface JsonExampleDoc {
  title: string;
  description?: string;
  json: string;
}

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

export function stringifyExample(
  program: Program,
  value: Example["value"],
  type: Type,
): string {
  return JSON.stringify(serializeSafely(program, value, type), null, 2);
}

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

function formatHttpRequestExampleLine(
  httpOperation: HttpOperation,
  parameterValues?: Record<string, unknown>,
  routePrefix?: string,
): string {
  let path = routePrefix
    ? applyRoutePrefixLocal(httpOperation.uriTemplate, routePrefix)
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

  path = path.replace(/\{\?[^}]+\}/g, "");
  if (queryEntries.length > 0) {
    path = `${path}${path.includes("?") ? "&" : "?"}${queryEntries.join("&")}`;
  }

  return `${httpOperation.verb.toUpperCase()} ${path}`;
}

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

function sampleValueForType(program: Program, type: Type): unknown {
  return jsonValueForType(program, type, new Set<Type>());
}

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

function pickPrimaryResponse(
  responses: HttpOperationResponse[],
): HttpOperationResponse | undefined {
  return (
    responses.find((response) => isSuccessStatusCode(response.statusCodes)) ??
    responses[0]
  );
}

function applyRoutePrefixLocal(
  uriTemplate: string,
  resolvedPrefix: string,
): string {
  if (!resolvedPrefix) return uriTemplate;
  const cleanPrefix = resolvedPrefix.replace(/^\//, "").replace(/\/$/, "");
  if (!cleanPrefix) return uriTemplate;
  const pathPart = uriTemplate.startsWith("/")
    ? uriTemplate
    : `/${uriTemplate}`;
  return `/${cleanPrefix}${pathPart}`;
}
