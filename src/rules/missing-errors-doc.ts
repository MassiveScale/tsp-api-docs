/**
 * @module rules/missing-errors-doc
 *
 * Linter rule that flags an HTTP operation which can return an error
 * response (a >=400 status code, or a response body typed with `@error`)
 * but has no `@errorsDoc` doc-comment tag describing that failure mode.
 */

import {
  createRule,
  getErrorsDoc,
  getTypeName,
  isErrorModel,
  paramMessage,
  type Operation,
  type Program,
} from "@typespec/compiler";
import type { HttpOperationResponse } from "@typespec/http";
import { resolveHttpOperation } from "../operation-page.js";
import { formatStatusCode } from "../utils.js";

/**
 * Returns `true` when a response's status code is numeric and `>= 400`, or a
 * status-code range that overlaps the error range (i.e. its end is `>= 400`).
 *
 * @param response - A single HTTP response variant of an operation.
 */
function hasErrorStatusCode(response: HttpOperationResponse): boolean {
  const statusCodes = response.statusCodes;
  if (typeof statusCodes === "number") {
    return statusCodes >= 400;
  }
  if (statusCodes === "*") {
    return false;
  }
  return statusCodes.end >= 400;
}

/**
 * Returns `true` when any response body on this response variant is typed
 * with `@error`.
 *
 * @param program - The TypeSpec program.
 * @param response - A single HTTP response variant of an operation.
 */
function hasErrorModelBody(
  program: Program,
  response: HttpOperationResponse,
): boolean {
  return response.responses.some(
    (content) => content.body && isErrorModel(program, content.body.type),
  );
}

/**
 * Flags an operation that can return an error response (by status code or by
 * an `@error`-decorated body type) but has no `@errorsDoc` doc-comment tag.
 * Reports at most one diagnostic per operation, even when multiple error
 * response variants are missing documentation.
 */
export const missingErrorsDocRule = createRule({
  name: "missing-errors-doc",
  severity: "warning",
  description:
    "Checks that an operation which can return an error response documents that failure mode with an @errorsDoc doc-comment tag.",
  messages: {
    default: paramMessage`Operation "${"operationLabel"}" can return an error response (${"statusCode"} ${"typeName"}) but has no @errorsDoc documentation. Add an @errorsDoc("...") doc-comment tag describing this failure mode.`,
  },
  create(context) {
    return {
      operation: (operation: Operation) => {
        const httpOperation = resolveHttpOperation(context.program, operation);
        if (!httpOperation) {
          return;
        }

        const errorResponse = httpOperation.responses.find(
          (response) =>
            hasErrorStatusCode(response) ||
            hasErrorModelBody(context.program, response),
        );
        if (!errorResponse) {
          return;
        }

        const errorsDoc = getErrorsDoc(context.program, operation);
        if (errorsDoc && errorsDoc.trim().length > 0) {
          return;
        }

        const operationLabel = operation.interface?.name
          ? `${operation.interface.name} ${operation.name}`
          : operation.name;

        context.reportDiagnostic({
          target: operation,
          format: {
            operationLabel,
            statusCode: formatStatusCode(errorResponse.statusCodes),
            typeName: getTypeName(errorResponse.type),
          },
        });
      },
    };
  },
});
