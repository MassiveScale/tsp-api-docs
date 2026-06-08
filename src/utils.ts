import {
  getDoc,
  getNamespaceFullName,
  getSummary,
  isGlobalNamespace,
  type Enum,
  type Model,
  type Namespace,
  type Operation,
  type Program,
  type Scalar,
  type Type,
  type Union,
} from "@typespec/compiler";
import { type HttpStatusCodeRange } from "@typespec/http";
import { CliPrettify } from "markdown-table-prettify";

export const FALLBACK_SUMMARY = "No summary provided.";

export function prettifyMarkdown(content: string): string {
  return CliPrettify.prettify(content);
}

export function slugify(value: string): string {
  const slug = value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug || "index";
}

export function operationFileName(operation: Operation): string {
  const segments: string[] = [];
  if (operation.interface?.name) {
    segments.push(operation.interface.name);
  }
  segments.push(operation.name);
  return toTitleCaseFileName(segments.join(" "));
}

export function toTitleCaseFileName(value: string): string {
  const words = splitIdentifierWords(value);
  if (words.length === 0) {
    return "Index";
  }

  return words.map((word) => capitalizeWord(word)).join("-");
}

export function toTitleCaseLabel(value: string): string {
  const words = splitIdentifierWords(value);
  if (words.length === 0) {
    return value;
  }

  return words.map((word) => capitalizeWord(word)).join(" ");
}

export function capitalizeWord(word: string): string {
  if (word.length === 0) {
    return word;
  }

  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

export function splitIdentifierWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

export function escapeMarkdownCell(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\|/gu, "\\|")
    .replace(/[\r\n]+/gu, " ")
    .trim();
}

export function describeSummary(program: Program, type: Type): string {
  return getSummary(program, type) ?? getDoc(program, type) ?? FALLBACK_SUMMARY;
}

export function namespaceName(program: Program, namespace: Namespace): string {
  if (isGlobalNamespace(program, namespace)) {
    return "Global";
  }

  return getNamespaceFullName(namespace) || namespace.name || "Global";
}

export function describeNamespace(
  _program: Program,
  _namespace: Namespace,
  fallback: string,
): string {
  return fallback;
}

export function containerLabel(program: Program, operation: Operation): string {
  if (operation.interface) {
    return operation.interface.name;
  }

  if (operation.namespace && !isGlobalNamespace(program, operation.namespace)) {
    return "Service";
  }

  return "Service";
}

export function breadcrumbsForOperation(
  _program: Program,
  operation: Operation,
): string[] {
  const crumbs = ["API"];

  if (operation.interface) {
    crumbs.push(operation.interface.name);
  }

  crumbs.push(operation.name);
  return crumbs;
}

export function breadcrumbsForType(
  _program: Program,
  type: Model | Enum | Union | Scalar,
): string[] {
  const crumbs = ["API"];

  if (type.kind === "Union" && !type.name) {
    crumbs.push("union");
  } else if ("name" in type && type.name) {
    crumbs.push(type.name);
  }

  return crumbs;
}

export function formatStatusCode(
  statusCode: number | "*" | HttpStatusCodeRange,
): string {
  if (typeof statusCode === "number") {
    const label = statusText(statusCode);
    return label ? `${statusCode} ${label}` : `${statusCode}`;
  }

  if (statusCode === "*") {
    return "default";
  }

  return `${statusCode.start}-${statusCode.end}`;
}

export function statusText(statusCode: number): string {
  switch (statusCode) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 202:
      return "Accepted";
    case 204:
      return "No Content";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 500:
      return "Internal Server Error";
    default:
      return "";
  }
}

export function isSuccessStatusCode(
  statusCode: number | "*" | HttpStatusCodeRange,
): boolean {
  if (typeof statusCode === "number") {
    return statusCode >= 200 && statusCode < 300;
  }

  if (statusCode === "*") {
    return false;
  }

  return statusCode.start >= 200 && statusCode.end < 300;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Prefixes an HTTP URI template with a resolved route prefix, normalizing slashes. */
export function applyRoutePrefix(
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
