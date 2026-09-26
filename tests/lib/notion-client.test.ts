import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notionFetch,
  paginate,
  plainText,
  searchAccessibleDataSources,
  titlePropertyName,
  urlPropertyName,
} from "../../src/lib/notion-client";
import { notionList, stubNotionFetch } from "../support/notion-fetch";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("plainText", () => {
  it("rich text を連結する", () => {
    expect(plainText([{ plain_text: "Hello " }, { plain_text: "world" }])).toBe("Hello world");
  });

  it("undefined や空配列は空文字", () => {
    expect(plainText(undefined)).toBe("");
    expect(plainText([])).toBe("");
  });
});

describe("titlePropertyName", () => {
  it("title 型のプロパティ名を返す", () => {
    expect(titlePropertyName({ URL: { type: "url" }, Name: { type: "title" } })).toBe("Name");
  });

  it("title 型がなければ undefined", () => {
    expect(titlePropertyName({ URL: { type: "url" } })).toBeUndefined();
    expect(titlePropertyName({})).toBeUndefined();
  });
});

describe("urlPropertyName", () => {
  it("URL という名前の url 型を優先する", () => {
    expect(urlPropertyName({ Link: { type: "url" }, URL: { type: "url" } })).toBe("URL");
  });

  it("URL がなければ最初の url 型を返す", () => {
    expect(urlPropertyName({ Name: { type: "title" }, Link: { type: "url" } })).toBe("Link");
  });

  it("URL という名前でも url 型でなければ使わない", () => {
    expect(urlPropertyName({ URL: { type: "rich_text" }, Link: { type: "url" } })).toBe("Link");
  });

  it("url 型がなければ undefined", () => {
    expect(urlPropertyName({ Name: { type: "title" } })).toBeUndefined();
  });
});

describe("paginate", () => {
  it("next_cursor を追って全ページを連結する", async () => {
    const cursors: Array<string | undefined> = [];
    const results = await paginate<number>(async (cursor) => {
      cursors.push(cursor);
      if (cursor === undefined) {
        return { results: [1, 2], has_more: true, next_cursor: "cursor-2" };
      }
      return { results: [3], has_more: false, next_cursor: null };
    });

    expect(results).toEqual([1, 2, 3]);
    expect(cursors).toEqual([undefined, "cursor-2"]);
  });

  it("has_more が true でも next_cursor が null なら止まる", async () => {
    const fetchPage = vi.fn(async () => ({ results: [1], has_more: true, next_cursor: null }));
    expect(await paginate(fetchPage)).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe("notionFetch", () => {
  it("トークンと Notion-Version を付けて JSON を返す", async () => {
    const stubbed = stubNotionFetch(() => ({ body: { id: "page-1" } }));
    expect(await notionFetch<{ id: string }>("  token  ", "/pages/page-1", { method: "GET" })).toEqual({
      id: "page-1",
    });

    const [call] = vi.mocked(globalThis.fetch).mock.calls;
    const headers = (call[1]?.headers ?? {}) as Record<string, string>;
    expect(String(call[0])).toBe("https://api.notion.com/v1/pages/page-1");
    expect(headers.Authorization).toBe("Bearer token");
    expect(headers["Notion-Version"]).toBe("2026-03-11");
    expect(headers["Content-Type"]).toBeUndefined();
    expect(stubbed.requests).toHaveLength(1);
  });

  it("body があるときだけ Content-Type を付ける", async () => {
    stubNotionFetch(() => ({ body: {} }));
    await notionFetch("token", "/pages", { method: "POST", body: JSON.stringify({ a: 1 }) });

    const [call] = vi.mocked(globalThis.fetch).mock.calls;
    expect((call[1]?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("429 は retry-after 秒待って再試行する", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const stubbed = stubNotionFetch((request) =>
      stubbed.requests.length === 1
        ? { status: 429, headers: { "retry-after": "2" }, body: {} }
        : { body: { path: request.path } },
    );

    const pending = notionFetch<{ path: string }>("token", "/pages", { method: "GET" });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(stubbed.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ path: "/pages" });
    expect(stubbed.requests).toHaveLength(2);
  });

  it("529 も再試行の対象にする", async () => {
    vi.useFakeTimers();
    const stubbed = stubNotionFetch(() =>
      stubbed.requests.length === 1 ? { status: 529, body: {} } : { body: { ok: true } },
    );

    const pending = notionFetch<{ ok: boolean }>("token", "/pages", { method: "GET" });
    await vi.advanceTimersByTimeAsync(1_250);

    expect(await pending).toEqual({ ok: true });
  });

  it("再試行は5回で打ち切り、最後のエラーを投げる", async () => {
    vi.useFakeTimers();
    const stubbed = stubNotionFetch(() => ({
      status: 429,
      body: { code: "rate_limited", message: "Too many requests" },
    }));

    const pending = notionFetch("token", "/pages", { method: "GET" });
    const assertion = expect(pending).rejects.toThrow("rate_limited: Too many requests");
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;

    expect(stubbed.requests).toHaveLength(6);
  });

  it("エラーは code と message を組み合わせて投げる", async () => {
    stubNotionFetch(() => ({ status: 404, body: { code: "object_not_found", message: "Not found" } }));
    await expect(notionFetch("token", "/pages/x", { method: "GET" })).rejects.toThrow("object_not_found: Not found");
  });

  it("code がなければ message だけを投げる", async () => {
    stubNotionFetch(() => ({ status: 400, body: { message: "Bad request" } }));
    await expect(notionFetch("token", "/pages", { method: "POST", body: "{}" })).rejects.toThrow("Bad request");
  });

  it("JSON でないエラーはステータスを投げる", async () => {
    stubNotionFetch(() => ({ status: 500, body: undefined }));
    await expect(notionFetch("token", "/pages", { method: "GET" })).rejects.toThrow(/Notion API 500/);
  });
});

describe("searchAccessibleDataSources", () => {
  it("data_source 以外とゴミ箱を除いて返す", async () => {
    stubNotionFetch(() =>
      notionList([
        { object: "data_source", id: "a" },
        { object: "data_source", id: "b", in_trash: true },
        { object: "database", id: "c" },
      ]),
    );

    expect(await searchAccessibleDataSources("token")).toEqual([{ object: "data_source", id: "a" }]);
  });

  it("ページングして全件集める", async () => {
    const stubbed = stubNotionFetch(() =>
      stubbed.requests.length === 1
        ? notionList([{ object: "data_source", id: "a" }], "cursor-2")
        : notionList([{ object: "data_source", id: "b" }]),
    );

    expect(await searchAccessibleDataSources("token")).toHaveLength(2);
    expect(stubbed.requests[1].body?.start_cursor).toBe("cursor-2");
  });
});
