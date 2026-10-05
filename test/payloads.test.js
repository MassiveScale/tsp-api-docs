/**
 * Tests for src/payloads.ts and the HTTP-aware page content built on it —
 * which types get pages (response models, metadata-only models, implicit
 * bodies), response headers, query wire names, and status reason phrases.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";
import {
  readableUriTemplate,
  formatStatusCode,
  statusText,
} from "../dist/src/utils.js";

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

/** Returns the generated resource page names for a service slug, sorted. */
function resourcePages(outputs, slug) {
  const prefix = `${slug}/resources/`;
  return Object.keys(outputs)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length).replace(/\.md$/, ""))
    .sort();
}

const configurationSource = `
  using Http;

  @service(#{ title: "Config API" })
  namespace Demo;

  @error
  model Error {
    title: string;
    status: int32;
  }

  @doc("The requested widget does not exist.")
  @error
  model NotFoundError {
    ...NotFoundResponse;
    @body body: Error;
  }

  @doc("The widget changed while it was being written.")
  @error
  model ConflictError {
    ...ConflictResponse;
    @body body: Error;
  }

  @doc("The If-Match ETag no longer matches.")
  @error
  model PreconditionFailedError {
    @statusCode statusCode: 412;
    @body body: Error;
  }

  model IfMatchHeader {
    @doc("Optimistic concurrency token.")
    @header("If-Match")
    ifMatch?: string;
  }

  model ETagHeader {
    @doc("Concurrency token for the returned widget.")
    @header("ETag")
    etag: string;
  }

  @doc("An entity together with its concurrency token.")
  model EntityResponse<T> {
    ...OkResponse;
    ...ETagHeader;
    @body body: T;
  }

  @doc("A newly created entity together with its concurrency token.")
  model CreatedEntityResponse<T> {
    ...CreatedResponse;
    ...ETagHeader;
    @body body: T;
  }

  @doc("The widget was updated.")
  model UpdatedResponse {
    ...NoContentResponse;
    ...ETagHeader;
  }

  enum Shade { light, dark }

  model Widget {
    id: string;
    shade: Shade;
    gadget: Gadget;
  }

  model Gadget {
    name: string;
  }

  model Unused {
    value: string;
  }

  @route("/widgets/{id}")
  interface Widgets {
    @get read(
      @path id: string,
      @query(#{ name: "$expand", explode: false }) expand?: string[],
    ): EntityResponse<Widget> | NotFoundError | Error;

    @post create(@path id: string, @body body: Widget):
      CreatedEntityResponse<Widget> | ConflictError | Error;

    @patch update(
      @path id: string,
      ...IfMatchHeader,
      @body body: MergePatchUpdate<Widget>,
    ): UpdatedResponse | NotFoundError | ConflictError | PreconditionFailedError | Error;
  }

  @route("/gadgets/{id}")
  interface Gadgets {
    @get read(@path id: string): EntityResponse<Gadget> | Error;
  }
`;

describe("payload type selection", () => {
  it("documents only payload types plus enums, not response or metadata-only models", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    assert.deepEqual(resourcePages(result.outputs, "config-api"), [
      "Error",
      "Gadget",
      "Shade",
      "Widget",
    ]);

    const typesIndex = result.outputs["config-api/resources.md"];
    for (const excluded of [
      "ETagHeader",
      "IfMatchHeader",
      "UpdatedResponse",
      "NotFoundError",
      "ConflictError",
      "PreconditionFailedError",
      "EntityResponse",
      "Unused",
    ]) {
      assert.ok(
        !typesIndex.includes(excluded),
        `${excluded} must not be listed in the Types index`,
      );
    }

    const overview = result.outputs["config-api.md"];
    assert.ok(!overview.includes("resources/ETagHeader.md"));
    assert.ok(!overview.includes("resources/UpdatedResponse.md"));
  });

  it("keeps response model docs in the operation's response descriptions", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    const update = result.outputs["config-api/api/Widgets-Update.md"];
    assert.match(
      update,
      /\| 204 No Content +\| void +\| The widget was updated\./,
    );
    assert.match(
      update,
      /\| 404 Not Found +\| \[Error\]\(\.\.\/resources\/Error\.md\) +\| The requested widget does not exist\./,
    );
  });

  it("links types returned or accepted through response models in the Methods table", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    const widgetPage = result.outputs["config-api/resources/Widget.md"];
    assert.ok(widgetPage.includes("[read](../api/Widgets-Read.md)"));
    assert.ok(widgetPage.includes("[create](../api/Widgets-Create.md)"));
    assert.ok(widgetPage.includes("[update](../api/Widgets-Update.md)"));
    assert.ok(!widgetPage.includes("[read](../api/Gadgets-Read.md)"));
    assert.match(
      widgetPage,
      /\| \[read\]\(\.\.\/api\/Widgets-Read\.md\) +\| \[Widget\]\(Widget\.md\) +\|/,
    );
  });

  it("documents a model reused as both a payload and a property type once", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    const gadgetPage = result.outputs["config-api/resources/Gadget.md"];
    assert.ok(gadgetPage.includes("[read](../api/Gadgets-Read.md)"));
    assert.ok(
      !gadgetPage.includes("Widgets-Read.md"),
      "a type only nested in another payload is not a direct input or output",
    );

    const widgetPage = result.outputs["config-api/resources/Widget.md"];
    assert.match(widgetPage, /\| gadget +\| \[Gadget\]\(Gadget\.md\) +\|/);
  });

  it("documents each body type of templated response models separately", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    const operationsIndex = result.outputs["config-api/api.md"];
    assert.match(
      operationsIndex,
      /\| \[read\]\(api\/Gadgets-Read\.md\) +\| \[Gadget\]\(resources\/Gadget\.md\) +\|/,
    );
    assert.match(
      operationsIndex,
      /\| \[read\]\(api\/Widgets-Read\.md\) +\| \[Widget\]\(resources\/Widget\.md\) +\|/,
    );
    assert.match(
      operationsIndex,
      /\| \[update\]\(api\/Widgets-Update\.md\) +\| void +\|/,
    );
    assert.ok(!operationsIndex.includes("EntityResponse"));
  });

  it("does not document models that no operation reaches, but always documents enums", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Reach API" })
      namespace Demo;

      enum Unreferenced { one, two }
      union Mode { "fast", "slow" }
      union Unused { "x", "y" }
      scalar Sku extends string;
      scalar UnusedScalar extends string;

      model Widget { sku: Sku; mode: Mode; }
      model Orphan { id: string; }

      @route("/widgets")
      interface Widgets {
        @get list(): Widget[];
      }
    `);

    assert.deepEqual(resourcePages(result.outputs, "reach-api"), [
      "Mode",
      "Sku",
      "Unreferenced",
      "Widget",
    ]);
  });

  it("documents enums and models used only as parameter types", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Param API" })
      namespace Demo;

      union SortOrder { "asc", "desc" }

      @route("/widgets")
      interface Widgets {
        @get list(@query sort?: SortOrder): void;
      }
    `);

    assert.deepEqual(resourcePages(result.outputs, "param-api"), ["SortOrder"]);
  });

  it("follows explicit bodies, base models, and discriminated derived models", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Pets API" })
      namespace Demo;

      model Resource { id: string; }

      @discriminator("kind")
      model Pet extends Resource {
        kind: string;
        name: string;
      }

      model Cat extends Pet {
        kind: "cat";
        meows: boolean;
      }

      model Dog extends Pet {
        kind: "dog";
        barks: boolean;
      }

      model OddPet extends Pet {
        kind: "odd";
        @header("x-odd") odd: string;
        @body body: Toy;
      }

      model Toy { label: string; }

      model Plain extends Resource { value: string; }
      model PlainChild extends Plain { extra: string; }

      @route("/pets")
      interface Pets {
        @get list(): Pet[];
        @get @route("/plain") plain(): Plain;
      }
    `);

    assert.deepEqual(resourcePages(result.outputs, "pets-api"), [
      "Cat",
      "Dog",
      "Pet",
      "Plain",
      "Resource",
    ]);
  });

  it("keeps today's behavior without operations, minus metadata-only and response models", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Models API" })
      namespace Demo;

      model Widget { id: string; }
      model Orphan { name: string; }
      model ETagHeader { @header("ETag") etag: string; }
      model WidgetResponse { ...OkResponse; @body body: Widget; }
      model WidgetResult {
        @statusCode code: 200;
        @header("ETag") etag: string;
        @cookie("session") session?: string;
        name: string;
      }
    `);

    assert.deepEqual(resourcePages(result.outputs, "models-api"), [
      "Orphan",
      "Widget",
      "WidgetResult",
    ]);
    const resultPage = result.outputs["models-api/resources/WidgetResult.md"];
    assert.match(resultPage, /\| name +\| string +\|/);
    for (const name of ["code", "etag", "session"]) {
      assert.ok(!resultPage.includes(name), `${name} must not be documented`);
    }
  });

  it("documents the parts of multipart request and response bodies", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Multipart API" })
      namespace Demo;

      model Doc { title: string; }
      model Report { total: int32; }
      model Envelope { doc: HttpPart<Doc>; }

      @route("/files")
      interface Files {
        @post upload(
          @header contentType: "multipart/form-data",
          @multipartBody body: Envelope,
        ): void;

        @get download(): {
          @header contentType: "multipart/form-data";
          @multipartBody body: { report: HttpPart<Report> };
        };
      }
    `);

    assert.deepEqual(resourcePages(result.outputs, "multipart-api"), [
      "Doc",
      "Report",
    ]);

    const doc = result.outputs["multipart-api/resources/Doc.md"];
    assert.ok(doc.includes("[upload](../api/Files-Upload.md)"));
    assert.ok(!doc.includes("Files-Download.md"));
    const report = result.outputs["multipart-api/resources/Report.md"];
    assert.ok(report.includes("[download](../api/Files-Download.md)"));
    assert.ok(!report.includes("Files-Upload.md"));
  });

  it("handles recursive unions without overflowing the stack", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Json API" })
      namespace Demo;

      union JsonValue { string, JsonArray }
      model JsonArray is Array<JsonValue>;

      union Node { Branch, string }
      model Branch is Array<Node>;

      union DictValue { Dict, string }
      model Dict is Record<DictValue>;

      model Doc {
        value: JsonValue;
        tree?: Node;
        dict?: DictValue;
      }

      @route("/docs")
      interface Docs {
        @get read(): Doc;
      }
    `);

    const doc = result.outputs["json-api/resources/Doc.md"];
    assert.match(doc, /\| value +\| \[JsonValue\]\(JsonValue\.md\) +\|/);
    assert.match(doc, /\| tree +\| \[Node\]\(Node\.md\) +\|/);
    assert.ok(result.outputs["json-api/resources/JsonValue.md"]);
  });

  it("walks TypeSpec types for an operation whose HTTP metadata has diagnostics", async () => {
    const [result, diagnostics] = await httpTester.emit(
      "@massivescale/tsp-api-docs",
    ).compileAndDiagnose(`
      using Http;

      @service(#{ title: "Fallback API" })
      namespace Demo;

      model Thing { name: string; }
      model Widget { id: string; }
      model WidgetEnvelope { ...OkResponse; @body body: Widget; }
      model CookieResult { @cookie("session") session: string; label: string; }
      union Mode { "a", "b" }
      union Outcome { WidgetEnvelope, CookieResult }
      model Gizmo { size: int32; }
      model GizmoEnvelope { @header("x-trace") trace: string; @body body: Gizmo; }
      model Orphan { id: string; }

      @route("/ok") op ok(): Thing;
      @route("/odd") op odd(
        @header("x-mode") mode: Mode,
        @bodyRoot request: GizmoEnvelope,
      ): Outcome;
    `);

    assert.ok(
      diagnostics.every((diagnostic) => diagnostic.severity === "warning"),
    );
    assert.ok(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "@typespec/http/response-cookie-not-supported",
      ),
    );
    assert.deepEqual(resourcePages(result.outputs, "fallback-api"), [
      "CookieResult",
      "Gizmo",
      "Mode",
      "Thing",
      "Widget",
    ]);

    const odd = result.outputs["fallback-api/api/Odd.md"];
    assert.ok(!odd.includes("## HTTP request"));
    assert.ok(odd.includes("## Parameters"));
    assert.match(
      odd,
      /\| mode +\| \[Mode\]\(\.\.\/resources\/Mode\.md\) +\| Yes +\|/,
    );
    assert.ok(odd.includes("No examples provided."));
  });

  it("documents the merge-patch source in a versioned service", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs")
      .compile(`
      using Http;
      using Versioning;

      @versioned(Versions)
      @service(#{ title: "Widget API" })
      namespace Demo;

      enum Versions { v1_0: "1.0" }

      model ETagHeader { @header("ETag") etag: string; }
      model UpdatedResponse { ...NoContentResponse; ...ETagHeader; }
      model Widget { id: string; name: string; }

      @route("/widgets/{id}")
      interface Widgets {
        @patch update(@path id: string, @body body: MergePatchUpdate<Widget>): UpdatedResponse;
      }
    `);

    assert.deepEqual(resourcePages(result.outputs, "1-0"), [
      "Versions",
      "Widget",
    ]);
    const widgetPage = result.outputs["1-0/resources/Widget.md"];
    assert.ok(widgetPage.includes("[update](../api/Widgets-Update.md)"));
  });
});

describe("implicit bodies and metadata properties", () => {
  const implicitSource = `
    using Http;

    @service(#{ title: "Implicit API" })
    namespace Demo;

    @doc("A widget with its concurrency token.")
    model WidgetResult {
      @statusCode statusCode: 200;
      @header("ETag") etag: string;
      name: string;
      size: int32;
    }

    model Traced {
      @header("x-trace") trace?: string;
      headers?: ETagHolder;
      headerList?: ETagHolder[];
      eitherHeader?: ETagHolder | string;
      headerPair?: [ETagHolder, string];
      label: string;
      pair?: [string, Mode.fast];
    }

    union Mode { fast: "fast", slow: "slow" }

    model ETagHolder { @header("ETag") etag: string; }

    model Container {
      item: Traced;
    }

    @route("/widgets")
    interface Widgets {
      @get read(): WidgetResult;
      @get @route("/container") container(): Container;
    }
  `;

  it("gives an implicit-body response model a page listing only body properties", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(implicitSource);

    const page = result.outputs["implicit-api/resources/WidgetResult.md"];
    assert.ok(page, "WidgetResult should have a type page");
    assert.match(page, /\| name +\| string +\|/);
    assert.match(page, /\| size +\| int32 +\|/);
    assert.ok(!page.includes("etag"));
    assert.ok(!page.includes("statusCode"));
    assert.ok(page.includes('"name": "string"'));
    assert.ok(page.includes("[read](../api/Widgets-Read.md)"));
  });

  it("links the implicit body to its response model on the operation page", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(implicitSource);

    const page = result.outputs["implicit-api/api/Widgets-Read.md"];
    assert.match(
      page,
      /\| 200 OK +\| \[WidgetResult\]\(\.\.\/resources\/WidgetResult\.md\) +\| A widget with its concurrency token\./,
    );
    assert.ok(!page.includes('"etag"'));
    assert.ok(!page.includes('"statusCode"'));
    assert.ok(page.includes("ETag: string"));
  });

  it("strips header and metadata-only-typed properties from nested payload types", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(implicitSource);

    assert.deepEqual(resourcePages(result.outputs, "implicit-api"), [
      "Container",
      "Traced",
      "WidgetResult",
    ]);

    const traced = result.outputs["implicit-api/resources/Traced.md"];
    assert.match(traced, /\| label +\| string +\|/);
    assert.match(traced, /\| pair +\|/);
    for (const name of [
      "trace",
      "headers",
      "headerList",
      "eitherHeader",
      "headerPair",
    ]) {
      assert.ok(!traced.includes(`| ${name} `), `${name} must not be listed`);
      assert.ok(!traced.includes(`"${name}"`), `${name} must not be in JSON`);
    }

    const container = result.outputs["implicit-api/api/Widgets-Container.md"];
    assert.ok(!container.includes('"trace"'));
    assert.ok(container.includes('"label": "string"'));
  });

  it("skips metadata-only base models in the documented base type", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Base API" })
      namespace Demo;

      model TraceBase { @header("x-trace") trace: string; }
      model KeyBase extends TraceBase { id: string; }
      model Widget extends KeyBase { name: string; }
      model Gizmo extends TraceBase { name: string; }

      @route("/widgets")
      interface Widgets {
        @get read(): Widget;
        @get @route("/gizmo") gizmo(): Gizmo;
      }
    `);

    const widget = result.outputs["base-api/resources/Widget.md"];
    assert.ok(widget.includes("Base type: [KeyBase](KeyBase.md)"));
    const gizmo = result.outputs["base-api/resources/Gizmo.md"];
    assert.ok(!gizmo.includes("Base type:"));
    assert.ok(!gizmo.includes("trace"));
  });

  it("omits metadata properties from the relation diagram", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs", { "emit-relation-diagram": true })
      .compile(implicitSource);

    const diagram = result.outputs["implicit-api/relation-diagram.md"];
    assert.ok(diagram.includes("string label"));
    assert.ok(!diagram.includes("trace"));
    assert.ok(!diagram.includes("etag"));
  });
});

describe("response headers", () => {
  it("documents response headers per status code and in example responses", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    const read = result.outputs["config-api/api/Widgets-Read.md"];
    const headersSection = read.slice(
      read.indexOf("## Response headers"),
      read.indexOf("## Examples"),
    );
    assert.ok(headersSection.includes("### 200 OK"));
    assert.match(
      headersSection,
      /\| ETag +\| string +\| Yes +\| Concurrency token for the returned widget\. \|/,
    );
    assert.ok(!headersSection.includes("### 404 Not Found"));
    assert.ok(
      !headersSection.includes(
        "This method does not return custom response headers.",
      ),
    );
    assert.ok(read.includes("HTTP/1.1 200 OK\nETag: string\nContent-Type"));

    const create = result.outputs["config-api/api/Widgets-Create.md"];
    assert.ok(create.includes("### 201 Created"));

    const update = result.outputs["config-api/api/Widgets-Update.md"];
    assert.ok(update.includes("### 204 No Content"));
    assert.match(update, /HTTP\/1\.1 204 No Content\nETag: string\r?\n```/);
  });

  it("uses @opExample values for the body and headers of a response model", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Example API" })
      namespace Demo;

      model Widget { id: string; }

      model EntityResponse<T> {
        ...OkResponse;
        @header("ETag") etag: string;
        @body body: T;
      }

      model WidgetResult {
        @header("ETag") etag: string;
        name: string;
      }

      @route("/widgets")
      interface Widgets {
        @opExample(#{
          parameters: #{ id: "w-1" },
          returnType: #{ statusCode: 200, etag: "\\"v1\\"", body: #{ id: "w-1" } }
        })
        @get read(@path id: string): EntityResponse<Widget>;

        @opExample(#{ returnType: #{ etag: "\\"v2\\"", name: "Bolt" } })
        @get @route("/result") result(): WidgetResult;

        @opExample(#{ returnType: "hello" })
        @get @route("/text") text(): string;
      }
    `);

    const text = result.outputs["example-api/api/Widgets-Text.md"];
    assert.ok(text.includes('"hello"'));

    const read = result.outputs["example-api/api/Widgets-Read.md"];
    assert.ok(read.includes('ETag: "v1"'));
    assert.ok(read.includes('"id": "w-1"'));
    assert.ok(!read.includes('"body"'));
    assert.ok(!read.includes('"statusCode"'));

    const implicit = result.outputs["example-api/api/Widgets-Result.md"];
    assert.ok(implicit.includes('ETag: "v2"'));
    assert.ok(implicit.includes('"name": "Bolt"'));
    assert.ok(!implicit.includes('"etag"'));
  });
});

describe("example responses", () => {
  const statusSource = `
    using Http;

    @service(#{ title: "Status API" })
    namespace Demo;

    model Widget { id: string; }

    @error
    model Problem { title: string; }

    model EntityResponse<T> {
      ...OkResponse;
      @header("ETag") etag: string;
      @body body: T;
    }

    @error
    model NotFoundError {
      ...NotFoundResponse;
      @body body: Problem;
    }

    @error
    model ClientError {
      @minValue(400) @maxValue(499) @statusCode code: int32;
      @header("x-reason") reason: string;
      @body body: Problem;
    }

    @route("/widgets")
    interface Widgets {
      @opExample(#{ returnType: #{ statusCode: 404, body: #{ title: "Missing" } } })
      @get read(@path id: string): EntityResponse<Widget> | NotFoundError;

      @opExample(#{ returnType: #{ code: 409, reason: "taken", body: #{ title: "Clash" } } })
      @post create(@body body: Widget): EntityResponse<Widget> | ClientError;

      @opExample(#{ returnType: #{ code: 500, reason: "boom", body: #{ title: "Boom" } } })
      @delete remove(@path id: string): EntityResponse<Widget> | ClientError;
    }
  `;

  it("renders the response whose status code the @opExample selects", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(statusSource);

    const read = result.outputs["status-api/api/Widgets-Read.md"];
    const response = read.slice(read.indexOf("#### Response"));
    assert.ok(response.includes("HTTP/1.1 404 Not Found"));
    assert.ok(response.includes('"title": "Missing"'));
    assert.ok(!response.includes("ETag"));
    assert.ok(!response.includes("HTTP/1.1 200 OK"));
  });

  it("matches a status code range and shows the example's exact code", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(statusSource);

    const create = result.outputs["status-api/api/Widgets-Create.md"];
    const response = create.slice(create.indexOf("#### Response"));
    assert.ok(response.includes("HTTP/1.1 409 Conflict"));
    assert.ok(response.includes("x-reason: taken"));
    assert.ok(response.includes('"title": "Clash"'));
    assert.ok(!response.includes('"code"'));
  });

  it("falls back to the primary response when no response accepts the example's status code", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(statusSource);

    const remove = result.outputs["status-api/api/Widgets-Remove.md"];
    const response = remove.slice(remove.indexOf("#### Response"));
    assert.ok(response.includes("HTTP/1.1 200 OK"));
  });
});

describe("query parameter wire names", () => {
  it("uses the wire name in the table, the example, and the URI template", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    const read = result.outputs["config-api/api/Widgets-Read.md"];
    assert.ok(read.includes("GET /api/widgets/{id}{?$expand}"));
    assert.ok(!read.includes("%24"));
    assert.match(read, /\| \$expand +\| string\[\] +\| No +\|/);
    assert.ok(!read.includes("| expand "));
    assert.ok(read.includes("GET /api/widgets/string?$expand=string"));
  });

  it("repeats exploded array query parameters and comma-joins the rest", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Query API" })
      namespace Demo;

      @route("/widgets")
      interface Widgets {
        @opExample(#{ parameters: #{ tags: #["a", "b"], ids: #["1", "2"] } })
        @get list(
          @query(#{ name: "tag", explode: true }) tags?: string[],
          @query(#{ name: "id-list" }) ids?: string[],
        ): void;
      }
    `);

    const list = result.outputs["query-api/api/Widgets-List.md"];
    assert.ok(list.includes("GET /api/widgets?tag=a&tag=b&id-list=1,2"));
    assert.match(list, /\| tag +\| string\[\] +\|/);
    assert.match(list, /\| id-list +\| string\[\] +\|/);
  });
});

describe("operation page polish", () => {
  it("renders reason phrases for every standard status code", async () => {
    const result = await httpTester
      .emit("@massivescale/tsp-api-docs")
      .compile(configurationSource);

    const update = result.outputs["config-api/api/Widgets-Update.md"];
    assert.ok(update.includes("| 409 Conflict "));
    assert.ok(update.includes("| 412 Precondition Failed "));
  });

  it("documents path parameters by wire name and drops the duplicate Parameters table", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Path API" })
      namespace Demo;

      model IfMatchHeader {
        @header("If-Match") ifMatch?: string;
      }

      model Widget { id: string; }

      @route("/widgets")
      interface Widgets {
        @patch update(
          @doc("The widget key.") @path("widget-key") widgetKey: string,
          @cookie("session") session?: string,
          ...IfMatchHeader,
          @body body: Widget,
        ): void;
      }
    `);

    const page = result.outputs["path-api/api/Widgets-Update.md"];
    assert.ok(page.includes("PATCH /api/widgets/{widget-key}"));
    assert.ok(page.includes("PATCH /api/widgets/string"));
    assert.ok(page.includes("## Path parameters"));
    assert.match(
      page,
      /\| widget-key +\| string +\| Yes +\| The widget key\. \|/,
    );
    assert.ok(page.includes("## Request cookies"));
    assert.match(page, /\| session +\| string +\| No +\|/);
    assert.match(page, /\| If-Match +\| string +\| No +\|/);
    assert.ok(!page.includes("ifMatch"));
    assert.ok(!page.includes("widgetKey"));
    assert.ok(!page.includes("## Parameters"));
    assert.ok(!page.includes("### Parameters"));
  });

  it("omits the Path parameters and Request cookies sections when there are none", async () => {
    const result = await httpTester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;

      @service(#{ title: "Plain API" })
      namespace Demo;

      @route("/widgets")
      interface Widgets {
        @get list(): void;
      }
    `);

    const page = result.outputs["plain-api/api/Widgets-List.md"];
    assert.ok(!page.includes("## Path parameters"));
    assert.ok(!page.includes("## Request cookies"));
    assert.ok(
      page.includes("This method does not return custom response headers."),
    );
  });
});

describe("utils", () => {
  it("returns reason phrases for standard codes and nothing for unknown ones", () => {
    assert.equal(statusText(409), "Conflict");
    assert.equal(statusText(412), "Precondition Failed");
    assert.equal(statusText(422), "Unprocessable Content");
    assert.equal(statusText(503), "Service Unavailable");
    assert.equal(statusText(299), "");
    assert.equal(formatStatusCode(299), "299");
    assert.equal(formatStatusCode(409), "409 Conflict");
  });

  it("decodes percent-encoded names inside URI template expressions only", () => {
    assert.equal(
      readableUriTemplate("/a{?%24expand,%24top}"),
      "/a{?$expand,$top}",
    );
    assert.equal(
      readableUriTemplate("/a{?id%2Dlist,x%7Ey}"),
      "/a{?id-list,x~y}",
    );
    assert.equal(readableUriTemplate("/a%20b/{id}"), "/a%20b/{id}");
    assert.equal(readableUriTemplate("/a{?%E0%A4%A}"), "/a{?%E0%A4%A}");
  });

  it("keeps escapes that would change the meaning or syntax of the template", () => {
    for (const escaped of [
      "%2C",
      "%26",
      "%3D",
      "%7D",
      "%7B",
      "%20",
      "%3A",
      "%25",
      "%C3%A9",
    ]) {
      const template = `/a{?filter${escaped}sort}`;
      assert.equal(readableUriTemplate(template), template, escaped);
    }
  });
});
