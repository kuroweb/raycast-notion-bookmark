import { describe, expect, it } from "vitest";
import { LoadedSnippet, resolveSnippetEdit } from "../../../src/snippets/edit-snippet/form";

const loaded: LoadedSnippet = { bodyTooLarge: false, tagsIncomplete: false };

function edit(...args: Parameters<typeof resolveSnippetEdit>) {
  const resolved = resolveSnippetEdit(...args);
  if ("error" in resolved) {
    throw new Error(`unexpected error: ${resolved.error}`);
  }
  return resolved.edit;
}

describe("本文", () => {
  it("入力した本文をそのまま送る", () => {
    expect(edit({ body: "SELECT 1;" }, loaded, false).body).toBe("SELECT 1;");
  });

  it("空白だけならエラーを返す", () => {
    expect(resolveSnippetEdit({ body: "   " }, loaded, false)).toEqual({ error: "Snippet body is empty" });
    expect(resolveSnippetEdit({}, loaded, false)).toEqual({ error: "Snippet body is empty" });
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
