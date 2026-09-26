import { describe, expect, it } from "vitest";
import {
  createSnippet,
  loadSnippetForEdit,
  loadSnippetMarkdown,
  loadSnippets,
  toSnippetBody,
  updateSnippet,
  wrapCodeBlock,
} from "../../src/snippets/snippets";
import { notionList, stubNotionFetch } from "../support/notion-fetch";

const dataSource = { id: "ds-1", title: "Snippets" };
const schema = { Name: { type: "title" } };

function snippetPage(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    url: `https://notion.so/${id}`,
    last_edited_time: "2026-01-01T00:00:00.000Z",
    properties: { Name: { type: "title", title: [{ plain_text: title }] } },
    ...extra,
  };
}

describe("toSnippetBody", () => {
  it("Notion が付けた囲みコードフェンスを外す", () => {
    expect(toSnippetBody("```plain text\nSELECT 1;\n```")).toBe("SELECT 1;");
  });

  it("前後の空行と empty-block を落とす", () => {
    expect(toSnippetBody('\n<empty-block id="a" />\n```plain text\nbody\n```\n<empty-block />\n\n')).toBe("body");
  });

  it("本文中の empty-block と空行は残す", () => {
    expect(toSnippetBody("```plain text\nfirst\n<empty-block />\n\nsecond\n```")).toBe(
      "first\n<empty-block />\n\nsecond",
    );
  });

  it("4スペース以上下げたフェンスは囲みフェンスと見なさない", () => {
    expect(toSnippetBody("    ```js\nx\n```")).toBe("    ```js\nx\n```");
  });

  it("入れ子のコードフェンスは外側だけ外す", () => {
    expect(toSnippetBody("````plain text\n```ts\nconst a = 1;\n```\n````")).toBe("```ts\nconst a = 1;\n```");
  });

  it("囲みフェンスがなければ整形だけして返す", () => {
    expect(toSnippetBody("\n# heading\n\ntext\n\n")).toBe("# heading\n\ntext");
  });

  it("閉じフェンスがなければ外さない", () => {
    expect(toSnippetBody("```plain text\nbody")).toBe("```plain text\nbody");
  });

  it("空文字なら空文字", () => {
    expect(toSnippetBody("")).toBe("");
  });
});

describe("wrapCodeBlock", () => {
  it("plain text のコードブロックで包む", () => {
    expect(wrapCodeBlock("SELECT 1;")).toBe("```plain text\nSELECT 1;\n```");
  });

  it("本文がコードフェンスを含むときはフェンスを長くする", () => {
    expect(wrapCodeBlock("```ts\nconst a = 1;\n```")).toBe("````plain text\n```ts\nconst a = 1;\n```\n````");
  });

  it("本文中の最長フェンスより1つ長いフェンスにする", () => {
    expect(wrapCodeBlock("````\nx\n````")).toBe("`````plain text\n````\nx\n````\n`````");
  });

  it("包んだあと toSnippetBody で元に戻る", () => {
    const body = "```ts\nconst a = 1;\n```";
    expect(toSnippetBody(wrapCodeBlock(body))).toBe(body);
  });
});

describe("loadSnippets", () => {
  it("本文を取得し、最終更新の新しい順に並べる", async () => {
    stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-1/query") {
        return notionList([
          snippetPage("1", "Old", { last_edited_time: "2026-01-01T00:00:00.000Z" }),
          snippetPage("2", "New", { last_edited_time: "2026-02-01T00:00:00.000Z" }),
          snippetPage("3", "Trash", { in_trash: true }),
        ]);
      }
      if (request.path.endsWith("/markdown")) {
        return { body: { markdown: "```plain text\nbody\n```" } };
      }
      return { body: { id: "ds-1", properties: { Name: { type: "title" } } } };
    });

    const snippets = await loadSnippets("token", [dataSource]);
    expect(snippets.map((snippet) => snippet.title)).toEqual(["New", "Old"]);
    expect(snippets[0].body).toBe("body");
  });

  it("本文の取得に失敗したスニペットは空の本文で返す", async () => {
    stubNotionFetch((request) => {
      if (request.path === "/data_sources/ds-1/query") {
        return notionList([snippetPage("1", "Title")]);
      }
      if (request.path.endsWith("/markdown")) {
        return { status: 403, body: { message: "No access" } };
      }
      return { body: { id: "ds-1", properties: { Name: { type: "title" } } } };
    });

    const [snippet] = await loadSnippets("token", [dataSource]);
    expect(snippet).toMatchObject({ body: "", truncated: false });
  });
});

describe("createSnippet", () => {
  it("本文をコードブロックで包んで送る", async () => {
    const stubbed = stubNotionFetch((request) =>
      request.path === "/pages" ? { body: { id: "created" } } : { body: { id: "ds-1", properties: schema } },
    );

    await createSnippet("token", "ds-1", "  Title  ", "SELECT 1;");
    expect(stubbed.requests.at(-1)?.body).toMatchObject({
      parent: { type: "data_source_id", data_source_id: "ds-1" },
      properties: { Name: { title: [{ type: "text", text: { content: "Title" } }] } },
      markdown: "```plain text\nSELECT 1;\n```",
    });
  });

  it("本文が空なら Notion を呼ばずに失敗する", async () => {
    const stubbed = stubNotionFetch(() => ({ body: {} }));
    await expect(createSnippet("token", "ds-1", "Title", "   ")).rejects.toThrow("Snippet body is empty");
    expect(stubbed.requests).toHaveLength(0);
  });

  it("title プロパティがなければ失敗する", async () => {
    stubNotionFetch(() => ({ body: { id: "ds-1", properties: { Note: { type: "rich_text" } } } }));
    await expect(createSnippet("token", "ds-1", "Title", "body")).rejects.toThrow(
      "This database needs a title property.",
    );
  });

  it("ゴミ箱のデータベースには保存しない", async () => {
    stubNotionFetch(() => ({ body: { id: "ds-1", in_trash: true, properties: schema } }));
    await expect(createSnippet("token", "ds-1", "Title", "body")).rejects.toThrow("This database is in the trash.");
  });
});

describe("loadSnippetMarkdown", () => {
  it("囲みフェンスを外した本文と truncated を返す", async () => {
    stubNotionFetch(() => ({ body: { markdown: "```plain text\nbody\n```", truncated: true } }));
    expect(await loadSnippetMarkdown("token", "1")).toEqual({ body: "body", truncated: true });
  });
});

describe("loadSnippetForEdit", () => {
  it("タイトル・タグ id・本文を返す", async () => {
    stubNotionFetch((request) =>
      request.path.endsWith("/markdown")
        ? { body: { markdown: "```plain text\nbody\n```" } }
        : {
            body: snippetPage("1", "Title", {
              properties: {
                Name: { type: "title", title: [{ plain_text: "Title" }] },
                Tags: { type: "relation", relation: [{ id: "tag-1" }], has_more: true },
              },
            }),
          },
    );

    expect(await loadSnippetForEdit("token", "1")).toEqual({
      title: "Title",
      tagIds: ["tag-1"],
      tagsIncomplete: true,
      body: "body",
      bodyTooLarge: false,
    });
  });

  it("ゴミ箱のスニペットは編集できない", async () => {
    stubNotionFetch((request) =>
      request.path.endsWith("/markdown")
        ? { body: { markdown: "" } }
        : { body: snippetPage("1", "Title", { in_trash: true }) },
    );

    await expect(loadSnippetForEdit("token", "1")).rejects.toThrow("This snippet is in the trash.");
  });
});

describe("updateSnippet", () => {
  it("本文をコードブロックで包んで replace_content で送る", async () => {
    const stubbed = stubNotionFetch((request) =>
      request.path === "/data_sources/ds-1" ? { body: { id: "ds-1", properties: schema } } : { body: { id: "1" } },
    );

    await updateSnippet("token", "1", "ds-1", "Title", undefined, "SELECT 1;");
    const markdownRequest = stubbed.requests.find((request) => request.path.endsWith("/markdown"));
    expect(markdownRequest?.method).toBe("PATCH");
    expect(markdownRequest?.body).toMatchObject({
      type: "replace_content",
      replace_content: { new_str: "```plain text\nSELECT 1;\n```" },
    });
  });

  it("本文を渡さなければ本文は触らない", async () => {
    const stubbed = stubNotionFetch((request) =>
      request.path === "/data_sources/ds-1" ? { body: { id: "ds-1", properties: schema } } : { body: { id: "1" } },
    );

    await updateSnippet("token", "1", "ds-1", "Title");
    expect(stubbed.requests.some((request) => request.path.endsWith("/markdown"))).toBe(false);
  });

  it("本文が空文字なら Notion を呼ばずに失敗する", async () => {
    const stubbed = stubNotionFetch(() => ({ body: {} }));
    await expect(updateSnippet("token", "1", "ds-1", "Title", undefined, "  ")).rejects.toThrow(
      "Snippet body is empty",
    );
    expect(stubbed.requests).toHaveLength(0);
  });
});
