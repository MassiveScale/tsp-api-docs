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
import { cleanDocFiles } from "../dist/src/output.js";

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
