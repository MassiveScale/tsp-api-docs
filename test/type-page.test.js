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
});
