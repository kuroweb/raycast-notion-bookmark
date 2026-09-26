import { describe, expect, it } from "vitest";
import { MAX_CLIP_CHARS } from "../../../src/bookmarks/clip-limit";
import { clipMarkdown, resolveBookmarkSave, savedStatusText } from "../../../src/bookmarks/save-bookmark/form";

const dataSources = [
  { id: "ds-1", title: "Tech Bookmark" },
  { id: "ds-2", title: "Work Bookmark" },
];

function save(...args: Parameters<typeof resolveBookmarkSave>) {
  const resolved = resolveBookmarkSave(...args);
  if ("error" in resolved) {
    throw new Error(`unexpected error: ${resolved.error}`);
  }
  return resolved.save;
}

describe("保存先", () => {
  it("選んだ id のデータソースを返す", () => {
    expect(save({ dataSourceId: "ds-2", url: "https://example.com/a" }, dataSources).dataSource).toEqual(
      dataSources[1],
    );
  });

  it("未選択、または選択中に無い id ならエラー", () => {
    expect(resolveBookmarkSave({ url: "https://example.com/a" }, dataSources)).toEqual({ error: "Select a database" });
    expect(resolveBookmarkSave({ dataSourceId: "ds-9", url: "https://example.com/a" }, dataSources)).toEqual({
      error: "Select a database",
    });
    expect(resolveBookmarkSave({ dataSourceId: "ds-1", url: "https://example.com/a" }, [])).toEqual({
      error: "Select a database",
    });
  });
});

describe("URL", () => {
  it("前後の空白を落として返す", () => {
    expect(save({ dataSourceId: "ds-1", url: "  https://example.com/a  " }, dataSources).url).toBe(
      "https://example.com/a",
    );
  });

  it("空欄や http/https 以外はエラー（編集と違い URL は必須）", () => {
    for (const url of [undefined, "", "   ", "example.com", "ftp://example.com"]) {
      expect(resolveBookmarkSave({ dataSourceId: "ds-1", url }, dataSources)).toEqual({
        error: "URL must start with http:// or https://",
      });
    }
  });
});

describe("タイトル", () => {
  it("入力があればそれを使う", () => {
    expect(save({ dataSourceId: "ds-1", url: "https://example.com/a", title: "  Title  " }, dataSources).title).toBe(
      "Title",
    );
  });

  it("空欄なら URL のホスト名で埋める", () => {
    expect(save({ dataSourceId: "ds-1", url: "https://www.example.com/a", title: "  " }, dataSources).title).toBe(
      "example.com",
    );
  });

  it("2000字で切る", () => {
    expect(
      save({ dataSourceId: "ds-1", url: "https://example.com/a", title: "a".repeat(2100) }, dataSources).title,
    ).toHaveLength(2000);
  });
});

describe("タグ", () => {
  it("選択とカンマ区切りの新規名を渡す", () => {
    expect(
      save(
        { dataSourceId: "ds-1", url: "https://example.com/a", tags: ["tag-1"], newTags: "tech、notion" },
        dataSources,
      ).tags,
    ).toEqual({ selectedIds: ["tag-1"], newNames: ["tech", "notion"] });
  });

  it("未入力なら空配列（編集と違い、保存時は常にタグを渡す）", () => {
    expect(save({ dataSourceId: "ds-1", url: "https://example.com/a" }, dataSources).tags).toEqual({
      selectedIds: [],
      newNames: [],
    });
  });
});

describe("clipMarkdown", () => {
  it("HTML を markdown にし、タイトルと同じ見出しを落とす", () => {
    expect(clipMarkdown("<article><h1>Title</h1><p>body</p></article>", "https://example.com/a", "Title", true)).toBe(
      "body",
    );
  });

  it("本文を保存しない設定なら undefined", () => {
    expect(clipMarkdown("<article><p>body</p></article>", "https://example.com/a", "Title", false)).toBeUndefined();
  });

  it("本文が空になれば undefined（空の本文を作らない）", () => {
    expect(clipMarkdown("   ", "https://example.com/a", "Title", true)).toBeUndefined();
  });

  it("上限文字数で切る", () => {
    expect(clipMarkdown("a".repeat(MAX_CLIP_CHARS + 10), "https://example.com/a", "Title", true)).toHaveLength(
      MAX_CLIP_CHARS,
    );
  });
});

describe("savedStatusText", () => {
  it("保存済みならデータベース名を並べ、重複は畳む", () => {
    expect(
      savedStatusText([
        { dataSourceTitle: "Tech Bookmark" },
        { dataSourceTitle: "Work Bookmark" },
        { dataSourceTitle: "Tech Bookmark" },
      ]),
    ).toBe("Already saved in Tech Bookmark, Work Bookmark");
  });

  it("未保存なら Not saved", () => {
    expect(savedStatusText([])).toBe("Not saved");
  });
});
