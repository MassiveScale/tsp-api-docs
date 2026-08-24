/**
 * Tests for src/operation-page.ts — HTTP request/response rendering,
 * query parameters, request headers, examples, and the route-prefix option.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

const httpTester = createTester(
  resolvePath(fileURLToPath(import.meta.url), "../../"),
  {
    libraries: ["@massivescale/tsp-api-docs", "@typespec/http"],
  },
).importLibraries();

const versionedTester = createTester(
  resolvePath(fileURLToPath(import.meta.url), "../../"),
  {
    libraries: [
      "@massivescale/tsp-api-docs",
      "@typespec/http",
      "@typespec/versioning",
    ],
  },
).importLibraries();

describe("operation page", () => {
  it("includes http request and request-response examples on operation pages", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Widget API" })
      namespace Demo;

      model Widget {
        id: string;
        color: "red" | "blue";
      }

      @route("/widgets")
      interface Widgets {
        @opExample(
          #{
            parameters: #{ id: "widget-123", body: #{ color: "blue" } },
            returnType: #{ id: "widget-123", color: "blue" }
          },
          #{ title: "Update widget example" }
        )
        @patch update(@path id: string, @body body: MergePatchUpdate<Widget>): Widget;
      }
    `);

    const operationPage = result.outputs["widget-api/api/Widgets-Update.md"];
    assert.ok(operationPage.includes("# Widgets Update"));
    assert.ok(operationPage.includes("## HTTP request"));
    assert.ok(operationPage.includes("PATCH /api/widgets/{id}"));
    assert.ok(operationPage.includes("## Request body"));
    assert.ok(operationPage.includes("## Response"));
    assert.ok(operationPage.includes("## Examples"));
    assert.ok(operationPage.includes("#### Request"));
    assert.ok(operationPage.includes("PATCH /api/widgets/widget-123"));
    assert.ok(
      operationPage.includes("Content-Type: application/merge-patch+json"),
    );
    assert.ok(operationPage.includes("#### Response"));
    assert.ok(operationPage.includes("HTTP/1.1 200 OK"));
    assert.ok(operationPage.includes('"id": "widget-123"'));
  });

  it("renders query parameters, request headers, and sample fallback request values", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Widget API" })
      namespace Demo;

      model Widget {
        id: string;
      }

      @route("/widgets")
      interface Widgets {
        @get read(
          @path id: string,
          @query expand?: string,
          @header("ConsistencyLevel") consistencyLevel?: string,
        ): Widget;
      }
    `);

    const operationPage = result.outputs["widget-api/api/Widgets-Read.md"];
    assert.ok(operationPage.includes("## Optional query parameters"));
    assert.ok(
      operationPage.includes(
        "| expand | string | No       | No summary provided. |",
      ),
    );
    assert.ok(operationPage.includes("## Request headers"));
    assert.ok(
      operationPage.includes(
        "| ConsistencyLevel | string | No       | No summary provided. |",
      ),
    );
    assert.ok(operationPage.includes("GET /api/widgets/string?expand=string"));
    assert.ok(operationPage.includes("ConsistencyLevel: string"));
    // Regression test: "## Response headers" must render regardless of
    // whether the operation has an @errorsDoc — it was previously nested
    // inside the {{#if errorsDoc}} block and never rendered for any operation.
    assert.ok(operationPage.includes("## Response headers"));
    assert.ok(
      operationPage.includes(
        "This method does not return custom response headers.",
      ),
    );
    assert.ok(!operationPage.includes("## Errors"));
  });

  it("renders @errorsDoc content under an Errors heading", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Widget API" })
      namespace Demo;

      model Widget {
        id: string;
      }

      @error
      model WidgetError {
        code: string;
      }

      @route("/widgets")
      interface Widgets {
        @doc("Reads a single widget resource.")
        @errorsDoc("Returns a 404 WidgetError when the widget does not exist.")
        @get read(@path id: string): Widget | WidgetError;
      }
    `);

    const operationPage = result.outputs["widget-api/api/Widgets-Read.md"];
    assert.ok(operationPage.includes("## Errors"));
    assert.ok(
      operationPage.includes(
        "Returns a 404 WidgetError when the widget does not exist.",
      ),
    );
    // Response headers should still render alongside the Errors section.
    assert.ok(operationPage.includes("## Response headers"));
  });

  it("omits the Errors section when no @errorsDoc is present", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Widget API" })
      namespace Demo;

      model Widget {
        id: string;
      }

      @route("/widgets")
      interface Widgets {
        @get read(@path id: string): Widget;
      }
    `);

    const operationPage = result.outputs["widget-api/api/Widgets-Read.md"];
    assert.ok(!operationPage.includes("## Errors"));
    assert.ok(operationPage.includes("## Response headers"));
  });

  describe("route-prefix option", () => {
    const routeSource = `
      using Http;

      @service(#{ title: "Widget API" })
      namespace Demo;

      model Widget { id: string; }

      @route("/widgets")
      interface Widgets {
        @get read(@path id: string): Widget;
      }
    `;

    it("applies the default api/{version} prefix to non-versioned services (resolves to /api)", async () => {
      const result = await httpTester
        .emit("@massivescale/tsp-api-docs")
        .compile(routeSource);

      const page = result.outputs["widget-api/api/Widgets-Read.md"];
      assert.ok(
        page.includes("GET /api/widgets/{id}"),
        "HTTP request should include resolved prefix",
      );
      assert.ok(
        page.includes("GET /api/widgets/string"),
        "example request should include resolved prefix",
      );
    });

    it("substitutes {version} token with the version value for versioned services", async () => {
      const result = await versionedTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using Http;
        using Versioning;

        @versioned(Versions)
        @service(#{ title: "Widget API" })
        namespace Demo;

        enum Versions { v1_0: "1.0" }

        model Widget { id: string; }

        @route("/widgets")
        interface Widgets {
          @get read(@path id: string): Widget;
        }
      `);

      const page = result.outputs["1-0/api/Widgets-Read.md"];
      assert.ok(
        page.includes("GET /api/1.0/widgets/{id}"),
        "HTTP request should substitute version in prefix",
      );
      assert.ok(
        page.includes("GET /api/1.0/widgets/string"),
        "example request should substitute version in prefix",
      );
    });

    it("uses a custom route-prefix value", async () => {
      const result = await httpTester
        .emit("@massivescale/tsp-api-docs", { "route-prefix": "v2/rest" })
        .compile(routeSource);

      const page = result.outputs["widget-api/api/Widgets-Read.md"];
      assert.ok(
        page.includes("GET /v2/rest/widgets/{id}"),
        "HTTP request should use custom prefix",
      );
    });

    it("uses a custom route-prefix with {version} token for versioned services", async () => {
      const result = await versionedTester.emit("@massivescale/tsp-api-docs", {
        "route-prefix": "v{version}/api",
      }).compile(`
        using Http;
        using Versioning;

        @versioned(Versions)
        @service(#{ title: "Widget API" })
        namespace Demo;

        enum Versions { v2_0: "2.0" }

        model Widget { id: string; }

        @route("/widgets")
        interface Widgets {
          @get read(@path id: string): Widget;
        }
      `);

      const page = result.outputs["2-0/api/Widgets-Read.md"];
      assert.ok(
        page.includes("GET /v2.0/api/widgets/{id}"),
        "HTTP request should use custom prefix with version substituted",
      );
    });

    it("emits no prefix when route-prefix is set to empty string", async () => {
      const result = await httpTester
        .emit("@massivescale/tsp-api-docs", { "route-prefix": "" })
        .compile(routeSource);

      const page = result.outputs["widget-api/api/Widgets-Read.md"];
      assert.ok(
        page.includes("GET /widgets/{id}"),
        "HTTP request should have no prefix when route-prefix is empty",
      );
    });
  });

  describe("@externalDocs", () => {
    const openApiTester = createTester(
      resolvePath(fileURLToPath(import.meta.url), "../../"),
      {
        libraries: [
          "@massivescale/tsp-api-docs",
          "@typespec/http",
          "@typespec/openapi",
        ],
      },
    ).importLibraries();

    it("renders a Markdown link using the description as link text", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using Http;
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget { id: string; }

        @route("/widgets")
        interface Widgets {
          @externalDocs("https://example.com/docs", "Full reference")
          @get read(@path id: string): Widget;
        }
      `);

      const page = result.outputs["widget-api/api/Widgets-Read.md"];
      assert.ok(page.includes("## External documentation"));
      assert.ok(page.includes("[Full reference](https://example.com/docs)"));
    });

    it("falls back to the bare URL as link text when no description is given", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using Http;
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget { id: string; }

        @route("/widgets")
        interface Widgets {
          @externalDocs("https://example.com/docs")
          @get read(@path id: string): Widget;
        }
      `);

      const page = result.outputs["widget-api/api/Widgets-Read.md"];
      assert.ok(page.includes("## External documentation"));
      assert.ok(
        page.includes("[https://example.com/docs](https://example.com/docs)"),
      );
    });

    it("omits the External documentation section when @externalDocs is absent", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using Http;
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget { id: string; }

        @route("/widgets")
        interface Widgets {
          @get read(@path id: string): Widget;
        }
      `);

      const page = result.outputs["widget-api/api/Widgets-Read.md"];
      assert.ok(!page.includes("## External documentation"));
    });
  });
});
