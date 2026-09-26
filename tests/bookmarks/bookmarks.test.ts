import { describe, expect, it } from "vitest";
import {
  createBookmark,
  findBookmarksByUrl,
  loadBookmarkForEdit,
  loadBookmarks,
  updateBookmark,
} from "../../src/bookmarks/bookmarks";
import { MAX_CLIP_CHARS } from "../../src/bookmarks/clip-limit";
import { NotionReply, notionList, stubNotionFetch } from "../support/notion-fetch";

const dataSource = { id: "ds-1", title: "Bookmark" };
const schema = {
  Name: { type: "title" },
  URL: { type: "url" },
  Tags: { type: "relation", relation: { data_source_id: "tags-1" } },
};

function bookmarkPage(id: string, title: string, url: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    url: `https://notion.so/${id}`,
    last_edited_time: "2026-01-01T00:00:00.000Z",
    properties: {
      Name: { type: "title", title: [{ plain_text: title }] },
      URL: { type: "url", url },
    },
    ...extra,
  };
}

describe("loadBookmarks", () => {
  it("ゴミ箱とアーカイブを除き、最終更新の新しい順に並べる", async () => {
    stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-1/query") {
        return notionList([
          bookmarkPage("1", "Old", "https://example.com/old", { last_edited_time: "2026-01-01T00:00:00.000Z" }),
          bookmarkPage("2", "New", "https://example.com/new", { last_edited_time: "2026-02-01T00:00:00.000Z" }),
          bookmarkPage("3", "Trash", "https://example.com/t", { in_trash: true }),
          bookmarkPage("4", "Archived", "https://example.com/a", { archived: true }),
        ]);
      }
      return { body: { id: "ds-1", properties: { Name: { type: "title" } } } };
    });

    const bookmarks = await loadBookmarks("token", [dataSource]);
    expect(bookmarks.map((bookmark) => bookmark.title)).toEqual(["New", "Old"]);
    expect(bookmarks[0]).toMatchObject({ dataSourceId: "ds-1", dataSourceTitle: "Bookmark", tags: [] });
  });

  it("Tags relation の名前を解決し、検索文字列に混ぜる", async () => {
    stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-1/query") {
        return notionList([
          bookmarkPage("1", "Notion API", "https://example.com/a", {
            properties: {
              Name: { type: "title", title: [{ plain_text: "Notion API" }] },
              URL: { type: "url", url: "https://example.com/a" },
              Tags: { type: "relation", relation: [{ id: "tag-1" }, { id: "tag-1" }, { id: "missing" }] },
            },
          }),
        ]);
      }
      if (request.path === "/data_sources/tags-1/query") {
        return notionList([{ id: "tag-1", properties: { Name: { type: "title", title: [{ plain_text: "Tech" }] } } }]);
      }
      return { body: { id: "ds-1", properties: schema } };
    });

    const [bookmark] = await loadBookmarks("token", [dataSource]);
    expect(bookmark.tags).toEqual(["Tech"]);
    expect(bookmark.searchText).toContain("tech");
  });

  it("タグの取得に失敗してもブックマークは返す", async () => {
    stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-1/query") {
        return notionList([bookmarkPage("1", "Title", "https://example.com/a")]);
      }
      if (request.path === "/data_sources/tags-1/query") {
        return { status: 403, body: { message: "No access" } };
      }
      return { body: { id: "ds-1", properties: schema } };
    });

    const [bookmark] = await loadBookmarks("token", [dataSource]);
    expect(bookmark.tags).toEqual([]);
  });
});

describe("createBookmark", () => {
  function stubCreate(detail: NotionReply) {
    return stubNotionFetch((request) => (request.path === "/pages" ? { body: { id: "created" } } : detail));
  }

  it("title と URL プロパティに書き込む", async () => {
    const stubbed = stubCreate({ body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } });
    await createBookmark("token", "ds-1", "  Title  ", "  https://example.com/a  ");

    expect(stubbed.requests.at(-1)?.body).toMatchObject({
      parent: { type: "data_source_id", data_source_id: "ds-1" },
      properties: {
        Name: { title: [{ type: "text", text: { content: "Title" } }] },
        URL: { url: "https://example.com/a" },
      },
    });
  });

  it("タイトルが空なら Untitled、2000字を超えれば切る", async () => {
    const stubbed = stubCreate({ body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } });
    await createBookmark("token", "ds-1", "   ", "https://example.com/a");
    expect(stubbed.requests.at(-1)?.body).toMatchObject({
      properties: { Name: { title: [{ text: { content: "Untitled" } }] } },
    });

    await createBookmark("token", "ds-1", "a".repeat(2100), "https://example.com/a");
    const properties = (stubbed.requests.at(-1)?.body as { properties: Record<string, never> }).properties;
    expect(JSON.stringify(properties)).toContain("a".repeat(2000));
  });

  it("markdown があるときだけ本文を送る", async () => {
    const stubbed = stubCreate({ body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } });
    await createBookmark("token", "ds-1", "Title", "https://example.com/a");
    expect(stubbed.requests.at(-1)?.body).not.toHaveProperty("markdown");

    await createBookmark("token", "ds-1", "Title", "https://example.com/a", "# body");
    expect(stubbed.requests.at(-1)?.body).toMatchObject({ markdown: "# body" });
  });

  it("タグを解決して relation に入れる", async () => {
    const stubbed = stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-1") {
        return { body: { id: "ds-1", properties: schema } };
      }
      if (request.path === "/data_sources/tags-1") {
        return { body: { id: "tags-1", properties: { Name: { type: "title" } } } };
      }
      if (request.path === "/data_sources/tags-1/query") {
        return notionList([{ id: "tag-1", properties: { Name: { type: "title", title: [{ plain_text: "Tech" }] } } }]);
      }
      return { body: { id: "created" } };
    });

    await createBookmark("token", "ds-1", "Title", "https://example.com/a", undefined, {
      selectedIds: ["tag-1"],
      newNames: [],
    });
    expect(stubbed.requests.at(-1)?.body).toMatchObject({ properties: { Tags: { relation: [{ id: "tag-1" }] } } });
  });

  it("URL が http/https でなければ Notion を呼ばずに失敗する", async () => {
    const stubbed = stubNotionFetch(() => ({ body: {} }));
    await expect(createBookmark("token", "ds-1", "Title", "ftp://example.com")).rejects.toThrow(
      "URL must start with http:// or https://",
    );
    expect(stubbed.requests).toHaveLength(0);
  });

  it("ゴミ箱のデータベースには保存しない", async () => {
    stubNotionFetch(() => ({ body: { id: "ds-1", in_trash: true, properties: schema } }));
    await expect(createBookmark("token", "ds-1", "Title", "https://example.com/a")).rejects.toThrow(
      "This database is in the trash.",
    );
  });

  it("title か URL プロパティが欠けていれば失敗する", async () => {
    stubNotionFetch(() => ({ body: { id: "ds-1", properties: { Name: { type: "title" } } } }));
    await expect(createBookmark("token", "ds-1", "Title", "https://example.com/a")).rejects.toThrow(
      "This database needs a title property and a URL property.",
    );
  });
});

describe("loadBookmarkForEdit", () => {
  it("タイトル・URL・タグ id・本文を返す", async () => {
    stubNotionFetch((request) =>
      request.path.endsWith("/markdown")
        ? { body: { markdown: "# body" } }
        : {
            body: bookmarkPage("1", "Title", "https://example.com/a", {
              properties: {
                Name: { type: "title", title: [{ plain_text: "Title" }] },
                URL: { type: "url", url: "https://example.com/a" },
                Tags: { type: "relation", relation: [{ id: "tag-1" }], has_more: true },
              },
            }),
          },
    );

    expect(await loadBookmarkForEdit("token", "1")).toEqual({
      title: "Title",
      url: "https://example.com/a",
      tagIds: ["tag-1"],
      tagsIncomplete: true,
      markdown: "# body",
      clipTooLarge: false,
    });
  });

  it("本文が上限を超えていれば clipTooLarge になる", async () => {
    stubNotionFetch((request) =>
      request.path.endsWith("/markdown")
        ? { body: { markdown: "a".repeat(MAX_CLIP_CHARS + 1) } }
        : { body: bookmarkPage("1", "Title", "https://example.com/a") },
    );

    expect((await loadBookmarkForEdit("token", "1")).clipTooLarge).toBe(true);
  });

  it("ゴミ箱のページは編集できない", async () => {
    stubNotionFetch((request) =>
      request.path.endsWith("/markdown")
        ? { body: { markdown: "" } }
        : { body: bookmarkPage("1", "Title", "https://example.com/a", { in_trash: true }) },
    );

    await expect(loadBookmarkForEdit("token", "1")).rejects.toThrow("This bookmark is in the trash.");
  });
});

describe("updateBookmark", () => {
  it("本文は上限で切って replace_content で送る", async () => {
    const stubbed = stubNotionFetch((request) =>
      request.path === "/data_sources/ds-1"
        ? { body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } }
        : { body: { id: "1" } },
    );

    await updateBookmark(
      "token",
      "1",
      "ds-1",
      "Title",
      "https://example.com/a",
      undefined,
      "a".repeat(MAX_CLIP_CHARS + 10),
    );
    const markdownRequest = stubbed.requests.find((request) => request.path.endsWith("/markdown"));
    const newStr = (markdownRequest?.body as { replace_content: { new_str: string } }).replace_content.new_str;
    expect(markdownRequest?.method).toBe("PATCH");
    expect(newStr).toHaveLength(MAX_CLIP_CHARS);
  });

  it("markdown を渡さなければ本文は触らない", async () => {
    const stubbed = stubNotionFetch((request) =>
      request.path === "/data_sources/ds-1"
        ? { body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } }
        : { body: { id: "1" } },
    );

    await updateBookmark("token", "1", "ds-1", "Title", "https://example.com/a");
    expect(stubbed.requests.some((request) => request.path.endsWith("/markdown"))).toBe(false);
  });

  it("URL に null を渡すとプロパティを空にする", async () => {
    const stubbed = stubNotionFetch((request) =>
      request.path === "/data_sources/ds-1"
        ? { body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } }
        : { body: { id: "1" } },
    );

    await updateBookmark("token", "1", "ds-1", "Title", null);
    expect(stubbed.requests.at(-1)?.body).toMatchObject({ properties: { URL: { url: null } } });
  });

  it("URL が不正なら Notion を呼ばずに失敗する", async () => {
    const stubbed = stubNotionFetch(() => ({ body: {} }));
    await expect(updateBookmark("token", "1", "ds-1", "Title", "example.com")).rejects.toThrow(
      "URL must start with http:// or https://",
    );
    expect(stubbed.requests).toHaveLength(0);
  });
});

describe("findBookmarksByUrl", () => {
  it("末尾スラッシュ有無を OR フィルタで問い合わせ、一致だけ返す", async () => {
    const stubbed = stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-1") {
        return { body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } };
      }
      return notionList([
        bookmarkPage("1", "Match", "https://example.com/a/"),
        bookmarkPage("2", "Other", "https://example.com/b"),
      ]);
    });

    const found = await findBookmarksByUrl("token", [dataSource], "https://example.com/a");
    expect(found.map((bookmark) => bookmark.id)).toEqual(["1"]);

    const filter = (stubbed.requests.at(-1)?.body as { filter: { or: unknown[] } }).filter;
    expect(filter.or).toHaveLength(2);
  });

  it("URL プロパティのないデータベースは空で返す", async () => {
    stubNotionFetch(() => ({ body: { id: "ds-1", properties: { Name: { type: "title" } } } }));
    expect(await findBookmarksByUrl("token", [dataSource], "https://example.com/a")).toEqual([]);
  });

  it("URL が不正、またはデータベース未選択なら Notion を呼ばない", async () => {
    const stubbed = stubNotionFetch(() => ({ body: {} }));
    expect(await findBookmarksByUrl("token", [dataSource], "example.com")).toEqual([]);
    expect(await findBookmarksByUrl("token", [], "https://example.com/a")).toEqual([]);
    expect(stubbed.requests).toHaveLength(0);
  });

  it("保存先のデータベースのエラーだけ再送出し、他は無視する", async () => {
    const other = { id: "ds-2", title: "Other" };
    stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-2") {
        return { status: 403, body: { message: "No access" } };
      }
      if (request.path === "/data_sources/ds-1") {
        return { body: { id: "ds-1", properties: { Name: { type: "title" }, URL: { type: "url" } } } };
      }
      return notionList([bookmarkPage("1", "Match", "https://example.com/a")]);
    });

    expect(await findBookmarksByUrl("token", [dataSource, other], "https://example.com/a")).toHaveLength(1);
    await expect(findBookmarksByUrl("token", [dataSource, other], "https://example.com/a", "ds-2")).rejects.toThrow(
      "No access",
    );
  });
});
