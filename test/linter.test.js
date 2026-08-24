/**
 * Tests for src/rules/missing-errors-doc.ts — the `tsp-api-docs/missing-errors-doc`
 * linter rule, which flags an operation that can return an error response
 * (>=400 status code, or an `@error`-decorated response body) but has no
 * `@errorsDoc` doc-comment tag.
 */
import { describe, it } from "node:test";
import { resolvePath } from "@typespec/compiler";
import {
  createTester,
  createLinterRuleTester,
} from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
import { missingErrorsDocRule } from "../dist/src/rules/missing-errors-doc.js";

const tester = createTester(
  resolvePath(fileURLToPath(import.meta.url), "../../"),
  {
    libraries: ["@massivescale/tsp-api-docs", "@typespec/http"],
  },
);

describe("missing-errors-doc", () => {
  it("flags an operation with a numeric error status code and no @errorsDoc", async () => {
    const runner = await tester.createInstance();
    const ruleTester = createLinterRuleTester(
      runner,
      missingErrorsDocRule,
      "tsp-api-docs",
    );
    await ruleTester
      .expect(
        `
      import "@typespec/http";
      using Http;

      @route("/widgets/{id}")
      op getWidget(@path id: string): {
        @statusCode statusCode: 404;
      };
    `,
      )
      .toEmitDiagnostics({ code: "tsp-api-docs/missing-errors-doc" });
  });

  it("flags an operation with an @error-decorated response body and no @errorsDoc", async () => {
    const runner = await tester.createInstance();
    const ruleTester = createLinterRuleTester(
      runner,
      missingErrorsDocRule,
      "tsp-api-docs",
    );
    await ruleTester
      .expect(
        `
      import "@typespec/http";
      using Http;

      @error
      model NotFoundError {
        code: "not-found";
      }

      @route("/widgets/{id}")
      op getWidget(@path id: string): { @statusCode statusCode: 200; } | NotFoundError;
    `,
      )
      .toEmitDiagnostics({ code: "tsp-api-docs/missing-errors-doc" });
  });

  it("flags an operation with a status-code range that overlaps but does not start in the error range", async () => {
    const runner = await tester.createInstance();
    const ruleTester = createLinterRuleTester(
      runner,
      missingErrorsDocRule,
      "tsp-api-docs",
    );
    await ruleTester
      .expect(
        `
      import "@typespec/http";
      using Http;

      @route("/widgets/{id}")
      op getWidget(@path id: string): {
        @minValue(300)
        @maxValue(499)
        @statusCode statusCode: int32;
      };
    `,
      )
      .toEmitDiagnostics({ code: "tsp-api-docs/missing-errors-doc" });
  });

  it("is valid when @errorsDoc is present on an operation with an error response", async () => {
    const runner = await tester.createInstance();
    const ruleTester = createLinterRuleTester(
      runner,
      missingErrorsDocRule,
      "tsp-api-docs",
    );
    await ruleTester
      .expect(
        `
      import "@typespec/http";
      using Http;

      @error
      model NotFoundError {
        code: "not-found";
      }

      @route("/widgets/{id}")
      @errorsDoc("Returns a 404 NotFoundError when the widget does not exist.")
      op getWidget(@path id: string): { @statusCode statusCode: 200; } | NotFoundError;
    `,
      )
      .toBeValid();
  });

  it("is valid when the operation has no error response at all", async () => {
    const runner = await tester.createInstance();
    const ruleTester = createLinterRuleTester(
      runner,
      missingErrorsDocRule,
      "tsp-api-docs",
    );
    await ruleTester
      .expect(
        `
      import "@typespec/http";
      using Http;

      model Widget {
        id: string;
      }

      @route("/widgets/{id}")
      op getWidget(@path id: string): Widget;
    `,
      )
      .toBeValid();
  });

  it("is valid for a non-HTTP operation", async () => {
    const runner = await tester.createInstance();
    const ruleTester = createLinterRuleTester(
      runner,
      missingErrorsDocRule,
      "tsp-api-docs",
    );
    await ruleTester
      .expect(
        `
      op getWidget(id: string): string;
    `,
      )
      .toBeValid();
  });
});
