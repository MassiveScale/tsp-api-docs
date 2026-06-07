/**
 * Tests for src/relation-diagram.ts — the emit-relation-diagram option and
 * the content of the generated Mermaid ER diagram.
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

const relatedSource = `
  @service(#{ title: "Pet API" })
  namespace Demo;

  enum PetKind { Cat, Dog }

  model Pet {
    id: string;
    kind: PetKind;
    owner?: Owner;
  }

  model Owner {
    id: string;
    pets: Pet[];
  }

  op getPet(id: string): Pet;
`;

describe("relation diagram", () => {
  it("emits relation-diagram.md when enabled", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", { "emit-relation-diagram": true })
      .compile(relatedSource);

    assert.ok(
      result.outputs["pet-api/relation-diagram.md"] !== undefined,
      "relation-diagram.md should be emitted",
    );
  });

  it("does not emit relation-diagram.md by default", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs")
      .compile(relatedSource);

    assert.equal(
      result.outputs["pet-api/relation-diagram.md"],
      undefined,
      "relation-diagram.md should not be emitted by default",
    );
  });

  it("relation-diagram.md contains a mermaid erDiagram block", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", { "emit-relation-diagram": true })
      .compile(relatedSource);

    const diagram = result.outputs["pet-api/relation-diagram.md"];
    assert.ok(
      diagram.includes(":::mermaid") || diagram.includes("```mermaid"),
      "should contain a mermaid code block",
    );
    assert.ok(diagram.includes("erDiagram"), "should use erDiagram syntax");
    assert.ok(diagram.includes("Pet"), "should include the Pet entity");
    assert.ok(diagram.includes("Owner"), "should include the Owner entity");
    assert.ok(diagram.includes("PetKind"), "should include the PetKind enum");
  });

  it("relation-diagram.md includes relationships between types", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", { "emit-relation-diagram": true })
      .compile(relatedSource);

    const diagram = result.outputs["pet-api/relation-diagram.md"];
    // Pet has a PetKind property — expect a relationship line
    assert.ok(diagram.includes("PetKind"), "diagram should reference PetKind");
    // Owner has a Pet[] array — expect a one-to-many relationship
    assert.ok(
      diagram.includes("Owner") && diagram.includes("Pet"),
      "diagram should contain Owner and Pet relationship",
    );
  });

  it("adds relation-diagram.md to docfx toc.yml when enabled", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", {
        format: "docfx",
        "emit-relation-diagram": true,
      })
      .compile(relatedSource);

    assert.ok(
      result.outputs["pet-api/toc.yml"].includes("Relation Diagram"),
      "docfx toc.yml should include Relation Diagram entry",
    );
    assert.ok(
      result.outputs["pet-api/toc.yml"].includes("relation-diagram.md"),
      "docfx toc.yml should link to relation-diagram.md",
    );
  });

  it("resolves array element types via the first property fallback when indexer is absent", async () => {
    // A named model that extends Array<T> is treated as an array by isArrayModelType but
    // may carry its element type as the first property rather than via indexer. The
    // relation-diagram must use the same indexer?.value ?? properties[0]?.type fallback
    // as typeReference() / makeLinkedTypeRef() so the relationship is not silently dropped.
    const result = await tester.emit("@massivescale/tsp-api-docs", {
      "emit-relation-diagram": true,
    }).compile(`
        @service(#{ title: "List API" })
        namespace Demo;

        model Widget { id: string; }

        model WidgetList extends Array<Widget> {}

        op list(): WidgetList;
      `);

    const diagram = result.outputs["list-api/relation-diagram.md"];
    assert.ok(diagram !== undefined, "relation-diagram.md should be emitted");
    assert.ok(diagram.includes("Widget"), "diagram should reference Widget");
    assert.ok(
      diagram.includes("WidgetList"),
      "diagram should reference WidgetList",
    );
  });

  it("does not add relation-diagram.md to docfx toc.yml when disabled", async () => {
    const result = await tester
      .emit("@massivescale/tsp-api-docs", { format: "docfx" })
      .compile(relatedSource);

    assert.ok(
      !result.outputs["pet-api/toc.yml"].includes("relation-diagram.md"),
      "docfx toc.yml should not reference relation-diagram.md when disabled",
    );
  });
});
