/**
 * Tests for src/discriminators.ts and the pages built on it — `@discriminator`
 * models and their derived models, `@discriminated` unions, the operations
 * that send or return them, their synthetic examples, and the relation diagram.
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

const petSource = `
  using Http;

  @service(#{ title: "Pets API" })
  namespace Demo;

  enum FishKind { shark, salmon }

  /** A pet. */
  @discriminator("kind")
  model Pet {
    /** Pet id. */
    id: string;
    name: string;
  }

  /** A dog. */
  model Dog extends Pet {
    kind: "dog";
    barkVolume: int32;
  }

  /** A cat. */
  model Cat extends Pet {
    kind: "cat";
    lives: int32;
  }

  /** A fish. */
  @discriminator("fishKind")
  model Fish extends Pet {
    kind: "fish";
  }

  model Shark extends Fish {
    fishKind: FishKind.shark;
    teeth: int32;
  }

  model OddPet extends Pet {
    kind: "odd";
    @body body: string;
  }

  model Owner {
    pets: Pet[];
  }

  @route("/pets") interface Pets {
    @get list(): Pet[];
    @get @route("/{id}") read(@path id: string): Pet;
    @post create(@body pet: Pet): Pet;
    @post @route("/dogs") createDog(@body dog: Dog): Dog;
    @delete @route("/{id}") remove(@path id: string): void;
  }

  @route("/owners") interface Owners {
    @get @route("/{id}") read(@path id: string): Owner;
  }
`;

const unionSource = `
  using Http;

  @service(#{ title: "Shapes API" })
  namespace Demo;

  /** A shape, discriminated without an envelope. */
  @discriminated(#{ discriminatorPropertyName: "type", envelope: "none" })
  union Shape {
    circle: Circle,
    square: Square,
  }

  model Circle { radius: float64; }
  model Square { side: float64; }

  /** An event, discriminated with the default object envelope. */
  @discriminated
  union Event {
    created: Created,
    deleted: Deleted,
  }

  model Created { by: string; }
  model Deleted { reason: string; }

  @route("/shapes") interface Shapes {
    @post draw(@body shape: Shape): Shape;
  }

  @route("/events") interface Events {
    @get list(): Event[];
  }
`;

/** Returns the emitted files with line endings normalized to `\n`. */
function outputsOf(result) {
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

/** Extracts the JSON bodies of the HTTP code blocks of a Markdown page. */
function httpBodies(page) {
  return [...page.matchAll(/```http\n([\s\S]*?)\n```/g)]
    .map((match) => match[1].split("\n\n")[1])
    .filter(Boolean)
    .map((body) => JSON.parse(body));
}

describe("discriminated models", () => {
  it("lists derived types and documents the undeclared discriminator on the base page", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/resources/Pet.md"];

    assert.match(page, /Discriminator: `kind`/);
    assert.match(page, /## Derived types/);
    assert.match(page, /\| `"dog"` +\| \[Dog\]\(Dog\.md\) +\| A dog\. +\|/);
    assert.match(page, /\| `"cat"` +\| \[Cat\]\(Cat\.md\) +\| A cat\. +\|/);
    assert.match(page, /\| `"fish"` +\| \[Fish\]\(Fish\.md\) +\| A fish\. +\|/);
    assert.ok(!page.includes("OddPet"), "envelope models are not variants");
    assert.match(
      page,
      /\| kind +\| "dog" \\\| "cat" \\\| "fish" +\| Yes +\| Discriminator that selects the concrete type\./,
    );
  });

  it("renders one JSON representation per derived type with the discriminator first", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/resources/Pet.md"];

    assert.match(page, /### Dog\n\n`kind`: `"dog"`/);
    const blocks = jsonBlocks(page);
    assert.deepEqual(
      blocks.map((block) => Object.keys(block)[0]),
      ["kind", "kind", "kind"],
    );
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ["dog", "cat", "fish"],
    );
    assert.deepEqual(blocks[0], {
      kind: "dog",
      barkVolume: 0,
      id: "string",
      name: "string",
    });
  });

  it("shows the discriminator value and polymorphic methods on a derived page", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/resources/Cat.md"];

    assert.match(
      page,
      /Discriminator value: `kind` = `"cat"` in \[Pet\]\(Pet\.md\)/,
    );
    assert.match(page, /## Polymorphic methods/);
    for (const method of ["create", "list", "read"]) {
      assert.match(
        page,
        new RegExp(
          `\\| \\[${method}\\]\\(\\.\\./api/Pets-[A-Za-z]+\\.md\\) +\\| \\[Pet\\]\\(Pet\\.md\\)`,
        ),
      );
    }
    assert.ok(!page.includes("[remove]"), "remove does not carry a Pet");
    assert.ok(
      !page.includes("Owners-Read"),
      "nested properties do not make a method polymorphic",
    );
    assert.match(
      page,
      /\| kind +\| "cat" +\| Yes +\| Discriminator\. Always `"cat"` for this type\. +\|/,
    );
  });

  it("does not list a direct method again as polymorphic", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/resources/Dog.md"];
    const polymorphic = page.split("## Polymorphic methods")[1].split("##")[0];

    assert.match(page, /## Methods\n[\s\S]*\[createDog\]/);
    assert.ok(!polymorphic.includes("createDog"));
  });

  it("keeps a declared discriminator on the base without duplicating it", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;
      @service(#{ title: "Pets API" })
      namespace Demo;

      @discriminator("kind")
      model Pet { kind: string; name: string; }
      model Dog extends Pet { kind: "dog"; }

      @get op read(): Pet;
    `);
    const page = outputsOf(result)["pets-api/resources/Pet.md"];

    assert.equal(page.match(/^\| kind /gm)?.length, 1);
    assert.match(
      page,
      /\| kind +\| string +\| Yes +\| Discriminator that selects the concrete type\./,
    );
  });

  it("orders nested discriminators root first and renders enum-member values", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const fish = outputsOf(result)["pets-api/resources/Fish.md"];
    const shark = outputsOf(result)["pets-api/resources/Shark.md"];

    assert.match(fish, /Discriminator: `fishKind`/);
    assert.match(fish, /\| `"shark"` +\| \[Shark\]\(Shark\.md\)/);
    assert.deepEqual(Object.keys(jsonBlocks(fish)[0]).slice(0, 2), [
      "kind",
      "fishKind",
    ]);

    assert.match(
      shark,
      /Discriminator value: `fishKind` = `"shark"` in \[Fish\]\(Fish\.md\)/,
    );
    assert.match(shark, /\[FishKind\]\(FishKind\.md\)\.shark/);
    assert.deepEqual(jsonBlocks(shark)[0], {
      kind: "fish",
      fishKind: "shark",
      teeth: 0,
      id: "string",
      name: "string",
    });
  });
});

describe("discriminated unions", () => {
  it("documents a union without an envelope with the discriminator beside the variant's properties", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(unionSource);
    const page = outputsOf(result)["shapes-api/resources/Shape.md"];

    assert.match(page, /Discriminator: `type`/);
    assert.match(page, /\| `type` +\| Type +\| Summary +\|/);
    assert.match(page, /\| `"circle"` +\| \[Circle\]\(Circle\.md\)/);
    assert.deepEqual(jsonBlocks(page), [
      { type: "circle", radius: 0 },
      { type: "square", side: 0 },
    ]);
  });

  it("wraps each variant of a union with an object envelope", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(unionSource);
    const page = outputsOf(result)["shapes-api/resources/Event.md"];

    assert.match(page, /`value` holds it/);
    assert.deepEqual(jsonBlocks(page), [
      { kind: "created", value: { by: "string" } },
      { kind: "deleted", value: { reason: "string" } },
    ]);
  });

  it("shows the discriminator value on a variant's page", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(unionSource);
    const page = outputsOf(result)["shapes-api/resources/Square.md"];

    assert.match(
      page,
      /Discriminator value: `type` = `"square"` in \[Shape\]\(Shape\.md\)/,
    );
  });

  it("leaves plain unions unchanged", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      @service(#{ title: "Plain API" })
      namespace Demo;
      union Mode { fast: "fast", slow: "slow" }
      op read(mode: Mode): void;
    `);
    const page = outputsOf(result)["plain-api/resources/Mode.md"];

    assert.match(page, /\| Name +\| Type +\| Summary +\|/);
    assert.ok(!page.includes("Discriminator"));
  });
});

describe("operations with polymorphic payloads", () => {
  it("builds one valid example per variant and pairs request and response", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/api/Pets-Create.md"];

    assert.match(page, /### Example 1: Dog/);
    assert.match(page, /### Example 2: Cat/);
    assert.match(page, /### Example 3: Fish/);
    const bodies = httpBodies(page);
    assert.deepEqual(
      bodies.map((body) => body.kind),
      ["dog", "dog", "cat", "cat", "fish", "fish"],
    );
    assert.equal(bodies[4].fishKind, "shark");
  });

  it("puts the discriminator in the request body example", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/api/Pets-Create.md"];
    const requestBody = page
      .split("## Request body")[1]
      .split("## Response")[0];

    assert.match(
      requestBody,
      /is polymorphic: `kind` selects `"dog"` for \[Dog\]\(\.\.\/resources\/Dog\.md\)/,
    );
    assert.equal(jsonBlocks(requestBody)[0].kind, "dog");
  });

  it("lists every variant in a polymorphic array response", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/api/Pets-List.md"];

    assert.match(page, /### Example 1\n/);
    assert.ok(!page.includes("### Example 2"));
    assert.deepEqual(
      httpBodies(page)[0].map((item) => item.kind),
      ["dog", "cat", "fish"],
    );
  });

  it("summarizes polymorphic payloads on the operation page", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(unionSource);
    const draw = outputsOf(result)["shapes-api/api/Shapes-Draw.md"];
    const list = outputsOf(result)["shapes-api/api/Events-List.md"];

    assert.match(
      draw,
      /## Polymorphic payloads\n\n- \[Shape\]\(\.\.\/resources\/Shape\.md\): `type` selects `"circle"` for \[Circle\]/,
    );
    assert.deepEqual(
      httpBodies(draw).map((body) => body.type),
      ["circle", "circle", "square", "square"],
    );
    assert.deepEqual(httpBodies(list)[0], [
      { kind: "created", value: { by: "string" } },
      { kind: "deleted", value: { reason: "string" } },
    ]);
  });

  it("puts the discriminator in nested polymorphic properties", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(petSource);
    const page = outputsOf(result)["pets-api/resources/Owner.md"];

    assert.deepEqual(
      jsonBlocks(page)[0].pets.map((pet) => pet.kind),
      ["dog", "cat", "fish"],
    );
  });

  it("omits the polymorphic payloads section for plain payloads", async () => {
    const result = await tester.emit("@massivescale/tsp-api-docs").compile(`
      using Http;
      @service(#{ title: "Plain API" })
      namespace Demo;
      model Widget { name: string; }
      @get op read(): Widget;
    `);

    assert.ok(
      !outputsOf(result)["plain-api/api/Read.md"].includes(
        "Polymorphic payloads",
      ),
    );
  });
});

describe("discriminated types in the relation diagram", () => {
  it("links derived models to their base and shows only their own properties", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", { "emit-relation-diagram": true })
      .compile(petSource);
    const diagram = outputsOf(result)["pets-api/relation-diagram.md"];

    assert.match(diagram, /Dog \|o\.\.\|\| Pet : "extends \(kind = dog\)"/);
    assert.match(
      diagram,
      /Shark \|o\.\.\|\| Fish : "extends \(fishKind = shark\)"/,
    );
    assert.match(
      diagram,
      /Pet \{\n {4}string kind "discriminator"\n {4}string id\n {4}string name\n {2}\}/,
    );
    assert.match(
      diagram,
      /Dog \{\n {4}string kind "discriminator"\n {4}int32 barkVolume\n {2}\}/,
    );
  });

  it("links a discriminated union to its variants", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", { "emit-relation-diagram": true })
      .compile(unionSource);
    const diagram = outputsOf(result)["shapes-api/relation-diagram.md"];

    assert.match(diagram, /Shape \{\n {4}string type "discriminator"\n {2}\}/);
    assert.match(diagram, /Circle \|o\.\.\|\| Shape : "type = circle"/);
    assert.match(diagram, /Created \|o\.\.\|\| Event : "kind = created"/);
  });
});

describe("discriminated types in versioned services", () => {
  it("lists only the derived types of each version", async () => {
    const result = await versionedTester.emit("@massivescale/tsp-api-docs")
      .compile(`
        using Http;
        using Versioning;

        @service(#{ title: "Pets API" })
        @versioned(Versions)
        namespace Demo;

        enum Versions { v1, v2 }

        @discriminator("kind")
        model Pet { name: string; }
        model Dog extends Pet { kind: "dog"; }
        @added(Versions.v2)
        model Cat extends Pet { kind: "cat"; }

        @get op read(): Pet;
      `);

    const v1 = outputsOf(result)["v1/resources/Pet.md"];
    const v2 = outputsOf(result)["v2/resources/Pet.md"];
    assert.ok(v1.includes("[Dog](Dog.md)"));
    assert.ok(!v1.includes("Cat"));
    assert.ok(v2.includes("[Cat](Cat.md)"));
    assert.match(
      outputsOf(result)["v2/resources/Cat.md"],
      /Discriminator value: `kind` = `"cat"` in \[Pet\]\(Pet\.md\)/,
    );
  });
});
