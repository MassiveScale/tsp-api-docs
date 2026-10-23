/**
 * Edge cases in generated payloads: renamed discriminators, nested
 * discriminator memberships, additional-property keys, array item bounds,
 * encoded and null defaults, length-bounded formats, and numeric intervals.
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

/** Wraps model declarations in a service with one operation returning `type`. */
function service(declarations, type) {
  return `
    using Http;
    @service(#{ title: "Edge API" })
    namespace Demo;
    ${declarations}
    @get op read(): ${type};
  `;
}

describe("discriminator renamed with @encodedName", () => {
  it("uses the wire name for the discriminator everywhere", async () => {
    const outputs = await emit(
      service(
        `
        @discriminator("kind")
        model Pet { name: string; }
        model Dog extends Pet {
          @encodedName("application/json", "pet_type") kind: "dog";
        }
        `,
        "Pet",
      ),
    );
    const page = outputs["edge-api/resources/Pet.md"];

    assert.deepEqual(jsonBlocks(page)[0], { pet_type: "dog", name: "string" });
    assert.match(page, /Discriminator: `pet_type`/);
    assert.match(page, /\| `pet_type` +\| Type +\| Summary +\|/);
    assert.match(page, /^\| pet_type +\|/m);
    assert.ok(!/\bkind\b/.test(page.split("## Properties")[1]));
  });
});

describe("nested discriminator memberships", () => {
  it("lists the outer discriminator value through an intermediate model", async () => {
    const outputs = await emit(
      service(
        `
        @discriminator("kind")
        model Pet { name: string; }
        @discriminator("fishKind")
        model Fish extends Pet { kind: "fish"; }
        model Shark extends Fish { fishKind: "shark"; }
        `,
        "Pet",
      ),
    );
    const page = outputs["edge-api/resources/Shark.md"];

    assert.match(
      page,
      /Discriminator value: `fishKind` = `"shark"` in \[Fish\]\(Fish\.md\)/,
    );
    assert.match(
      page,
      /Discriminator value: `kind` = `"fish"` in \[Pet\]\(Pet\.md\)/,
    );
  });
});

describe("additional property keys", () => {
  it("never overwrites a declared property", async () => {
    const outputs = await emit(
      service(
        `model Bag { additionalProperty: "fixed"; ...Record<string>; }`,
        "Bag",
      ),
    );

    assert.deepEqual(jsonBlocks(outputs["edge-api/resources/Bag.md"])[0], {
      additionalProperty: "fixed",
      additionalProperty2: "string",
    });
  });
});

describe("array item bounds", () => {
  const declarations = `
    @discriminator("kind")
    model Pet { name: string; }
    model Dog extends Pet { kind: "dog"; }
    model Cat extends Pet { kind: "cat"; }
    model Fish extends Pet { kind: "fish"; }
    model Owner {
      @maxItems(1) favourites: Pet[];
      @minItems(5) history: Pet[];
      @minItems(2) tags: string[];
      @maxItems(0) none: string[];
    }
  `;

  it("keeps polymorphic and plain arrays within their bounds", async () => {
    const outputs = await emit(service(declarations, "Owner"));
    const owner = jsonBlocks(outputs["edge-api/resources/Owner.md"])[0];

    assert.deepEqual(
      owner.favourites.map((pet) => pet.kind),
      ["dog"],
    );
    assert.deepEqual(
      owner.history.map((pet) => pet.kind),
      ["dog", "cat", "fish", "dog", "cat"],
    );
    assert.deepEqual(owner.tags, ["string", "string"]);
    assert.deepEqual(owner.none, []);
  });
});

describe("declared defaults", () => {
  const declarations = `
    model Settings {
      @encode(string) active?: boolean = true;
      @encode(string) retries?: int32 = 3;
      nickname?: string | null = null;
      @encode(DateTimeKnownEncoding.rfc7231)
      since?: utcDateTime = utcDateTime.fromISO("2024-01-15T09:30:00Z");
    }
  `;

  it("serializes defaults in the property's wire encoding", async () => {
    const outputs = await emit(service(declarations, "Settings"));
    const settings = jsonBlocks(outputs["edge-api/resources/Settings.md"])[0];

    assert.equal(settings.active, "true");
    assert.equal(settings.retries, "3");
    assert.equal(settings.since, "Mon, 15 Jan 2024 09:30:00 GMT");
  });

  it("keeps a declared null default", async () => {
    const outputs = await emit(service(declarations, "Settings"));
    const page = outputs["edge-api/resources/Settings.md"];

    assert.equal(jsonBlocks(page)[0].nickname, null);
    assert.match(page, /\| nickname +\|.*Default: `null`\./);
    assert.match(page, /\| active +\|.*Default: `"true"`\./);
  });
});

describe("formats with length bounds", () => {
  it("builds format samples that fit the length bounds", async () => {
    const outputs = await emit(
      service(
        `
        model Contact {
          @format("email") @maxLength(12) shortEmail: string;
          @format("email") @minLength(30) longEmail: string;
          @format("uri") @minLength(40) link: string;
          @format("hostname") @maxLength(8) host: string;
          @format("hostname") @minLength(150) longHost: string;
        }
        `,
        "Contact",
      ),
    );
    const contact = jsonBlocks(outputs["edge-api/resources/Contact.md"])[0];

    assert.ok(contact.shortEmail.length <= 12);
    assert.match(contact.shortEmail, /^[^@]+@[^@]+\.[a-z]+$/);
    assert.ok(contact.longEmail.length >= 30);
    assert.match(contact.longEmail, /^[^@]+@[^@]+\.[a-z]+$/);
    assert.ok(contact.link.length >= 40);
    assert.match(contact.link, /^https:\/\/[^/]+\//);
    assert.ok(contact.host.length <= 8);
    assert.ok(contact.longHost.length >= 150);
    for (const label of contact.longHost.split(".")) {
      assert.ok(label.length >= 1 && label.length <= 63, `label ${label}`);
    }
  });
});

describe("numeric intervals", () => {
  it("chooses a value inside every bound", async () => {
    const outputs = await emit(
      service(
        `
        model Ranges {
          @minValueExclusive(0) @maxValueExclusive(1) fraction: float64;
          @minValueExclusive(0) @maxValueExclusive(2) between: int32;
          @minValue(5) @maxValue(5) exact: int32;
          @minValueExclusive(2) above: int32;
          @maxValueExclusive(-3) below: int32;
          @minValue(10) @maxValueExclusive(11) narrow: float32;
        }
        `,
        "Ranges",
      ),
    );
    const ranges = jsonBlocks(outputs["edge-api/resources/Ranges.md"])[0];

    assert.deepEqual(ranges, {
      fraction: 0.5,
      between: 1,
      exact: 5,
      above: 3,
      below: -4,
      narrow: 10,
    });
  });
});
