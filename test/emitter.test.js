/**
 * Tests for src/emitter.ts — output format structure, service index, and
 * emitter-level options (emit-project-files, overwrite-project-files,
 * clean-output-dir).
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
      const result = await tester
        .emit("@massivescale/tsp-api-docs")
        .compile(widgetSource);

      assert.equal(result.outputs["index.md"], undefined);
      // Overview is at the same level as the widget-api/ folder (not inside it).
      assert.ok(result.outputs["widget-api.md"].includes("## Resources"));
      assert.ok(result.outputs["widget-api.md"].includes("getWidget"));
      assert.ok(
        result.outputs["widget-api/api/Get-Widget.md"].includes("# Get Widget"),
      );
      assert.ok(
        result.outputs["widget-api/api/Get-Widget.md"].includes(
          "Return a widget by id.",
        ),
      );
      assert.ok(
        result.outputs["widget-api/resources/Widget.md"].includes(
          "Stable identifier",
        ),
      );
      assert.equal(result.outputs["widget-api/index.html"], undefined);
      assert.equal(result.outputs["widget-api/api/Get-Widget.html"], undefined);
    });

    it("generates sub-folder index files named after the folder", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs")
        .compile(widgetSource);

      // Index files are at the same level as the folder they represent.
      assert.ok(result.outputs["widget-api/api.md"].includes("# Operations"));
      assert.ok(result.outputs["widget-api/api.md"].includes("getWidget"));
      assert.ok(result.outputs["widget-api/resources.md"].includes("# Types"));
      assert.ok(result.outputs["widget-api/resources.md"].includes("Widget"));
    });

    it("renders the service index when explicitly enabled", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs", {
        "render-service-index": true,
      }).compile(`
        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget {
          id: string;
        }

        op getWidget(id: string): Widget;
      `);

      // Service index links to the overview page, which is next to the widget-api/ folder.
      assert.ok(
        result.outputs["README.md"].includes("[Widget API](widget-api.md)"),
      );
    });
  });

  describe("github format", () => {
    it("generates README.md as the index file at every level", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", { format: "github" })
        .compile(widgetSource);

      assert.equal(result.outputs["index.md"], undefined);
      assert.ok(
        result.outputs["widget-api/README.md"].includes("## Resources"),
      );
      assert.ok(result.outputs["widget-api/README.md"].includes("getWidget"));
      assert.ok(
        result.outputs["widget-api/api/README.md"].includes("# Operations"),
      );
      assert.ok(
        result.outputs["widget-api/api/README.md"].includes("getWidget"),
      );
      assert.ok(
        result.outputs["widget-api/resources/README.md"].includes("# Types"),
      );
      assert.ok(
        result.outputs["widget-api/resources/README.md"].includes("Widget"),
      );
      assert.ok(
        result.outputs["widget-api/api/Get-Widget.md"].includes("# Get Widget"),
      );
      assert.ok(
        result.outputs["widget-api/resources/Widget.md"].includes(
          "Stable identifier",
        ),
      );
    });

    it("renders the service index as README.md when enabled", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs", {
        format: "github",
        "render-service-index": true,
      }).compile(`
        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget {
          id: string;
        }

        op getWidget(id: string): Widget;
      `);

      assert.ok(
        result.outputs["README.md"].includes(
          "[Widget API](widget-api/README.md)",
        ),
      );
      assert.equal(result.outputs["index.md"], undefined);
    });
  });

  describe("docfx format", () => {
    it("generates index.md and toc.yml for each service", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", { format: "docfx" })
        .compile(widgetSource);

      assert.equal(result.outputs["index.md"], undefined);
      assert.ok(result.outputs["widget-api/index.md"].includes("## Resources"));
      assert.ok(result.outputs["widget-api/index.md"].includes("getWidget"));
      assert.ok(
        result.outputs["widget-api/toc.yml"].includes("- name: Overview"),
      );
      assert.ok(
        result.outputs["widget-api/toc.yml"].includes("href: index.md"),
      );
      assert.ok(result.outputs["widget-api/toc.yml"].includes("- name: API"));
      assert.ok(
        result.outputs["widget-api/toc.yml"].includes(
          "href: api/Get-Widget.md",
        ),
      );
      assert.ok(
        result.outputs["widget-api/toc.yml"].includes("- name: Resources"),
      );
      assert.ok(
        result.outputs["widget-api/toc.yml"].includes(
          "href: resources/Widget.md",
        ),
      );
      assert.ok(
        result.outputs["widget-api/api/Get-Widget.md"].includes("# Get Widget"),
      );
      assert.ok(
        result.outputs["widget-api/resources/Widget.md"].includes(
          "Stable identifier",
        ),
      );
      assert.equal(result.outputs["widget-api/api/api.md"], undefined);
      assert.equal(
        result.outputs["widget-api/resources/resources.md"],
        undefined,
      );
    });

    it("renders index.md and toc.yml at root when service index is enabled", async () => {
      const result = await tester.emit("@massivescale/tsp-api-docs", {
        format: "docfx",
        "render-service-index": true,
      }).compile(`
        @service(#{ title: "Widget API" })
        namespace Demo;

        model Widget {
          id: string;
        }

        op getWidget(id: string): Widget;
      `);

      assert.ok(
        result.outputs["index.md"].includes(
          "[Widget API](widget-api/index.md)",
        ),
      );
      assert.ok(result.outputs["toc.yml"].includes('- name: "Widget API"'));
      assert.ok(
        result.outputs["toc.yml"].includes("href: widget-api/index.md"),
      );
    });
  });

  describe("emit-project-files option", () => {
    it("emits docfx.json by default for docfx format", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", { format: "docfx" })
        .compile(widgetSource);

      assert.ok(
        result.outputs["docfx.json"] !== undefined,
        "docfx.json should be emitted by default",
      );
      const config = JSON.parse(result.outputs["docfx.json"]);
      assert.deepEqual(config.build.template, ["default", "modern"]);
      assert.equal(config.build.dest, "_site");
    });

    it("omits docfx.json when emit-project-files is false", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          "emit-project-files": false,
        })
        .compile(widgetSource);

      assert.equal(
        result.outputs["docfx.json"],
        undefined,
        "docfx.json should not be emitted when emit-project-files is false",
      );
    });

    it("applies docfx.theme to docfx.json template array", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          docfx: { theme: ["default", "my-custom-theme"] },
        })
        .compile(widgetSource);

      const config = JSON.parse(result.outputs["docfx.json"]);
      assert.deepEqual(config.build.template, ["default", "my-custom-theme"]);
    });

    it("applies docfx.app-name and docfx.app-title to globalMetadata", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          docfx: { "app-name": "My API", "app-title": "My API Reference" },
        })
        .compile(widgetSource);

      const config = JSON.parse(result.outputs["docfx.json"]);
      assert.equal(config.build.globalMetadata._appName, "My API");
      assert.equal(config.build.globalMetadata._appTitle, "My API Reference");
    });

    it("docfx.app-name and docfx.app-title default to api-name when set", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          "api-name": "Widget Service",
        })
        .compile(widgetSource);

      const config = JSON.parse(result.outputs["docfx.json"]);
      assert.equal(config.build.globalMetadata._appName, "Widget Service");
      assert.equal(config.build.globalMetadata._appTitle, "Widget Service");
    });

    it("docfx.enable-pdf and docfx.enable-pdf-toc-page control globalMetadata flags", async () => {
      const enabledResult = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          docfx: { "enable-pdf": true, "enable-pdf-toc-page": true },
        })
        .compile(widgetSource);
      const enabledConfig = JSON.parse(enabledResult.outputs["docfx.json"]);
      assert.equal(enabledConfig.build.globalMetadata.pdf, true);
      assert.equal(enabledConfig.build.globalMetadata.pdfTocPage, true);

      const disabledResult = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          docfx: { "enable-pdf": false, "enable-pdf-toc-page": false },
        })
        .compile(widgetSource);
      const disabledConfig = JSON.parse(disabledResult.outputs["docfx.json"]);
      assert.equal(disabledConfig.build.globalMetadata.pdf, false);
      assert.equal(disabledConfig.build.globalMetadata.pdfTocPage, false);
    });

    it("docfx.emit-json suppresses docfx.json independently of emit-project-files", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          docfx: { "emit-json": false },
        })
        .compile(widgetSource);

      assert.equal(
        result.outputs["docfx.json"],
        undefined,
        "docfx.json should be suppressed when docfx.emit-json is false",
      );
      assert.ok(
        result.outputs["widget-api/index.md"] !== undefined,
        "documentation pages should still be emitted",
      );
    });

    it("does not emit docfx.json for non-docfx formats", async () => {
      const azureResult = await tester
        .emit("@massivescale/tsp-api-docs", { format: "azure-devops" })
        .compile(widgetSource);
      assert.equal(azureResult.outputs["docfx.json"], undefined);

      const githubResult = await tester
        .emit("@massivescale/tsp-api-docs", { format: "github" })
        .compile(widgetSource);
      assert.equal(githubResult.outputs["docfx.json"], undefined);
    });
  });

  describe("clean-output-dir option", () => {
    it("emits all files normally when clean-output-dir is false", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", { "clean-output-dir": false })
        .compile(widgetSource);

      assert.ok(result.outputs["widget-api.md"] !== undefined);
      assert.ok(result.outputs["widget-api/api/Get-Widget.md"] !== undefined);
      assert.ok(result.outputs["widget-api/resources/Widget.md"] !== undefined);
    });
  });

  describe("overwrite-project-files option", () => {
    it("emits docfx.json for docfx format when overwrite-project-files is true", async () => {
      const result = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          "overwrite-project-files": true,
        })
        .compile(widgetSource);

      assert.ok(
        result.outputs["docfx.json"] !== undefined,
        "docfx.json should be emitted when overwrite-project-files is true",
      );
    });

    it("still emits all doc pages regardless of overwrite-project-files value", async () => {
      const falseResult = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          "overwrite-project-files": false,
        })
        .compile(widgetSource);
      const trueResult = await tester
        .emit("@massivescale/tsp-api-docs", {
          format: "docfx",
          "overwrite-project-files": true,
        })
        .compile(widgetSource);

      assert.ok(falseResult.outputs["widget-api/index.md"] !== undefined);
      assert.ok(
        falseResult.outputs["widget-api/api/Get-Widget.md"] !== undefined,
      );
      assert.ok(trueResult.outputs["widget-api/index.md"] !== undefined);
      assert.ok(
        trueResult.outputs["widget-api/api/Get-Widget.md"] !== undefined,
      );
    });
  });
});
