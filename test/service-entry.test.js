/**
 * Tests for src/service-entry.ts — service collection, versioning snapshots,
 * and the api-name slug option.
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

describe("service entry", () => {
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
    assert.ok(result.outputs["accounts-api.md"].includes("getUser"));
    assert.ok(result.outputs["orders-api.md"].includes("getOrder"));
    assert.ok(result.outputs["accounts-api/api/Get-User.md"] !== undefined);
    assert.ok(result.outputs["orders-api/api/Get-Order.md"] !== undefined);
  });

  it("renders documentation sets for each service version", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs")
      .compile(`
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

    // Overview pages are at the same level as their version folder.
    assert.ok(result.outputs["1-0.md"] !== undefined);
    assert.ok(result.outputs["1-1.md"] !== undefined);
    assert.ok(result.outputs["2-0.md"] !== undefined);
    assert.ok(result.outputs["1-0.md"].includes("list"));
    assert.ok(!result.outputs["1-0.md"].includes("create"));
    assert.ok(result.outputs["1-1.md"].includes("create"));
    assert.ok(!result.outputs["1-1.md"].includes("analyze"));
    assert.ok(result.outputs["2-0.md"].includes("analyze"));
    assert.equal(result.outputs["1-0/resources/AnalyzeResult.md"], undefined);
    assert.ok(result.outputs["2-0/resources/AnalyzeResult.md"] !== undefined);
    assert.ok(result.outputs["2-0.md"].includes("Version: `2.0`"));
    assert.ok(
      result.outputs["2-0/resources/Widget.md"].includes("Version: `2.0`"),
    );
    assert.ok(
      result.outputs["2-0/api/Widgets-List.md"].includes("Version: `2.0`"),
    );
  });

  it("renders version selector groups in root index when enabled", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs", {
      "render-service-index": true,
    }).compile(`
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
    // Version index links point to overview pages next to the version folders.
    assert.ok(
      result.outputs["README.md"].includes(
        "| 1.0     | [Widget API 1.0](1-0.md) |",
      ),
    );
    assert.ok(
      result.outputs["README.md"].includes(
        "| 2.0     | [Widget API 2.0](2-0.md) |",
      ),
    );
  });

  it("groups versioned services under a Versions section in the docfx root toc.yml", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs", {
      format: "docfx",
      "render-service-index": true,
    }).compile(`
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

    const toc = result.outputs["toc.yml"];
    assert.ok(toc !== undefined, "root toc.yml should be emitted");
    assert.ok(toc.includes("- name: Versions"), "toc.yml should have a Versions group");
    assert.ok(toc.includes('"Widget API"'), "toc.yml should include the service name");
    assert.ok(toc.includes('"1.0"'), "toc.yml should list version 1.0");
    assert.ok(toc.includes('"2.0"'), "toc.yml should list version 2.0");
    assert.ok(toc.includes("href: 1-0/index.md"), "toc.yml should link to version 1.0 overview");
    assert.ok(toc.includes("href: 2-0/index.md"), "toc.yml should link to version 2.0 overview");
  });

  describe("api-name option", () => {
    it("uses api-name as the slug for a non-versioned service", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", { "api-name": "My Awesome API" })
        .compile(widgetSource);

      // Slug is derived from the api-name, not the service title.
      assert.ok(
        result.outputs["my-awesome-api.md"] !== undefined,
        "overview file should use api-name slug",
      );
      assert.ok(
        result.outputs["my-awesome-api/api/Get-Widget.md"] !== undefined,
        "operation file should be under api-name folder",
      );
      assert.ok(
        result.outputs["my-awesome-api/resources/Widget.md"] !== undefined,
        "type file should be under api-name folder",
      );
      assert.equal(
        result.outputs["widget-api.md"],
        undefined,
        "original slug should not be emitted",
      );
    });

    it("prefixes the version with api-name for versioned services", async () => {
      const result = await versionedTester.emit("@massivescale/tsp-api-docs", {
        "api-name": "My Awesome API",
      }).compile(`
        using Http;
        using Versioning;

        @versioned(Versions)
        @service(#{ title: "Widget API" })
        namespace Demo;

        enum Versions {
          v1_0: "1.0",
          v2_0: "2.0",
        }

        model Widget { id: string; }

        @route("/widgets")
        interface Widgets {
          @get list(): Widget;
        }
      `);

      // Slug should be "<api-name> <version>" slugified.
      assert.ok(
        result.outputs["my-awesome-api-1-0.md"] !== undefined,
        "v1.0 overview should use api-name prefix",
      );
      assert.ok(
        result.outputs["my-awesome-api-2-0.md"] !== undefined,
        "v2.0 overview should use api-name prefix",
      );
      assert.ok(
        result.outputs["my-awesome-api-1-0/api/Widgets-List.md"] !== undefined,
        "operation should be under api-name-version folder",
      );
      assert.equal(
        result.outputs["1-0.md"],
        undefined,
        "version-only slug should not be emitted",
      );
    });

    it("groups versioned services by api-name in the service index", async () => {
      const result = await versionedTester.emit("@massivescale/tsp-api-docs", {
        "api-name": "My Awesome API",
        "render-service-index": true,
      }).compile(`
        using Http;
        using Versioning;

        @versioned(Versions)
        @service(#{ title: "Widget API" })
        namespace Demo;

        enum Versions {
          v1_0: "1.0",
          v2_0: "2.0",
        }

        model Widget { id: string; }

        @route("/widgets")
        interface Widgets {
          @get list(): Widget;
        }
      `);

      // Versions should be grouped under the api-name heading, not the service title.
      assert.ok(
        result.outputs["README.md"].includes("### My Awesome API"),
        "index should group under api-name",
      );
      assert.ok(
        !result.outputs["README.md"].includes("### Widget API"),
        "index should not group under service title",
      );
    });

    it("exposes apiName template variable on all page types", async () => {
      const { fileURLToPath } = await import("url");
      const { dirname, resolve } = await import("path");
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const customOverridePath = resolve(
        __dirname,
        "fixtures/custom-overview.md.hbs",
      );

      const result = await tester
        .emit("@massivescale/tsp-api-docs", {
          "api-name": "My Awesome API",
          templates: { overview: customOverridePath },
        })
        .compile(widgetSource);

      const overview = result.outputs["my-awesome-api.md"];
      assert.ok(
        overview.includes("CUSTOM_OVERVIEW_MARKER"),
        "custom template should be used",
      );
      assert.ok(
        overview.includes("ApiName: My Awesome API"),
        "apiName variable should be available in template",
      );
    });
  });
});
