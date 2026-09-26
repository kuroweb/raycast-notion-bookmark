import { describe, expect, it } from "vitest";
import { LoadedSnippet, SnippetFormValues, resolveSnippetEdit } from "../../../src/snippets/edit-snippet/form";

const loaded: LoadedSnippet = { bodyTooLarge: false, tagsIncomplete: false };
const dataSources = [
  { id: "ds-1", title: "Snippet" },
  { id: "ds-2", title: "Work" },
];

/** 保存先の指定は既定で ds-1。データベース以外の解決を確かめるテストを短く書くための入口。 */
function resolve(values: SnippetFormValues, loadedArg: LoadedSnippet = loaded, canEditTags = false) {
  return resolveSnippetEdit({ dataSourceId: "ds-1", ...values }, loadedArg, canEditTags, dataSources);
}

function edit(values: SnippetFormValues, loadedArg: LoadedSnippet = loaded, canEditTags = false) {
  const resolved = resolve(values, loadedArg, canEditTags);
  if ("error" in resolved) {
    throw new Error(`unexpected error: ${resolved.error}`);
  }
  return resolved.edit;
}

describe("保存先", () => {
  it("選んだデータベースを返す", () => {
    expect(edit({ dataSourceId: "ds-2", body: "body" }).dataSource).toEqual({ id: "ds-2", title: "Work" });
  });

  it("選択肢にないデータベースはエラーを返す", () => {
    expect(resolveSnippetEdit({ dataSourceId: "ds-9", body: "body" }, loaded, false, dataSources)).toEqual({
      error: "Select a database",
    });
  });
});

describe("本文", () => {
  it("入力した本文をそのまま送る", () => {
    expect(edit({ body: "SELECT 1;" }, loaded, false).body).toBe("SELECT 1;");
  });

  it("空白だけならエラーを返す", () => {
    expect(resolve({ body: "   " })).toEqual({ error: "Snippet body is empty" });
    expect(resolve({})).toEqual({ error: "Snippet body is empty" });
  });

  it("大きすぎて編集できないときは本文を触らず、空でもエラーにしない", () => {
    const bodyTooLarge = { ...loaded, bodyTooLarge: true };
    expect(edit({ title: "Title" }, bodyTooLarge, false).body).toBeUndefined();
  });
});

describe("タイトル", () => {
  it("前後の空白を落とす", () => {
    expect(edit({ title: "  Title  ", body: "body" }, loaded, false).title).toBe("Title");
  });

  it("空欄なら Untitled", () => {
    expect(edit({ title: "   ", body: "body" }, loaded, false).title).toBe("Untitled");
    expect(edit({ body: "body" }, loaded, false).title).toBe("Untitled");
  });

  it("2000字で切る", () => {
    expect(edit({ title: "a".repeat(2100), body: "body" }, loaded, false).title).toHaveLength(2000);
  });
});

describe("タグ", () => {
  it("タグを編集できるときは選択と新規名を渡す", () => {
    expect(edit({ body: "body", tags: ["tag-1"], newTags: "tech、notion" }, loaded, true).tags).toEqual({
      selectedIds: ["tag-1"],
      newNames: ["tech", "notion"],
    });
  });

  it("Tags データベースが読めない、またはタグが多すぎるときは触らない", () => {
    expect(edit({ body: "body", tags: ["tag-1"] }, loaded, false).tags).toBeUndefined();
    expect(edit({ body: "body", tags: ["tag-1"] }, { ...loaded, tagsIncomplete: true }, true).tags).toBeUndefined();
  });
});
