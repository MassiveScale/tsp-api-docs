/**
 * Tests for src/property-details.ts — the default, visibility, deprecation,
 * secret, format, length, pattern, range, item-count, and encoding notes in
 * property and parameter tables, and the constraints line on scalar pages.
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

const source = `
  using Http;
  @service(#{ title: "Rules API" })
  namespace Demo;

  /** A stock-keeping unit. */
  @pattern("^[A-Z]{3}-\\\\d+$")
  @maxLength(12)
  scalar Sku extends string;

  @secret scalar ApiToken extends string;

  model Widget {
    /** Identifier. */
    @visibility(Lifecycle.Read) id: string;
    @visibility(Lifecycle.Create) password: string;
    @visibility(Lifecycle.Read, Lifecycle.Create) region: string;
    /** Display name */
    @minLength(3) @maxLength(50) name: string;
    @minLength(4) code: string;
    @maxLength(4) short: string;
    sku: Sku;
    count?: int32 = 5;
    mode?: "fast" | "slow" = "fast";
    @minValue(0) @maxValue(100) percent: float32;
    @minValueExclusive(0) @maxValueExclusive(10) ratio: float64;
    @encode(DateTimeKnownEncoding.rfc7231) modified: utcDateTime;
    @encode(DurationKnownEncoding.seconds, int32) ttl: duration;
    @secret apiKey: string;
    token: ApiToken;
    #deprecated "Use name."
    oldName?: string;
    @minItems(1) @maxItems(3) parts: string[];
    @minItems(2) pairs: string[];
    @format("uuid") ownerId: string;
    plain: string;
  }

  @route("/widgets") interface Widgets {
    @get list(
      @query @maxValue(100) top?: int32 = 25,
      @header @pattern("^v\\\\d$") version: string,
    ): Widget[];
  }
`;

/** Compiles `source` and returns the emitted files with `\n` line endings. */
async function emit() {
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

/** Returns the Summary cell of the `name` row in a Markdown table. */
function summaryOf(page, name) {
  const row = page
    .split("\n")
    .find((line) => new RegExp(`^\\| ${name} +\\|`).test(line));
  assert.ok(row, `row ${name} exists`);
  return row
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .at(-1)
    .trim();
}

describe("property rules on type pages", () => {
  const cases = [
    ["id", "Identifier. Read-only."],
    ["password", "Write-only; never returned."],
    ["region", "Set on create; can't be changed."],
    ["name", "Display name. 3 to 50 characters."],
    ["code", "At least 4 characters."],
    ["short", "At most 4 characters."],
    ["sku", "At most 12 characters. Must match `^[A-Z]{3}-\\d+$`."],
    ["count", "Default: `5`."],
    ["mode", 'Default: `"fast"`.'],
    ["percent", "Minimum 0, maximum 100."],
    ["ratio", "Greater than 0, less than 10."],
    ["modified", "Encoded as `rfc7231`."],
    ["ttl", "Encoded as `seconds` (`int32`)."],
    ["apiKey", "Sensitive: treat as a secret."],
    ["token", "Sensitive: treat as a secret."],
    ["oldName", "Deprecated: Use name."],
    ["parts", "1 to 3 items."],
    ["pairs", "At least 2 items."],
    ["ownerId", "Format: `uuid`."],
    ["plain", "No summary provided."],
  ];

  for (const [name, expected] of cases) {
    it(`describes ${name}`, async () => {
      const outputs = await emit();
      assert.equal(
        summaryOf(outputs["rules-api/resources/Widget.md"], name),
        expected,
      );
    });
  }

  it("does not prefix rules with the fallback summary", async () => {
    const outputs = await emit();
    const page = outputs["rules-api/resources/Widget.md"];

    assert.doesNotMatch(page, /No summary provided. [A-Z]/);
  });
});

describe("parameter rules on operation pages", () => {
  it("describes query and header constraints and defaults", async () => {
    const outputs = await emit();
    const page = outputs["rules-api/api/Widgets-List.md"];

    assert.equal(summaryOf(page, "top"), "Default: `25`. Maximum 100.");
    assert.equal(summaryOf(page, "version"), "Must match `^v\\d$`.");
  });
});

describe("scalar pages", () => {
  it("lists a scalar's own constraints", async () => {
    const outputs = await emit();
    const page = outputs["rules-api/resources/Sku.md"];

    assert.match(
      page,
      /Constraints: At most 12 characters\. Must match `\^\[A-Z\]\{3\}-\\d\+\$`\./,
    );
  });
});

describe("table cells", () => {
  it("does not double backslashes inside code spans", async () => {
    const outputs = await emit();

    assert.ok(!outputs["rules-api/resources/Widget.md"].includes("\\\\d"));
  });
});
