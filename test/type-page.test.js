/**
 * Tests for src/type-page.ts — type page content including properties,
 * relationship detection, and related-methods linking.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

const tester = createTester(
  resolvePath(fileURLToPath(import.meta.url), "../../"),
  {
    libraries: ["@massivescale/tsp-api-docs"],
  },
).importLibraries();

describe("type page", () => {
  it("keeps relationship-shaped model properties in properties and omits relationship sections", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Relationship API" })
      namespace Demo;

      model Widget {
        id: string;
      }

      model WidgetList {
        items: Widget[];
      }

      interface Widgets {
        op list(): WidgetList;
        op read(id: string): Widget;
        op create(body: Widget): Widget;
      }
    `);

    const widgetListPage =
      result.outputs["relationship-api/resources/WidgetList.md"];
    assert.ok(widgetListPage.includes("## Methods"));
    assert.ok(widgetListPage.includes("| [list](../api/Widgets-List.md) |"));
    assert.ok(widgetListPage.includes("## Properties"));
    assert.ok(
      widgetListPage.includes(
        "| items | [Widget](Widget.md)[] | Yes      | No summary provided. |",
      ),
    );
    assert.ok(!widgetListPage.includes("## Relationships"));
    assert.ok(!widgetListPage.includes("### items"));
    assert.ok(!widgetListPage.includes("| [read](api/Widgets-Read.md) |"));
    assert.ok(!widgetListPage.includes("| [create](api/Widgets-Create.md) |"));

    // Widget.md must only show operations that directly address Widget —
    // list() returns WidgetList (not Widget), so it must not appear here.
    const widgetPage = result.outputs["relationship-api/resources/Widget.md"];
    assert.ok(widgetPage.includes("[read](../api/Widgets-Read.md)"));
    assert.ok(widgetPage.includes("[create](../api/Widgets-Create.md)"));
    assert.ok(!widgetPage.includes("[list](../api/Widgets-List.md)"));
  });

  it("shows related methods for operations that accept the type through a wrapper parameter model", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Wrapper Body API" })
      namespace Demo;

      model Widget {
        id: string;
      }

      model CreateWidgetRequest {
        widget: Widget;
      }

      interface Widgets {
        op create(body: CreateWidgetRequest): Widget;
        op read(id: string): Widget;
      }
    `);

    const widgetPage = result.outputs["wrapper-body-api/resources/Widget.md"];
    // read() directly returns Widget — must appear.
    assert.ok(widgetPage.includes("[read](../api/Widgets-Read.md)"));
    // create() accepts Widget inside a wrapper model — must also appear.
    assert.ok(widgetPage.includes("[create](../api/Widgets-Create.md)"));
  });

  it("does not show related methods on @error-decorated types", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Error Test API" })
      namespace Demo;

      model Widget {
        id: string;
      }

      @error
      model ErrorResponse {
        code: string;
        message: string;
      }

      interface Widgets {
        op read(id: string): Widget | ErrorResponse;
        op create(body: Widget): Widget | ErrorResponse;
      }
    `);

    // Widget.md should have read and create — they directly address Widget.
    const widgetPage = result.outputs["error-test-api/resources/Widget.md"];
    assert.ok(widgetPage.includes("[read](../api/Widgets-Read.md)"));
    assert.ok(widgetPage.includes("[create](../api/Widgets-Create.md)"));

    // ErrorResponse.md must have no Methods section at all —
    // @error types are cross-cutting envelopes, not addressable entities.
    const errorPage =
      result.outputs["error-test-api/resources/ErrorResponse.md"];
    assert.ok(!errorPage.includes("## Methods"));
  });

  it("renders a plain boolean property as a native boolean in the example JSON", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Encode API" })
      namespace Demo;

      model Widget {
        id: string;
        active: boolean;
      }

      interface Widgets {
        op read(id: string): Widget;
      }
    `);

    const widgetPage = result.outputs["encode-api/resources/Widget.md"];
    assert.ok(widgetPage.includes('"active": true'));
  });

  it("renders an @encode(string) boolean property as a wire-level string in the example JSON", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Encode API" })
      namespace Demo;

      model Widget {
        id: string;
        @encode(string)
        active: boolean;
      }

      interface Widgets {
        op read(id: string): Widget;
      }
    `);

    const widgetPage = result.outputs["encode-api/resources/Widget.md"];
    assert.ok(widgetPage.includes('"active": "true"'));
  });

  describe("@externalDocs", () => {
    const openApiTester = createTester(
      resolvePath(fileURLToPath(import.meta.url), "../../"),
      {
        libraries: ["@massivescale/tsp-api-docs", "@typespec/openapi"],
      },
    ).importLibraries();

    it("renders a Markdown link using the description as link text on a Model", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        @externalDocs("https://example.com/docs", "Full reference")
        model Widget {
          id: string;
        }

        interface Widgets {
          op read(id: string): Widget;
        }
      `);

      const widgetPage = result.outputs["widget-api/resources/Widget.md"];
      assert.ok(widgetPage.includes("## External documentation"));
      assert.ok(
        widgetPage.includes("[Full reference](https://example.com/docs)"),
      );
    });

    it("falls back to the bare URL as link text on a Model when no description is given", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        @externalDocs("https://example.com/docs")
        model Widget {
          id: string;
        }

        interface Widgets {
          op read(id: string): Widget;
        }
      `);

      const widgetPage = result.outputs["widget-api/resources/Widget.md"];
      assert.ok(widgetPage.includes("## External documentation"));
      assert.ok(
        widgetPage.includes(
          "[https://example.com/docs](https://example.com/docs)",
        ),
      );
    });

    it("omits the External documentation section on a Model when @externalDocs is absent", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget {
          id: string;
        }

        interface Widgets {
          op read(id: string): Widget;
        }
      `);

      const widgetPage = result.outputs["widget-api/resources/Widget.md"];
      assert.ok(!widgetPage.includes("## External documentation"));
    });

    it("renders @externalDocs on a Union", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        @externalDocs("https://example.com/docs/color", "Color reference")
        union Color {
          "red",
          "blue",
        }

        model Widget {
          id: string;
          color: Color;
        }

        interface Widgets {
          op read(id: string): Widget;
        }
      `);

      const colorPage = result.outputs["widget-api/resources/Color.md"];
      assert.ok(colorPage.includes("## External documentation"));
      assert.ok(
        colorPage.includes("[Color reference](https://example.com/docs/color)"),
      );
    });

    it("renders @externalDocs on an Enum", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        @externalDocs("https://example.com/docs/status", "Status reference")
        enum Status {
          Active,
          Inactive,
        }

        model Widget {
          id: string;
          status: Status;
        }

        interface Widgets {
          op read(id: string): Widget;
        }
      `);

      const statusPage = result.outputs["widget-api/resources/Status.md"];
      assert.ok(statusPage.includes("## External documentation"));
      assert.ok(
        statusPage.includes(
          "[Status reference](https://example.com/docs/status)",
        ),
      );
    });

    it("renders @externalDocs on a Scalar", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        @externalDocs("https://example.com/docs/widgetid", "WidgetId reference")
        scalar WidgetId extends string;

        model Widget {
          id: WidgetId;
        }

        interface Widgets {
          op read(id: string): Widget;
        }
      `);

      const widgetIdPage = result.outputs["widget-api/resources/WidgetId.md"];
      assert.ok(widgetIdPage.includes("## External documentation"));
      assert.ok(
        widgetIdPage.includes(
          "[WidgetId reference](https://example.com/docs/widgetid)",
        ),
      );
    });

    it("escapes Markdown-significant characters in the description and URL", async () => {
      const result = await openApiTester.emit("@massivescale/tsp-api-docs")
        .compile(`
        using OpenAPI;

        @service(#{ title: "Widget API" })
        namespace Demo;

        @externalDocs("https://example.com/docs(v2)", "Reference [full]")
        model Widget {
          id: string;
        }

        interface Widgets {
          op read(id: string): Widget;
        }
      `);

      const widgetPage = result.outputs["widget-api/resources/Widget.md"];
      assert.ok(widgetPage.includes("## External documentation"));
      assert.ok(
        widgetPage.includes(
          "[Reference \\[full\\]](https://example.com/docs\\(v2\\))",
        ),
      );
    });
  });
});
