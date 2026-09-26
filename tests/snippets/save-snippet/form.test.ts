import { describe, expect, it } from "vitest";
import { resolveSnippetSave } from "../../../src/snippets/save-snippet/form";

const dataSources = [
  { id: "ds-1", title: "Snippets" },
  { id: "ds-2", title: "Work Snippets" },
];

function save(...args: Parameters<typeof resolveSnippetSave>) {
  const resolved = resolveSnippetSave(...args);
  if ("error" in resolved) {
    throw new Error(`unexpected error: ${resolved.error}`);
  }
  return resolved.save;
}

describe("保存先", () => {
  it("選んだ id のデータソースを返す", () => {
    expect(save({ dataSourceId: "ds-2", body: "body" }, dataSources).dataSource).toEqual(dataSources[1]);
  });

  it("未選択、または選択中に無い id ならエラー", () => {
    expect(resolveSnippetSave({ body: "body" }, dataSources)).toEqual({ error: "Select a database" });
    expect(resolveSnippetSave({ dataSourceId: "ds-9", body: "body" }, dataSources)).toEqual({
      error: "Select a database",
    });
  });

  it("保存先エラーは本文エラーより先に返す", () => {
    expect(resolveSnippetSave({ body: "   " }, dataSources)).toEqual({ error: "Select a database" });
  });
});

describe("本文", () => {
  it("入力した本文をそのまま返す（前後の空白も保つ）", () => {
    expect(save({ dataSourceId: "ds-1", body: "  SELECT 1;\n" }, dataSources).body).toBe("  SELECT 1;\n");
  });

  it("空、空白だけならエラー", () => {
    expect(resolveSnippetSave({ dataSourceId: "ds-1", body: "   " }, dataSources)).toEqual({
      error: "Snippet body is empty",
    });
    expect(resolveSnippetSave({ dataSourceId: "ds-1" }, dataSources)).toEqual({ error: "Snippet body is empty" });
  });
});

describe("タイトル", () => {
  it("空欄なら Untitled、2000字で切る", () => {
    expect(save({ dataSourceId: "ds-1", body: "body", title: "  " }, dataSources).title).toBe("Untitled");
    expect(save({ dataSourceId: "ds-1", body: "body", title: "a".repeat(2100) }, dataSources).title).toHaveLength(2000);
  });
});

describe("タグ", () => {
  it("選択と新規名を渡す", () => {
    expect(save({ dataSourceId: "ds-1", body: "body", tags: ["tag-1"], newTags: "tech" }, dataSources).tags).toEqual({
      selectedIds: ["tag-1"],
      newNames: ["tech"],
    });
  });
});
