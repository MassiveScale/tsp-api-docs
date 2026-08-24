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
import { getExternalDocs } from "@typespec/openapi";
import { CliPrettify } from "markdown-table-prettify";

/**
 * Placeholder summary used when a type has neither `@summary` nor `@doc`
 * in the TypeSpec source.
 */
export const FALLBACK_SUMMARY = "No summary provided.";

/**
 * Formats a Markdown string so that all tables are column-aligned.
 * Delegates to `markdown-table-prettify` for the actual alignment work.
 *
 * @param content - Raw Markdown text that may contain pipe-delimited tables.
 * @returns The prettified Markdown with aligned table columns.
 */
export function prettifyMarkdown(content: string): string {
  return CliPrettify.prettify(content);
}

/**
 * Converts a human-readable label into a URL-safe slug.
 *
 * Steps applied in order:
 * 1. Insert a hyphen between each camelCase boundary (`fooBar` → `foo-Bar`).
 * 2. Replace runs of non-alphanumeric characters with a single hyphen.
 * 3. Strip leading and trailing hyphens.
 * 4. Lowercase the result.
 *
 * Returns `"index"` when the resulting slug would be empty.
 *
 * @param value - The raw string to slugify (e.g. a service name or version).
 * @returns A lowercase, hyphen-separated slug.
 */
export function slugify(value: string): string {
  const slug = value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug || "index";
}

/**
 * Builds the file name (without extension) for an operation's documentation page.
 *
 * The name is formed from the interface name (if any) followed by the operation
 * name, converted to title-case with hyphens (e.g. `Widgets create` → `Widgets-Create`).
 *
 * @param operation - The TypeSpec operation to name.
 * @returns A title-case, hyphenated file name suitable for use as a `.md` stem.
 */
export function operationFileName(operation: Operation): string {
  const segments: string[] = [];
  if (operation.interface?.name) {
    segments.push(operation.interface.name);
  }
  segments.push(operation.name);
  return toTitleCaseFileName(segments.join(" "));
}

/**
 * Converts a string (identifier or phrase) into a title-case, hyphen-separated
 * file name, e.g. `"createWidget"` → `"Create-Widget"`.
 *
 * Returns `"Index"` when the input is empty or produces no words.
 *
 * @param value - The string to convert.
 */
export function toTitleCaseFileName(value: string): string {
  const words = splitIdentifierWords(value);
  if (words.length === 0) {
    return "Index";
  }

  return words.map((word) => capitalizeWord(word)).join("-");
}

/**
 * Converts a string (identifier or phrase) into a title-case, space-separated
 * human-readable label, e.g. `"createWidget"` → `"Create Widget"`.
 *
 * Returns the original value unchanged when it produces no words.
 *
 * @param value - The string to convert.
 */
export function toTitleCaseLabel(value: string): string {
  const words = splitIdentifierWords(value);
  if (words.length === 0) {
    return value;
  }

  return words.map((word) => capitalizeWord(word)).join(" ");
}

/**
 * Capitalizes the first character of `word` and lowercases the rest.
 *
 * @param word - A single word (may be empty).
 * @returns The capitalized word, or the original string if it was empty.
 */
export function capitalizeWord(word: string): string {
  if (word.length === 0) {
    return word;
  }

  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

/**
 * Splits a camelCase, PascalCase, or space/punctuation-separated identifier
 * into individual words.
 *
 * Examples:
 * - `"createWidget"` → `["create", "Widget"]`
 * - `"my-api"` → `["my", "api"]`
 * - `"Widgets List"` → `["Widgets", "List"]`
 *
 * @param value - The identifier or phrase to split.
 * @returns An array of non-empty word strings.
 */
export function splitIdentifierWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

/**
 * Escapes characters that would break a Markdown table cell:
 * backslashes, pipe characters, and newlines.
 *
 * @param value - The raw cell text.
 * @returns A single-line string safe to embed inside a `|`-delimited table.
 */
export function escapeMarkdownCell(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\|/gu, "\\|")
    .replace(/[\r\n]+/gu, " ")
    .trim();
}

/**
 * Renders `@externalDocs` on `entity` as a single Markdown link, or `undefined`
 * if the decorator isn't present. Uses the description as the link text when
 * given, falling back to the bare URL otherwise.
 *
 * @param program - The TypeSpec program.
 * @param entity - The type or namespace to inspect for `@externalDocs`.
 * @returns A Markdown link string, or `undefined` if the decorator is absent.
 */
export function formatExternalDocsLink(
  program: Program,
  entity: Type,
): string | undefined {
  const externalDocs = getExternalDocs(program, entity);
  if (!externalDocs) return undefined;
  const label = externalDocs.description ?? externalDocs.url;
  return `[${label}](${externalDocs.url})`;
}

/**
 * Returns the best available description for a TypeSpec type.
 *
 * Prefers `@summary`, then falls back to `@doc`, then to {@link FALLBACK_SUMMARY}.
 *
 * @param program - The TypeSpec program.
 * @param type - The type to describe.
 * @returns A non-empty description string — never `undefined`.
 */
export function describeSummary(program: Program, type: Type): string {
  return getSummary(program, type) ?? getDoc(program, type) ?? FALLBACK_SUMMARY;
}

/**
 * Returns the display name of a namespace.
 *
 * Returns `"Global"` for the global namespace. Otherwise returns the
 * fully-qualified namespace name (e.g. `"Contoso.Pets"`) or, as a last resort,
 * the bare `namespace.name`.
 *
 * @param program - The TypeSpec program.
 * @param namespace - The namespace to name.
 */
export function namespaceName(program: Program, namespace: Namespace): string {
  if (isGlobalNamespace(program, namespace)) {
    return "Global";
  }

  return getNamespaceFullName(namespace) || namespace.name || "Global";
}

/**
 * Returns a human-readable description for a namespace, falling back to
 * `fallback` when no `@doc`/`@summary` is available.
 *
 * Currently always returns `fallback` — the TypeSpec compiler does not expose
 * a stable doc-comment API for namespaces on the version this emitter targets.
 *
 * @param _program - Unused; reserved for future use.
 * @param _namespace - Unused; reserved for future use.
 * @param fallback - The string to return.
 */
export function describeNamespace(
  _program: Program,
  _namespace: Namespace,
  fallback: string,
): string {
  return fallback;
}

/**
 * Returns the display label for the container of an operation.
 *
 * - If the operation belongs to an interface, returns the interface name.
 * - Otherwise returns `"Service"` (covers namespace-level and global operations).
 *
 * @param program - The TypeSpec program.
 * @param operation - The operation whose container to label.
 */
export function containerLabel(program: Program, operation: Operation): string {
  if (operation.interface) {
    return operation.interface.name;
  }

  if (operation.namespace && !isGlobalNamespace(program, operation.namespace)) {
    return "Service";
  }

  return "Service";
}

/**
 * Builds the breadcrumb trail for an operation documentation page.
 *
 * Returns an array of labels starting with `"API"`, optionally including the
 * interface name, followed by the operation name.
 *
 * @param _program - Unused; reserved for future use.
 * @param operation - The operation to build breadcrumbs for.
 * @returns An ordered array of breadcrumb labels.
 */
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

/**
 * Builds the breadcrumb trail for a type documentation page.
 *
 * Returns an array of labels starting with `"API"`, followed by the type name
 * (or `"union"` for anonymous unions).
 *
 * @param _program - Unused; reserved for future use.
 * @param type - The type to build breadcrumbs for.
 * @returns An ordered array of breadcrumb labels.
 */
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

/**
 * Formats an HTTP status code value as a human-readable string.
 *
 * - Numbers: `200` → `"200 OK"`, `999` → `"999"` (no label for unknown codes).
 * - Wildcard: `"*"` → `"default"`.
 * - Range: `{ start: 200, end: 299 }` → `"200-299"`.
 *
 * @param statusCode - The status code, wildcard, or range to format.
 */
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

/**
 * Returns the standard reason phrase for a well-known HTTP status code,
 * or an empty string for unknown codes.
 *
 * @param statusCode - A numeric HTTP status code.
 */
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

/**
 * Returns `true` when a status code represents a successful (2xx) response.
 *
 * - A wildcard `"*"` is never considered a success code.
 * - A range is considered successful only if the entire range is within 2xx.
 *
 * @param statusCode - The status code, wildcard, or range to test.
 */
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

/**
 * Narrows `value` to a plain object (`Record<string, unknown>`), returning
 * `undefined` for `null`, arrays, and primitive values.
 *
 * Used to safely extract key-value pairs from deserialized JSON without
 * accidentally treating arrays or primitives as property bags.
 *
 * @param value - Any unknown runtime value.
 */
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
