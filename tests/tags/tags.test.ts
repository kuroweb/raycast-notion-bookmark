import { describe, expect, it } from "vitest";
import {
  loadTags,
  loadTagsForDataSource,
  matchKey,
  parseTagNames,
  resolveTagIds,
  selectedTagIds,
  tagsDataSourceId,
} from "../../src/tags/tags";
import { notionList, stubNotionFetch } from "../support/notion-fetch";

function tagPage(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, properties: { Name: { type: "title", title: [{ plain_text: name }] } }, ...extra };
}

describe("parseTagNames", () => {
  it("読点とカンマの両方で区切り、前後の空白を落とす", () => {
    expect(parseTagNames(" tech , notion 、 raycast ")).toEqual(["tech", "notion", "raycast"]);
  });

  it("空の要素は捨てる", () => {
    expect(parseTagNames("tech,,、 ,notion")).toEqual(["tech", "notion"]);
    expect(parseTagNames(",,")).toEqual([]);
  });

  it("未入力は空配列", () => {
    expect(parseTagNames(undefined)).toEqual([]);
    expect(parseTagNames("")).toEqual([]);
  });

  it("大文字小文字と全角半角の違いは重複と見なし、最初の表記を残す", () => {
    expect(parseTagNames("Tech,tech,ＴＥＣＨ")).toEqual(["Tech"]);
  });

  it("2000字で切る", () => {
    expect(parseTagNames("a".repeat(2100))[0]).toHaveLength(2000);
  });
});

// タグの重複判定に使う。半角カナや合字の違いで同じタグを二重に作らないための正規化。
describe("matchKey", () => {
  it("NFKC 正規化して小文字にする", () => {
    expect(matchKey("ＴＥＣＨ")).toBe("tech");
    expect(matchKey("ｶﬁ")).toBe("カfi");
  });
});

describe("tagsDataSourceId", () => {
  it("Tags が relation なら参照先 id を返す", () => {
    expect(tagsDataSourceId({ Tags: { type: "relation", relation: { data_source_id: "tags-1" } } })).toBe("tags-1");
  });

  it("relation でない、Tags がない、schema 自体がない場合は undefined", () => {
    expect(tagsDataSourceId({ Tags: { type: "multi_select" } })).toBeUndefined();
    expect(tagsDataSourceId({})).toBeUndefined();
    expect(tagsDataSourceId(undefined)).toBeUndefined();
  });

  it("relation だが参照先が空なら undefined", () => {
    expect(tagsDataSourceId({ Tags: { type: "relation", relation: {} } })).toBeUndefined();
  });
});

describe("loadTags", () => {
  it("ゴミ箱とアーカイブを除き、ja ロケールで名前順に並べる", async () => {
    stubNotionFetch(() =>
      notionList([
        tagPage("3", "さくら"),
        tagPage("1", "あんず"),
        tagPage("4", "trash", { in_trash: true }),
        tagPage("5", "archived", { archived: true }),
        tagPage("2", "Apple"),
      ]),
    );

    expect(await loadTags("token", "tags-1")).toEqual([
      { id: "2", name: "Apple" },
      { id: "1", name: "あんず" },
      { id: "3", name: "さくら" },
    ]);
  });

  it("タイトルが空なら Untitled", async () => {
    stubNotionFetch(() => notionList([{ id: "1", properties: { Name: { type: "title", title: [] } } }]));
    expect(await loadTags("token", "tags-1")).toEqual([{ id: "1", name: "Untitled" }]);
  });
});

describe("loadTagsForDataSource", () => {
  it("Tags relation があればタグ一覧を添えて返す", async () => {
    stubNotionFetch((request) =>
      request.path === "/data_sources/bookmarks-1"
        ? { body: { id: "bookmarks-1", properties: { Tags: { type: "relation", relation: { data_source_id: "t" } } } } }
        : notionList([tagPage("1", "tech")]),
    );

    expect(await loadTagsForDataSource("token", "bookmarks-1")).toEqual({
      tagsDataSourceId: "t",
      tags: [{ id: "1", name: "tech" }],
    });
  });

  it("Tags relation がなければ null を返し、タグは取得しない", async () => {
    const stubbed = stubNotionFetch(() => ({ body: { id: "bookmarks-1", properties: { Name: { type: "title" } } } }));
    expect(await loadTagsForDataSource("token", "bookmarks-1")).toBeNull();
    expect(stubbed.requests).toHaveLength(1);
  });
});

describe("resolveTagIds", () => {
  const tagsSchema = { body: { id: "tags-1", properties: { Name: { type: "title" } } } };

  it("指定も新規もなければ Notion を呼ばない", async () => {
    const stubbed = stubNotionFetch(() => ({ body: {} }));
    expect(await resolveTagIds("token", "tags-1", [], [])).toEqual([]);
    expect(stubbed.requests).toHaveLength(0);
  });

  it("存在しない id は捨て、重複は1つにまとめる", async () => {
    stubNotionFetch((request) =>
      request.path === "/data_sources/tags-1" ? tagsSchema : notionList([tagPage("1", "tech")]),
    );
    expect(await resolveTagIds("token", "tags-1", ["1", "1", "missing"], [])).toEqual(["1"]);
  });

  it("既存タグと同じ名前ならページを作らず既存 id を使う", async () => {
    const stubbed = stubNotionFetch((request) =>
      request.path === "/data_sources/tags-1" ? tagsSchema : notionList([tagPage("1", "Tech")]),
    );

    expect(await resolveTagIds("token", "tags-1", [], ["ｔｅｃｈ"])).toEqual(["1"]);
    expect(stubbed.requests.some((request) => request.path === "/pages")).toBe(false);
  });

  it("新しい名前はページを作って id を返す", async () => {
    const stubbed = stubNotionFetch((request) => {
      if (request.path === "/data_sources/tags-1") {
        return tagsSchema;
      }
      if (request.path === "/pages") {
        return { body: { id: "created-1" } };
      }
      return notionList([]);
    });

    expect(await resolveTagIds("token", "tags-1", [], ["notion"])).toEqual(["created-1"]);
    const created = stubbed.requests.find((request) => request.path === "/pages");
    expect(created?.body).toMatchObject({
      parent: { type: "data_source_id", data_source_id: "tags-1" },
      properties: { Name: { title: [{ type: "text", text: { content: "notion" } }] } },
    });
  });

  it("同じ新規名を2回渡してもページは1つだけ作る", async () => {
    const stubbed = stubNotionFetch((request) => {
      if (request.path === "/data_sources/tags-1") {
        return tagsSchema;
      }
      if (request.path === "/pages") {
        return { body: { id: "created-1" } };
      }
      return notionList([]);
    });

    expect(await resolveTagIds("token", "tags-1", [], ["notion", "ＮＯＴＩＯＮ"])).toEqual(["created-1"]);
    expect(stubbed.requests.filter((request) => request.path === "/pages")).toHaveLength(1);
  });

  it("Tags データベースがゴミ箱にあれば失敗する", async () => {
    stubNotionFetch(() => ({ body: { id: "tags-1", in_trash: true, properties: { Name: { type: "title" } } } }));
    await expect(resolveTagIds("token", "tags-1", ["1"], [])).rejects.toThrow("The Tags database is in the trash.");
  });

  it("Tags データベースに title プロパティがなければ失敗する", async () => {
    stubNotionFetch(() => ({ body: { id: "tags-1", properties: { Note: { type: "rich_text" } } } }));
    await expect(resolveTagIds("token", "tags-1", ["1"], [])).rejects.toThrow(
      "The Tags database needs a title property.",
    );
  });
});

describe("selectedTagIds", () => {
  it("一覧にある id だけ残す（消えたタグの選択を捨てる）", () => {
    const tags = [
      { id: "1", name: "tech" },
      { id: "2", name: "notion" },
    ];
    expect(selectedTagIds(["2", "missing", "1"], tags)).toEqual(["2", "1"]);
  });

  it("一覧が空なら空配列", () => {
    expect(selectedTagIds(["1"], [])).toEqual([]);
  });
});
