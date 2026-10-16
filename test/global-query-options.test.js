/**
 * Tests for the @globalQueryOptions decorator (src/decorators.ts) and how
 * operation pages render the options it declares.
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

const commonQueryOptionsModel = `
  model CommonQueryOptions {
    /** Filters the collection. */
    @query("$filter") filter?: string;
    /** Maximum number of items to return. */
    @query("$top") top?: int32;
    /** Number of items to skip. */
    @query("$skip") skip?: int32;
    /** Properties to include in the response. */
    @query("$select") select?: string;
  }
`;

function querySection(page) {
  const start = page.indexOf("## Optional query parameters");
  const end = page.indexOf("## Request headers");
  assert.ok(start >= 0 && end > start, "query section should be present");
  return page.slice(start, end);
}

function rows(section) {
  return section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .map((line) => line.replace(/ {2,}/g, " ").trim());
}

function rowNames(section) {
  return section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Name "))
    .map((line) => line.split("|")[1].trim());
}

async function emitHttp(source) {
  const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
    using Http;
    using MassiveScale.ApiDocs;

    @service(#{ title: "Widget API" })
    namespace Demo;

    model Widget { id: string; }
    ${source}
  `);
  return result.outputs;
}

describe("@globalQueryOptions", () => {
  it("lists a different set of options per operation", async () => {
    const outputs = await emitHttp(`
      ${commonQueryOptionsModel}

      @route("/widgets")
      @globalQueryOptions(CommonQueryOptions)
      interface Widgets {
        @get list(): Widget[];

        @globalQueryOptions(PickProperties<CommonQueryOptions, "select">)
        @get read(@path id: string): Widget;

        @globalQueryOptions()
        @delete remove(@path id: string): void;
      }
    `);

    assert.deepEqual(
      rowNames(querySection(outputs["widget-api/api/Widgets-List.md"])),
      ["$filter", "$top", "$skip", "$select"],
    );
    assert.deepEqual(
      rowNames(querySection(outputs["widget-api/api/Widgets-Read.md"])),
      ["$select"],
    );
    const removeSection = querySection(
      outputs["widget-api/api/Widgets-Remove.md"],
    );
    assert.deepEqual(rowNames(removeSection), []);
    assert.ok(
      removeSection.includes("This method does not support query parameters."),
    );
  });

  it("renders the type, required label, and doc summary of each option", async () => {
    const outputs = await emitHttp(`
      ${commonQueryOptionsModel}

      model Tenant {
        /** Tenant that owns the data. */
        @query tenant: string;
      }

      @route("/widgets")
      interface Widgets {
        @globalQueryOptions(CommonQueryOptions, Tenant)
        @get list(): Widget[];
      }
    `);

    const section = querySection(outputs["widget-api/api/Widgets-List.md"]);
    assert.ok(
      rows(section).includes(
        "| $top | int32 | No | Maximum number of items to return. |",
      ),
    );
    assert.ok(
      rows(section).includes(
        "| tenant | string | Yes | Tenant that owns the data. |",
      ),
    );
    assert.ok(!section.includes("does not support query parameters"));
  });

  it("supplements the query parameters the route declares", async () => {
    const outputs = await emitHttp(`
      ${commonQueryOptionsModel}

      @route("/widgets")
      interface Widgets {
        @globalQueryOptions(PickProperties<CommonQueryOptions, "top" | "skip">)
        @get list(@query("$expand") expand?: string): Widget[];
      }
    `);

    assert.deepEqual(
      rowNames(querySection(outputs["widget-api/api/Widgets-List.md"])),
      ["$expand", "$top", "$skip"],
    );
  });

  it("keeps the declared parameter when a global option has the same wire name", async () => {
    const outputs = await emitHttp(`
      ${commonQueryOptionsModel}

      @route("/widgets")
      interface Widgets {
        @globalQueryOptions(CommonQueryOptions)
        @get list(
          /** Page size, capped at 50. */
          @query("$top") top?: int32,
        ): Widget[];
      }
    `);

    const section = querySection(outputs["widget-api/api/Widgets-List.md"]);
    assert.deepEqual(rowNames(section), [
      "$top",
      "$filter",
      "$skip",
      "$select",
    ]);
    assert.ok(section.includes("Page size, capped at 50."));
    assert.ok(!section.includes("Maximum number of items to return."));
  });

  it("does not add the options to the HTTP request line", async () => {
    const outputs = await emitHttp(`
      ${commonQueryOptionsModel}

      @route("/widgets")
      @globalQueryOptions(CommonQueryOptions)
      interface Widgets {
        @get list(): Widget[];
      }
    `);

    const page = outputs["widget-api/api/Widgets-List.md"];
    assert.match(page, /```http\r?\nGET \/api\/widgets\r?\n```/);
  });

  it("uses the property name when an option has no @query wire name", async () => {
    const outputs = await emitHttp(`
      model Paging {
        "$top"?: int32;
        pageToken?: string;
      }

      @route("/widgets")
      interface Widgets {
        @globalQueryOptions(Paging)
        @get list(): Widget[];
      }
    `);

    assert.deepEqual(
      rowNames(querySection(outputs["widget-api/api/Widgets-List.md"])),
      ["$top", "pageToken"],
    );
  });

  it("includes inherited properties and keeps the first of duplicate options", async () => {
    const outputs = await emitHttp(`
      model BaseOptions {
        /** From the base. */
        @query("$select") select?: string;
      }

      model ListOptions extends BaseOptions {
        /** First top. */
        @query("$top") top?: int32;
      }

      model MoreOptions {
        /** Second top. */
        @query("$top") top?: int32;
      }

      @route("/widgets")
      interface Widgets {
        @globalQueryOptions(ListOptions, MoreOptions)
        @get list(): Widget[];
      }
    `);

    const section = querySection(outputs["widget-api/api/Widgets-List.md"]);
    assert.deepEqual(rowNames(section).sort(), ["$select", "$top"]);
    assert.ok(section.includes("From the base."));
    assert.ok(section.includes("First top."));
    assert.ok(!section.includes("Second top."));
  });

  it("applies a namespace default that an interface or operation replaces", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;
      using MassiveScale.ApiDocs;

      ${commonQueryOptionsModel}

      model Widget { id: string; }

      @service(#{ title: "Widget API" })
      @globalQueryOptions(PickProperties<CommonQueryOptions, "filter">)
      namespace Demo {
        @route("/health") @get op health(): void;

        namespace Inner {
          @route("/widgets")
          interface Widgets {
            @get list(): Widget[];
          }

          @route("/gadgets")
          @globalQueryOptions(PickProperties<CommonQueryOptions, "top">)
          interface Gadgets {
            @get list(): Widget[];

            @globalQueryOptions(PickProperties<CommonQueryOptions, "skip">)
            @get read(@path id: string): Widget;
          }
        }
      }
    `);

    const pageNamed = (suffix) => {
      const key = Object.keys(result.outputs).find((path) =>
        path.endsWith(suffix),
      );
      assert.ok(key, `expected an output ending in ${suffix}`);
      return result.outputs[key];
    };

    assert.deepEqual(rowNames(querySection(pageNamed("/Health.md"))), [
      "$filter",
    ]);
    assert.deepEqual(rowNames(querySection(pageNamed("/Widgets-List.md"))), [
      "$filter",
    ]);
    assert.deepEqual(rowNames(querySection(pageNamed("/Gadgets-List.md"))), [
      "$top",
    ]);
    assert.deepEqual(rowNames(querySection(pageNamed("/Gadgets-Read.md"))), [
      "$skip",
    ]);
  });

  it("leaves operations without the decorator unchanged", async () => {
    const outputs = await emitHttp(`
      @route("/widgets")
      interface Widgets {
        @get list(): Widget[];
      }
    `);

    const section = querySection(outputs["widget-api/api/Widgets-List.md"]);
    assert.deepEqual(rowNames(section), []);
    assert.ok(
      section.includes("This method does not support query parameters."),
    );
  });

  it("works in versioned services", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs")
      .compile(`
      using Http;
      using Versioning;
      using MassiveScale.ApiDocs;

      @versioned(Versions)
      @service(#{ title: "Widget API" })
      namespace Demo;

      enum Versions { v1_0: "1.0", v2_0: "2.0" }

      model Widget { id: string; }

      model CommonQueryOptions {
        @query("$top") top?: int32;
        @added(Versions.v2_0) @query("$skip") skip?: int32;
      }

      @route("/widgets")
      @globalQueryOptions(CommonQueryOptions)
      interface Widgets {
        @get list(): Widget[];
      }
    `);

    assert.deepEqual(
      rowNames(querySection(result.outputs["1-0/api/Widgets-List.md"])),
      ["$top"],
    );
    assert.deepEqual(
      rowNames(querySection(result.outputs["2-0/api/Widgets-List.md"])),
      ["$top", "$skip"],
    );
  });

  it("documents a type referenced only by a global option", async () => {
    const outputs = await emitHttp(`
      union SortOrder { "asc", "desc" }

      model Sorting {
        /** Sort direction. */
        @query("$orderby") orderBy?: SortOrder;
      }

      @route("/widgets")
      interface Widgets {
        @globalQueryOptions(Sorting)
        @get list(): Widget[];
      }
    `);

    assert.ok(outputs["widget-api/resources/SortOrder.md"]);
    assert.equal(outputs["widget-api/resources/Sorting.md"], undefined);
    assert.ok(
      rows(querySection(outputs["widget-api/api/Widgets-List.md"])).includes(
        "| $orderby | [SortOrder](../resources/SortOrder.md) | No | Sort direction. |",
      ),
    );
  });

  it("rejects arguments that are not models", async () => {
    const diagnostics = await httpTester.diagnose(`
      using MassiveScale.ApiDocs;

      @globalQueryOptions("nope")
      op list(): void;
    `);

    assert.ok(diagnostics.some((d) => d.code === "invalid-argument"));
  });
});
