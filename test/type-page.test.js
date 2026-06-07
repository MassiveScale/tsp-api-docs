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
  });
});
