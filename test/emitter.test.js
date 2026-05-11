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

const widgetSource = `
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
`;

describe("tsp-api-docs emitter", () => {
  describe("azure-devops format (default)", () => {
    it("generates markdown reference pages with folder-named index files", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs").compile(widgetSource);

      assert.equal(result.outputs["index.md"], undefined);
      assert.ok(result.outputs["widget-api/widget-api.md"].includes("## Resources"));
      assert.ok(result.outputs["widget-api/widget-api.md"].includes("getWidget"));
      assert.ok(result.outputs["widget-api/api/Get-Widget.md"].includes("# Get Widget"));
      assert.ok(result.outputs["widget-api/api/Get-Widget.md"].includes("Return a widget by id."));
      assert.ok(result.outputs["widget-api/resources/Widget.md"].includes("Stable identifier"));
      assert.equal(result.outputs["widget-api/index.html"], undefined);
      assert.equal(result.outputs["widget-api/api/Get-Widget.html"], undefined);
    });

    it("generates sub-folder index files named after the folder", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs").compile(widgetSource);

      assert.ok(result.outputs["widget-api/api/api.md"].includes("# Operations"));
      assert.ok(result.outputs["widget-api/api/api.md"].includes("getWidget"));
      assert.ok(result.outputs["widget-api/resources/resources.md"].includes("# Types"));
      assert.ok(result.outputs["widget-api/resources/resources.md"].includes("Widget"));
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
      assert.ok(result.outputs["accounts-api/accounts-api.md"].includes("getUser"));
      assert.ok(result.outputs["orders-api/orders-api.md"].includes("getOrder"));
      assert.ok(result.outputs["accounts-api/api/Get-User.md"] !== undefined);
      assert.ok(result.outputs["orders-api/api/Get-Order.md"] !== undefined);
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

      assert.ok(result.outputs["README.md"].includes("[Widget API](widget-api/widget-api.md)"));
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

      assert.ok(result.outputs["1-0/1-0.md"] !== undefined);
      assert.ok(result.outputs["1-1/1-1.md"] !== undefined);
      assert.ok(result.outputs["2-0/2-0.md"] !== undefined);
      assert.ok(result.outputs["1-0/1-0.md"].includes("list"));
      assert.ok(!result.outputs["1-0/1-0.md"].includes("create"));
      assert.ok(result.outputs["1-1/1-1.md"].includes("create"));
      assert.ok(!result.outputs["1-1/1-1.md"].includes("analyze"));
      assert.ok(result.outputs["2-0/2-0.md"].includes("analyze"));
      assert.equal(result.outputs["1-0/resources/Analyze-Result.md"], undefined);
      assert.ok(result.outputs["2-0/resources/Analyze-Result.md"] !== undefined);
      assert.ok(result.outputs["2-0/2-0.md"].includes("Version: `2.0`"));
      assert.ok(result.outputs["2-0/resources/Widget.md"].includes("Version: `2.0`"));
      assert.ok(result.outputs["2-0/api/Widgets-List.md"].includes("Version: `2.0`"));
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

      assert.ok(result.outputs["README.md"].includes("## Versioned Services"));
      assert.ok(result.outputs["README.md"].includes("### Widget API"));
      assert.ok(result.outputs["README.md"].includes("| 1.0     | [Widget API 1.0](1-0/1-0.md) |"));
      assert.ok(result.outputs["README.md"].includes("| 2.0     | [Widget API 2.0](2-0/2-0.md) |"));
    });
  });

  describe("github format", () => {
    it("generates README.md as the index file at every level", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs", { format: "github" }).compile(widgetSource);

      assert.equal(result.outputs["index.md"], undefined);
      assert.ok(result.outputs["widget-api/README.md"].includes("## Resources"));
      assert.ok(result.outputs["widget-api/README.md"].includes("getWidget"));
      assert.ok(result.outputs["widget-api/api/README.md"].includes("# Operations"));
      assert.ok(result.outputs["widget-api/api/README.md"].includes("getWidget"));
      assert.ok(result.outputs["widget-api/resources/README.md"].includes("# Types"));
      assert.ok(result.outputs["widget-api/resources/README.md"].includes("Widget"));
      assert.ok(result.outputs["widget-api/api/Get-Widget.md"].includes("# Get Widget"));
      assert.ok(result.outputs["widget-api/resources/Widget.md"].includes("Stable identifier"));
    });

    it("renders the service index as README.md when enabled", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs", { format: "github", "render-service-index": true }).compile(`
        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget {
          id: string;
        }

        op getWidget(id: string): Widget;
      `);

      assert.ok(result.outputs["README.md"].includes("[Widget API](widget-api/README.md)"));
      assert.equal(result.outputs["index.md"], undefined);
    });
  });

  describe("docfx format", () => {
    it("generates index.md and toc.yml for each service", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs", { format: "docfx" }).compile(widgetSource);

      assert.equal(result.outputs["index.md"], undefined);
      assert.ok(result.outputs["widget-api/index.md"].includes("## Resources"));
      assert.ok(result.outputs["widget-api/index.md"].includes("getWidget"));
      assert.ok(result.outputs["widget-api/toc.yml"].includes("- name: Overview"));
      assert.ok(result.outputs["widget-api/toc.yml"].includes("href: index.md"));
      assert.ok(result.outputs["widget-api/toc.yml"].includes("- name: API"));
      assert.ok(result.outputs["widget-api/toc.yml"].includes("href: api/Get-Widget.md"));
      assert.ok(result.outputs["widget-api/toc.yml"].includes("- name: Resources"));
      assert.ok(result.outputs["widget-api/toc.yml"].includes("href: resources/Widget.md"));
      assert.ok(result.outputs["widget-api/api/Get-Widget.md"].includes("# Get Widget"));
      assert.ok(result.outputs["widget-api/resources/Widget.md"].includes("Stable identifier"));
      assert.equal(result.outputs["widget-api/api/api.md"], undefined);
      assert.equal(result.outputs["widget-api/resources/resources.md"], undefined);
    });

    it("renders index.md and toc.yml at root when service index is enabled", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs", { format: "docfx", "render-service-index": true }).compile(`
        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget {
          id: string;
        }

        op getWidget(id: string): Widget;
      `);

      assert.ok(result.outputs["index.md"].includes("[Widget API](widget-api/index.md)"));
      assert.ok(result.outputs["toc.yml"].includes("- name: Widget API"));
      assert.ok(result.outputs["toc.yml"].includes("href: widget-api/index.md"));
    });
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

    const operationPage = result.outputs["widget-api/api/Widgets-Update.md"];
    assert.ok(operationPage.includes("# Widgets Update"));
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

    const operationPage = result.outputs["widget-api/api/Widgets-Read.md"];
    assert.ok(operationPage.includes("## Optional query parameters"));
    assert.ok(operationPage.includes("| expand | string | No       | No summary provided. |"));
    assert.ok(operationPage.includes("## Request headers"));
    assert.ok(operationPage.includes("| ConsistencyLevel | string | No       | No summary provided. |"));
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

    const widgetListPage = result.outputs["relationship-api/resources/Widget-List.md"];
    assert.ok(widgetListPage.includes("## Methods"));
    assert.ok(widgetListPage.includes("| [list](../api/Widgets-List.md) |"));
    assert.ok(widgetListPage.includes("## Properties"));
    assert.ok(widgetListPage.includes("| items | [Widget](Widget.md)[] | Yes      | No summary provided. |"));
    assert.ok(!widgetListPage.includes("## Relationships"));
    assert.ok(!widgetListPage.includes("### items"));
    assert.ok(!widgetListPage.includes("| [read](api/Widgets-Read.md) |"));
    assert.ok(!widgetListPage.includes("| [create](api/Widgets-Create.md) |"));
  });
});
