/**
 * Tests for src/templates.ts — custom Handlebars template overrides and
 * fallback to built-in templates for non-overridden slots.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath, fileURLToPath as toPath } from "url";
import { dirname, resolve } from "path";

const tester = createTester(
  resolvePath(fileURLToPath(import.meta.url), "../../"),
  {
    libraries: ["@massivescale/tsp-api-docs"],
  },
).importLibraries();

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

const __dirname = dirname(toPath(import.meta.url));
const customOverridePath = resolve(
  __dirname,
  "fixtures/custom-overview.md.hbs",
);

describe("custom templates", () => {
  it("uses a custom overview template when specified", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", {
        templates: { overview: customOverridePath },
      })
      .compile(widgetSource);

    const overview = result.outputs["widget-api.md"];
    assert.ok(
      overview.includes("CUSTOM_OVERVIEW_MARKER"),
      "custom template should be rendered",
    );
    // Built-in content like the operations table should not appear.
    assert.ok(
      !overview.includes("## Operations"),
      "built-in sections should not appear",
    );
  });

  it("falls back to built-in templates for non-overridden templates", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", {
        templates: { overview: customOverridePath },
      })
      .compile(widgetSource);

    // Operation pages should still use the built-in template.
    assert.ok(
      result.outputs["widget-api/api/Get-Widget.md"].includes("# Get Widget"),
      "built-in operation template should still be used",
    );
    assert.ok(
      result.outputs["widget-api/resources/Widget.md"].includes(
        "## Properties",
      ),
      "built-in type template should still be used",
    );
  });
});
