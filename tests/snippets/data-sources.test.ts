import { describe, expect, it } from "vitest";
import { listAccessibleSnippetDataSources } from "../../src/snippets/data-sources";
import { notionList, stubNotionFetch } from "../support/notion-fetch";

function dataSource(id: string, title: string, properties: Record<string, { type: string }>) {
  return { object: "data_source", id, title: [{ plain_text: title }], properties };
}

describe("listAccessibleSnippetDataSources", () => {
  it("url 型プロパティがないものだけ返す（ブックマーク向けとは排他）", async () => {
    stubNotionFetch(() =>
      notionList([
        dataSource("1", "Bookmark", { Name: { type: "title" }, URL: { type: "url" } }),
        dataSource("2", "Snippet", { Name: { type: "title" } }),
      ]),
    );

    expect(await listAccessibleSnippetDataSources("token")).toEqual([{ id: "2", title: "Snippet" }]);
  });

  it("タイトル順に並べ、タイトルが空なら Untitled", async () => {
    stubNotionFetch(() =>
      notionList([
        dataSource("1", "さくら", { Name: { type: "title" } }),
        { object: "data_source", id: "2", properties: {} },
        dataSource("3", "Apple", { Name: { type: "title" } }),
      ]),
    );

    expect(await listAccessibleSnippetDataSources("token")).toEqual([
      { id: "3", title: "Apple" },
      { id: "2", title: "Untitled" },
      { id: "1", title: "さくら" },
    ]);
  });
});
