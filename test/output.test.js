import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AZURE_DEVOPS_TOC,
  cleanDocFiles,
  formatAzureDevOpsPage,
} from "../dist/src/output.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "tsp-api-docs-test-"));
}

describe("cleanDocFiles", () => {
  it("removes the entire output directory for azure-devops format", async () => {
    const dir = await makeTempDir();
    try {
      await writeFile(join(dir, "some-file.md"), "content");
      await cleanDocFiles(dir, "azure-devops");
      await assert.rejects(
        stat(dir),
        "entire output directory should be deleted for azure-devops format",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("removes the entire output directory for github format", async () => {
    const dir = await makeTempDir();
    try {
      await writeFile(join(dir, "README.md"), "content");
      await cleanDocFiles(dir, "github");
      await assert.rejects(
        stat(dir),
        "entire output directory should be deleted for github format",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("removes non-project files for docfx format but preserves docfx.json", async () => {
    const dir = await makeTempDir();
    try {
      const docfxContent = '{"build": {"preserved": true}}';
      await writeFile(join(dir, "docfx.json"), docfxContent);
      await writeFile(join(dir, "index.md"), "content");
      await mkdir(join(dir, "widget-api"), { recursive: true });
      await writeFile(join(dir, "widget-api", "index.md"), "nested content");

      await cleanDocFiles(dir, "docfx");

      const preserved = await readFile(join(dir, "docfx.json"), "utf8");
      assert.equal(preserved, docfxContent, "docfx.json should be preserved");
      await assert.rejects(
        stat(join(dir, "index.md")),
        "index.md should be deleted",
      );
      await assert.rejects(
        stat(join(dir, "widget-api")),
        "subdirectory should be deleted",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rethrows non-ENOENT errors from readdir (docfx format)", async () => {
    // Place a plain file where a directory is expected so readdir fails with ENOTDIR.
    const path = join(tmpdir(), `tsp-api-docs-notdir-${Date.now()}`);
    await writeFile(path, "not a directory");
    try {
      await assert.rejects(
        cleanDocFiles(path, "docfx"),
        (err) => err.code === "ENOTDIR",
        "should rethrow ENOTDIR — only ENOENT should be suppressed",
      );
    } finally {
      await rm(path, { force: true });
    }
  });

  it("does nothing when the directory does not exist (azure-devops)", async () => {
    const dir = join(tmpdir(), `tsp-api-docs-nonexistent-${Date.now()}`);
    await assert.doesNotReject(
      cleanDocFiles(dir, "azure-devops"),
      "should not throw when directory does not exist",
    );
  });

  it("does nothing when the directory does not exist (docfx)", async () => {
    const dir = join(tmpdir(), `tsp-api-docs-nonexistent-${Date.now()}`);
    await assert.doesNotReject(
      cleanDocFiles(dir, "docfx"),
      "should not throw when directory does not exist for docfx format",
    );
  });
});

describe("formatAzureDevOpsPage", () => {
  it("removes the title and the blank lines after it", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\nSummary\n", false),
      "Summary\n",
    );
  });

  it("removes a title that follows leading blank lines", () => {
    assert.equal(
      formatAzureDevOpsPage("\n\n# Title\n\nSummary\n", false),
      "Summary\n",
    );
  });

  it("promotes every heading below the title by one level", () => {
    const input = [
      "# Title",
      "",
      "## Two",
      "### Three",
      "#### Four",
      "##### Five",
      "###### Six",
      "##",
      "",
    ].join("\n");
    assert.equal(
      formatAzureDevOpsPage(input, false),
      ["# Two", "## Three", "### Four", "#### Five", "##### Six", "#", ""].join(
        "\n",
      ),
    );
  });

  it("keeps a later level-1 heading at level 1", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n## Section\n\n# Other\n", false),
      "# Section\n\n# Other\n",
    );
  });

  it("promotes indented headings and keeps their indentation", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n   ## Section\n", false),
      "   # Section\n",
    );
  });

  it("does not treat a hash without a following space as a heading", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n##hashtag\n#######\n", true),
      "##hashtag\n#######\n",
    );
  });

  it("does not treat a four-space indented hash as a heading", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n    ## code\n", true),
      "    ## code\n",
    );
  });

  it("leaves a page that does not start with a level-1 heading unchanged", () => {
    const input = "Summary\n\n# Section\n\n## Sub\n";
    assert.equal(formatAzureDevOpsPage(input, false), input);
  });

  it("does not remove a level-2 heading at the top of the page", () => {
    const input = "## Section\n\nText\n";
    assert.equal(formatAzureDevOpsPage(input, false), input);
  });

  it("returns an empty page when the page only has a title", () => {
    assert.equal(formatAzureDevOpsPage("# Title\n\n", false), "");
    assert.equal(formatAzureDevOpsPage("# Title", true), "");
  });

  it("returns an empty page unchanged", () => {
    assert.equal(formatAzureDevOpsPage("", true), "");
  });

  it("inserts the table of contents immediately before the first heading", () => {
    assert.equal(
      formatAzureDevOpsPage(
        "# Title\n\nSummary\n\nVersion: 1\n\n## One\n\n## Two\n",
        true,
      ),
      `Summary\n\nVersion: 1\n\n${AZURE_DEVOPS_TOC}\n\n# One\n\n# Two\n`,
    );
  });

  it("inserts the table of contents at the top when a section heading comes first", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n## One\n", true),
      `${AZURE_DEVOPS_TOC}\n\n# One\n`,
    );
  });

  it("inserts the table of contents on a page without a title", () => {
    assert.equal(
      formatAzureDevOpsPage("Intro\n\n## One\n", true),
      `Intro\n\n${AZURE_DEVOPS_TOC}\n\n## One\n`,
    );
  });

  it("omits the table of contents when no heading remains", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n| A |\n| - |\n", true),
      "| A |\n| - |\n",
    );
  });

  it("omits the table of contents when it is disabled", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n## One\n", false),
      "# One\n",
    );
  });

  for (const [name, open, close] of [
    ["backtick", "```http", "```"],
    ["tilde", "~~~", "~~~"],
    ["mermaid", ":::mermaid", ":::"],
  ]) {
    it(`ignores headings inside a ${name} fence`, () => {
      const input = `# Title\n\n${open}\n## Not a heading\n${close}\n\n## Real\n`;
      assert.equal(
        formatAzureDevOpsPage(input, true),
        `${open}\n## Not a heading\n${close}\n\n${AZURE_DEVOPS_TOC}\n\n# Real\n`,
      );
    });
  }

  it("keeps a fence open until a closing fence at least as long", () => {
    const input = [
      "# Title",
      "",
      "````markdown",
      "```",
      "## Inside",
      "~~~~",
      "`````",
      "## Outside",
      "",
    ].join("\n");
    assert.equal(
      formatAzureDevOpsPage(input, false),
      [
        "````markdown",
        "```",
        "## Inside",
        "~~~~",
        "`````",
        "# Outside",
        "",
      ].join("\n"),
    );
  });

  it("does not close a fence on a line with text after the marker", () => {
    assert.equal(
      formatAzureDevOpsPage(
        "# Title\n\n```\n``` text\n## Inside\n```\n",
        false,
      ),
      "```\n``` text\n## Inside\n```\n",
    );
  });

  it("treats the rest of the page as code when a fence is never closed", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n```\n## Inside\n", true),
      "```\n## Inside\n",
    );
  });

  it("does not close a fence on a marker indented four or more spaces", () => {
    const input = "# Title\n\n````\n    ````\n## Inside\n````\n\n## Outside\n";
    assert.equal(
      formatAzureDevOpsPage(input, true),
      `\`\`\`\`\n    \`\`\`\`\n## Inside\n\`\`\`\`\n\n${AZURE_DEVOPS_TOC}\n\n# Outside\n`,
    );
  });

  it("closes a fence on a marker followed by trailing whitespace", () => {
    assert.equal(
      formatAzureDevOpsPage(
        "# Title\n\n```\n## Inside\n``` \t\n## Outside\n",
        false,
      ),
      "```\n## Inside\n``` \t\n# Outside\n",
    );
  });

  it("does not close a fence on a different marker character", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n```\n~~~\n## Inside\n```\n", false),
      "```\n~~~\n## Inside\n```\n",
    );
  });

  for (const marker of ["-", "*", "+", "1.", "2)"]) {
    it(`ignores headings inside a fence opened on a "${marker}" list item`, () => {
      const indent = " ".repeat(marker.length + 1);
      const input = `# Title\n\n${marker} \`\`\`md\n${indent}## Literal\n${indent}\`\`\`\n\n## Real\n`;
      assert.equal(
        formatAzureDevOpsPage(input, true),
        `${marker} \`\`\`md\n${indent}## Literal\n${indent}\`\`\`\n\n${AZURE_DEVOPS_TOC}\n\n# Real\n`,
      );
    });
  }

  it("ignores headings inside a fence opened on a nested list item", () => {
    const input = "# Title\n\n- - ```\n    ## Literal\n    ```\n\n## Real\n";
    assert.equal(
      formatAzureDevOpsPage(input, false),
      "- - ```\n    ## Literal\n    ```\n\n# Real\n",
    );
  });

  it("does not close a list-item fence on a marker indented past its content", () => {
    const input =
      "# Title\n\n- ```\n      ```\n  ## Literal\n  ```\n\n## Real\n";
    assert.equal(
      formatAzureDevOpsPage(input, false),
      "- ```\n      ```\n  ## Literal\n  ```\n\n# Real\n",
    );
  });

  it("keeps each line's own line ending", () => {
    assert.equal(
      formatAzureDevOpsPage(
        "# Title\r\n\r\nSummary\n\r\n## One\r\nText\n## Two\n",
        true,
      ),
      `Summary\n\r\n${AZURE_DEVOPS_TOC}\r\n\r\n# One\r\nText\n# Two\n`,
    );
  });

  it("uses a line feed for the table of contents when the heading is the last line", () => {
    assert.equal(
      formatAzureDevOpsPage("# Title\n\n## One", true),
      `${AZURE_DEVOPS_TOC}\n\n# One`,
    );
  });
});
