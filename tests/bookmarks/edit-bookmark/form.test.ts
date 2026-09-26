import { describe, expect, it } from "vitest";
import { MAX_CLIP_CHARS } from "../../../src/bookmarks/clip-limit";
import { LoadedBookmark, resolveBookmarkEdit } from "../../../src/bookmarks/edit-bookmark/form";

const loaded: LoadedBookmark = { markdown: "# body", clipTooLarge: false, tagsIncomplete: false };

function edit(...args: Parameters<typeof resolveBookmarkEdit>) {
  const resolved = resolveBookmarkEdit(...args);
  if ("error" in resolved) {
    throw new Error(`unexpected error: ${resolved.error}`);
  }
  return resolved.edit;
}

describe("URL", () => {
  it("前後の空白を落として保存する", () => {
    expect(edit({ url: "  https://example.com/a  ", clip: loaded.markdown }, loaded, false).url).toBe(
      "https://example.com/a",
    );
  });

  it("空欄なら null（プロパティを空にする）", () => {
    expect(edit({ url: "   ", title: "Title", clip: loaded.markdown }, loaded, false).url).toBeNull();
  });

  it("http/https でなければエラーを返す", () => {
    expect(resolveBookmarkEdit({ url: "example.com" }, loaded, false)).toEqual({
      error: "URL must start with http:// or https://",
    });
  });
});

describe("タイトル", () => {
  it("入力があればそれを使う", () => {
    expect(edit({ title: "  Title  ", url: "https://example.com/a", clip: loaded.markdown }, loaded, false).title).toBe(
      "Title",
    );
  });

  it("空欄なら URL のホスト名で埋める", () => {
    expect(edit({ title: "  ", url: "https://www.example.com/a", clip: loaded.markdown }, loaded, false).title).toBe(
      "example.com",
    );
  });

  it("タイトルも URL も空なら Untitled", () => {
    expect(edit({ clip: loaded.markdown }, loaded, false).title).toBe("Untitled");
  });

  it("2000字で切る", () => {
    expect(edit({ title: "a".repeat(2100), clip: loaded.markdown }, loaded, false).title).toHaveLength(2000);
  });
});

describe("タグ", () => {
  it("タグを編集できるときは選択とカンマ区切りの新規名を渡す", () => {
    expect(edit({ tags: ["tag-1"], newTags: "tech, notion", clip: loaded.markdown }, loaded, true).tags).toEqual({
      selectedIds: ["tag-1"],
      newNames: ["tech", "notion"],
    });
  });

  it("選択が空のときは空配列を渡す（既存タグを外せる）", () => {
    expect(edit({ clip: loaded.markdown }, loaded, true).tags).toEqual({ selectedIds: [], newNames: [] });
  });

  it("Tags データベースが読めないときはタグを触らない", () => {
    expect(edit({ tags: ["tag-1"], clip: loaded.markdown }, loaded, false).tags).toBeUndefined();
  });

  it("タグが多すぎて表示しきれないときはタグを触らない", () => {
    const tagsIncomplete = { ...loaded, tagsIncomplete: true };
    expect(edit({ tags: ["tag-1"], clip: loaded.markdown }, tagsIncomplete, true).tags).toBeUndefined();
  });
});

describe("本文", () => {
  it("変更があれば送る", () => {
    expect(edit({ clip: "# changed", title: "Title" }, loaded, false).markdown).toBe("# changed");
  });

  it("変更がなければ送らない", () => {
    expect(edit({ clip: loaded.markdown, title: "Title" }, loaded, false).markdown).toBeUndefined();
  });

  it("本文を空にした場合は空文字を送る（削除できる）", () => {
    expect(edit({ clip: "", title: "Title" }, loaded, false).markdown).toBe("");
  });

  it("大きすぎて編集できないときは送らない", () => {
    const clipTooLarge = { ...loaded, clipTooLarge: true };
    expect(edit({ clip: "", title: "Title" }, clipTooLarge, false).markdown).toBeUndefined();
  });

  it("上限文字数で切る", () => {
    expect(edit({ clip: "a".repeat(MAX_CLIP_CHARS + 10), title: "Title" }, loaded, false).markdown).toHaveLength(
      MAX_CLIP_CHARS,
    );
  });
});
