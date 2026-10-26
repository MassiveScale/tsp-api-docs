/**
 * Tests that generated payloads are what the wire actually carries: models
 * with additional properties, `@encodedName`, response visibility, and
 * encoding-, format- and constraint-aware scalar samples.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "url";

const tester = createTester(
  resolvePath(fileURLToPath(import.meta.url), "../../"),
  {
    libraries: ["@massivescale/tsp-api-docs", "@typespec/http"],
  },
).importLibraries();

/** Compiles `source` and returns the emitted files with `\n` line endings. */
async function emit(source) {
  const result = await tester
    .emit("@massivescale/tsp-api-docs")
    .compile(source);
  return Object.fromEntries(
    Object.entries(result.outputs).map(([path, content]) => [
      path,
      content.replace(/\r\n/g, "\n"),
    ]),
  );
}

/** Extracts the JSON code blocks of a Markdown page, parsed. */
function jsonBlocks(page) {
  return [...page.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1]),
  );
}

/**
 * Splits the HTTP code blocks of a page's Examples section into head and
 * parsed body.
 */
function httpBlocks(page) {
  const examples = page.split("# Examples")[1] ?? "";
  return [...examples.matchAll(/```http\n([\s\S]*?)\n```/g)].map((match) => {
    const [head, body] = match[1].split("\n\n");
    return { head, body: body === undefined ? undefined : JSON.parse(body) };
  });
}

describe("models with additional properties", () => {
  const source = `
    using Http;
    @service(#{ title: "Bag API" })
    namespace Demo;

    /** A bag with a name and any other string properties. */
    model Bag { name: string; ...Record<string>; }
    model Labels extends Record<int32> { count: int32; }

    @route("/bags") interface Bags {
      @post create(@body body: Bag): Bag;
      @get @route("/labels") labels(): Labels;
      @get @route("/tags") tags(): Record<string>;
    }
  `;

  it("documents a model that spreads a record as a model", async () => {
    const outputs = await emit(source);
    const page = outputs["bag-api/resources/Bag.md"];

    assert.ok(page, "Bag gets a type page");
    assert.match(page, /Additional properties: string\./);
    assert.match(page, /\| name +\| string +\| Yes/);
    assert.ok(!page.includes("Base type: Record"));
    assert.deepEqual(jsonBlocks(page)[0], {
      name: "string",
      additionalProperty: "string",
    });
  });

  it("documents a model that extends a record as a model", async () => {
    const outputs = await emit(source);
    const page = outputs["bag-api/resources/Labels.md"];

    assert.ok(page, "Labels gets a type page");
    assert.match(page, /Additional properties: int32\./);
    assert.deepEqual(jsonBlocks(page)[0], {
      count: 0,
      additionalProperty: 0,
    });
  });

  it("links operations to the model instead of showing a record", async () => {
    const outputs = await emit(source);
    const create = outputs["bag-api/api/Bags-Create.md"];

    assert.match(
      create,
      /request body of type \[Bag\]\(\.\.\/resources\/Bag\.md\)/,
    );
    assert.ok(!create.includes("Record<string, string>"));
    assert.deepEqual(httpBlocks(create)[0].body, {
      name: "string",
      additionalProperty: "string",
    });
  });

  it("still shows a plain record as a record", async () => {
    const outputs = await emit(source);

    assert.match(outputs["bag-api/api/Bags-Tags.md"], /Record<string, string>/);
  });
});

describe("@encodedName", () => {
  it("uses the JSON wire name in property tables and examples", async () => {
    const outputs = await emit(`
      using Http;
      @service(#{ title: "Label API" })
      namespace Demo;

      model Widget {
        /** Display label. */
        @encodedName("application/json", "display_label") label: string;
      }

      @route("/widgets") interface Widgets {
        @post create(@body body: Widget): Widget;
      }
    `);
    const page = outputs["label-api/resources/Widget.md"];
    const create = outputs["label-api/api/Widgets-Create.md"];

    assert.match(
      page,
      /\| display_label +\| string +\| Yes +\| Display label\. +\|/,
    );
    assert.ok(!/\| label /.test(page));
    assert.deepEqual(jsonBlocks(page)[0], { display_label: "string" });
    for (const block of httpBlocks(create)) {
      assert.deepEqual(block.body, { display_label: "string" });
    }
  });
});

describe("response visibility", () => {
  it("leaves write-only properties out of response examples", async () => {
    const outputs = await emit(`
      using Http;
      @service(#{ title: "Account API" })
      namespace Demo;

      model Account {
        @visibility(Lifecycle.Read) id: string;
        @visibility(Lifecycle.Create) password: string;
        name: string;
      }

      @route("/accounts") interface Accounts {
        @post create(@body body: Account): Account;
      }
    `);
    const [request, response] = httpBlocks(
      outputs["account-api/api/Accounts-Create.md"],
    );

    assert.deepEqual(request.body, { password: "string", name: "string" });
    assert.deepEqual(response.body, { id: "string", name: "string" });
  });
});

describe("scalar samples", () => {
  const source = `
    using Http;
    @service(#{ title: "Sample API" })
    namespace Demo;

    model Sample {
      created: utcDateTime;
      @encode(DateTimeKnownEncoding.rfc7231) modified: utcDateTime;
      @encode(DateTimeKnownEncoding.unixTimestamp, int64) epoch: utcDateTime;
      local: offsetDateTime;
      day: plainDate;
      at: plainTime;
      ttl: duration;
      @encode(DurationKnownEncoding.seconds, int32) ttlSeconds: duration;
      thumbnail: bytes;
      @encode(BytesKnownEncoding.base64url) token: bytes;
      link: url;
      @format("uuid") ownerId: string;
      @format("email") email: string;
      @minLength(10) code: string;
      @maxLength(3) short: string;
      @minValue(1) quantity: int32;
      @maxValue(-5) negative: int32;
      @minValueExclusive(0) positive: float64;
      @encode(string) flag: boolean;
      amount: decimal;
      /** Defaulted. */
      retries?: int32 = 3;
      region?: string = "westus";
    }

    @route("/samples") interface Samples {
      @get read(
        @header ifModifiedSince: utcDateTime,
        @query since: utcDateTime,
      ): Sample;
    }
  `;

  it("renders values a server would accept", async () => {
    const outputs = await emit(source);

    assert.deepEqual(jsonBlocks(outputs["sample-api/resources/Sample.md"])[0], {
      created: "2024-01-15T09:30:00Z",
      modified: "Mon, 15 Jan 2024 09:30:00 GMT",
      epoch: 1705311000,
      local: "2024-01-15T10:30:00+01:00",
      day: "2024-01-15",
      at: "09:30:00",
      ttl: "PT1H30M",
      ttlSeconds: 5400,
      thumbnail: "aGVsbG8gd29ybGQ=",
      token: "aGVsbG8gd29ybGQ",
      link: "https://example.com",
      ownerId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      email: "user@example.com",
      code: "stringssss",
      short: "str",
      quantity: 1,
      negative: -5,
      positive: 1,
      flag: "true",
      amount: 0,
      retries: 3,
      region: "westus",
    });
  });

  it("uses RFC 7231 for a date header and RFC 3339 for a date query", async () => {
    const outputs = await emit(source);
    const [request] = httpBlocks(outputs["sample-api/api/Samples-Read.md"]);

    assert.match(request.head, /since=2024-01-15T09%3A30%3A00Z/);
    assert.match(
      request.head,
      /If-Modified-Since: Mon, 15 Jan 2024 09:30:00 GMT/i,
    );
  });
});

describe("request headers", () => {
  it("lists a declared Content-Type header once", async () => {
    const outputs = await emit(`
      using Http;
      @service(#{ title: "Upload API" })
      namespace Demo;

      @route("/upload") interface Uploads {
        @post upload(@header contentType: "text/plain", @body data: string): void;
      }
    `);
    const [request] = httpBlocks(outputs["upload-api/api/Uploads-Upload.md"]);

    assert.equal(request.head.match(/Content-Type:/gi)?.length, 1);
  });
});
