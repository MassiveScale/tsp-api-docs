import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

const tester = createTester(resolvePath(fileURLToPath(import.meta.url), "../../"), {
  libraries: ["@massivescale/tsp-api-docs"],
}).importLibraries();

const httpTester = createTester(resolvePath(fileURLToPath(import.meta.url), "../../"), {
  libraries: ["@massivescale/tsp-api-docs", "@typespec/http"],
}).importLibraries();

const versionedTester = createTester(resolvePath(fileURLToPath(import.meta.url), "../../"), {
  libraries: ["@massivescale/tsp-api-docs", "@typespec/http", "@typespec/versioning"],
}).importLibraries();

describe("tsp-api-docs emitter", () => {
  it("generates markdown reference pages", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Widget API" })
      namespace Demo;

      @summary("A widget returned by the service.")
      model Widget {
        @summary("Stable identifier")
        id: string;

        @summary("Display name")
        name?: string;
      }

      @summary("Return a widget by id.")
      @doc("Reads a single widget resource.")
      @returnsDoc("The requested widget.")
      op getWidget(@doc("The widget identifier.") id: string): Widget;
    `);

    assert.equal(result.outputs["index.md"], undefined);
    assert.ok(result.outputs["demo/index.md"].includes("## Resources"));
    assert.ok(result.outputs["demo/index.md"].includes("getWidget"));
    assert.ok(result.outputs["demo/operations/demo-get-widget.md"].includes("Return a widget by id."));
    assert.ok(result.outputs["demo/types/demo-widget.md"].includes("Stable identifier"));
    assert.ok(result.outputs["demo/index.html"] === undefined);
    assert.ok(result.outputs["demo/operations/demo-get-widget.html"] === undefined);
  });

  it("emits separate docs for multiple services", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Accounts API" })
      namespace Accounts {
        model User {
          id: string;
        }
        op getUser(id: string): User;
      }

      @service(#{ title: "Orders API" })
      namespace Orders {
        model Order {
          id: string;
        }
        op getOrder(id: string): Order;
      }
    `);

    assert.equal(result.outputs["index.md"], undefined);
    assert.ok(result.outputs["accounts/index.md"].includes("getUser"));
    assert.ok(result.outputs["orders/index.md"].includes("getOrder"));
    assert.ok(result.outputs["accounts/operations/accounts-get-user.md"] !== undefined);
    assert.ok(result.outputs["orders/operations/orders-get-order.md"] !== undefined);
  });

  it("renders the service index when explicitly enabled", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs", { "render-service-index": true }).compile(`
      @service(#{ title: "Widget API" })
      namespace Demo;

      model Widget {
        id: string;
      }

      op getWidget(id: string): Widget;
    `);

    assert.ok(result.outputs["index.md"].includes("[Demo](demo/index.md)"));
  });

  it("renders documentation sets for each service version", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs").compile(`
      import "@typespec/http";
      import "@typespec/versioning";

      using Http;
      using Versioning;

      @versioned(Versions)
      @service(#{ title: "Widget API" })
      namespace Demo;

      enum Versions {
        v1_0: "1.0",
        v1_1: "1.1",
        v2_0: "2.0",
      }

      model Widget {
        id: string;
        @added(Versions.v1_1)
        name: string;
      }

      @added(Versions.v2_0)
      model AnalyzeResult {
        id: string;
      }

      @route("/widgets")
      interface Widgets {
        @get list(): Widget;
        @added(Versions.v1_1)
        @post create(@body body: Widget): Widget;
        @added(Versions.v2_0)
        @route("{id}/analyze")
        @post analyze(@path id: string): AnalyzeResult;
      }
    `);

    assert.ok(result.outputs["1-0/index.md"] !== undefined);
    assert.ok(result.outputs["1-1/index.md"] !== undefined);
    assert.ok(result.outputs["2-0/index.md"] !== undefined);
    assert.ok(result.outputs["1-0/index.md"].includes("list"));
    assert.ok(!result.outputs["1-0/index.md"].includes("create"));
    assert.ok(result.outputs["1-1/index.md"].includes("create"));
    assert.ok(!result.outputs["1-1/index.md"].includes("analyze"));
    assert.ok(result.outputs["2-0/index.md"].includes("analyze"));
    assert.equal(result.outputs["1-0/types/demo-analyze-result.md"], undefined);
    assert.ok(result.outputs["2-0/types/demo-analyze-result.md"] !== undefined);
    assert.ok(result.outputs["2-0/index.md"].includes("Version: `2.0`"));
    assert.ok(result.outputs["2-0/types/demo-widget.md"].includes("Version: `2.0`"));
    assert.ok(result.outputs["2-0/operations/demo-widgets-list.md"].includes("Version: `2.0`"));
  });

  it("renders version selector groups in root index when enabled", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs", { "render-service-index": true }).compile(`
      import "@typespec/http";
      import "@typespec/versioning";

      using Http;
      using Versioning;

      @versioned(Versions)
      @service(#{ title: "Widget API" })
      namespace Demo;

      enum Versions {
        v1_0: "1.0",
        v2_0: "2.0",
      }

      model Widget {
        id: string;
      }

      @route("/widgets")
      interface Widgets {
        @get list(): Widget;
      }
    `);

    assert.ok(result.outputs["index.md"].includes("## Versioned Services"));
    assert.ok(result.outputs["index.md"].includes("### Demo"));
    assert.ok(result.outputs["index.md"].includes("| 1.0 | [Demo 1.0](1-0/index.md) |"));
    assert.ok(result.outputs["index.md"].includes("| 2.0 | [Demo 2.0](2-0/index.md) |"));
  });

  it("includes http request and request-response examples on operation pages", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      import "@typespec/http";

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

    const operationPage = result.outputs["demo/operations/demo-widgets-update.md"];
    assert.ok(operationPage.includes("## HTTP request"));
    assert.ok(operationPage.includes("PATCH /widgets/{id}"));
    assert.ok(operationPage.includes("## Request body"));
    assert.ok(operationPage.includes("## Response"));
    assert.ok(operationPage.includes("## Examples"));
    assert.ok(operationPage.includes("#### Request"));
    assert.ok(operationPage.includes("PATCH /widgets/widget-123"));
    assert.ok(operationPage.includes("Content-Type: application/merge-patch+json"));
    assert.ok(operationPage.includes("#### Response"));
    assert.ok(operationPage.includes("HTTP/1.1 200 OK"));
    assert.ok(operationPage.includes('"id": "widget-123"'));
  });

  it("renders query parameters, request headers, and sample fallback request values", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      import "@typespec/http";

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

    const operationPage = result.outputs["demo/operations/demo-widgets-read.md"];
    assert.ok(operationPage.includes("## Optional query parameters"));
    assert.ok(operationPage.includes("| expand | string | No | No summary provided. |"));
    assert.ok(operationPage.includes("## Request headers"));
    assert.ok(operationPage.includes("| ConsistencyLevel | string | No | No summary provided. |"));
    assert.ok(operationPage.includes("GET /widgets/string?expand=string"));
    assert.ok(operationPage.includes("ConsistencyLevel: string"));
  });

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

    const widgetListPage = result.outputs["demo/types/demo-widget-list.md"];
    assert.ok(widgetListPage.includes("## Methods"));
    assert.ok(widgetListPage.includes("| [list](../operations/demo-widgets-list.md) |"));
    assert.ok(widgetListPage.includes("## Properties"));
    assert.ok(widgetListPage.includes("| items | Demo.Widget[] | Yes | No summary provided. |"));
    assert.ok(!widgetListPage.includes("## Relationships"));
    assert.ok(!widgetListPage.includes("### items"));
    assert.ok(!widgetListPage.includes("| [read](operations/demo-widgets-read.md) |"));
    assert.ok(!widgetListPage.includes("| [create](operations/demo-widgets-create.md) |"));
  });
});
