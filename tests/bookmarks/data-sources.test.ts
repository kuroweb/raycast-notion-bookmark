import { describe, expect, it } from "vitest";
import { listAccessibleDataSources } from "../../src/bookmarks/data-sources";
import { notionList, stubNotionFetch } from "../support/notion-fetch";

function dataSource(id: string, title: string, properties: Record<string, { type: string }>) {
  return { object: "data_source", id, title: [{ plain_text: title }], properties };
}

describe("listAccessibleDataSources", () => {
  it("url 型プロパティがあるものだけ返す", async () => {
    stubNotionFetch(() =>
      notionList([
        dataSource("1", "Bookmark", { Name: { type: "title" }, URL: { type: "url" } }),
        dataSource("2", "Snippet", { Name: { type: "title" } }),
      ]),
    );

    expect(await listAccessibleDataSources("token")).toEqual([{ id: "1", title: "Bookmark" }]);
  });

  it("URL という名前でなくても url 型なら対象にする", async () => {
    stubNotionFetch(() => notionList([dataSource("1", "Bookmark", { Link: { type: "url" } })]));
    expect(await listAccessibleDataSources("token")).toHaveLength(1);
  });

  it("タイトル順に並べ、タイトルが空なら Untitled", async () => {
    stubNotionFetch(() =>
      notionList([
        dataSource("1", "さくら", { URL: { type: "url" } }),
        { object: "data_source", id: "2", properties: { URL: { type: "url" } } },
        dataSource("3", "Apple", { URL: { type: "url" } }),
      ]),
    );

    expect(await listAccessibleDataSources("token")).toEqual([
      { id: "3", title: "Apple" },
      { id: "2", title: "Untitled" },
      { id: "1", title: "さくら" },
    ]);
  });
});
