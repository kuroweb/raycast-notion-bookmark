import { onTestFinished, vi } from "vitest";

const NOTION_API = "https://api.notion.com/v1";

export type NotionRequest = {
  path: string;
  method: string;
  body: Record<string, unknown> | undefined;
};

export type NotionReply = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

/**
 * Notion API を叩かずに挙動を確かめるため、テストの間だけ global fetch を差し替える。
 * 記録したrequests でリクエスト内容を検証できる。
 */
export function stubNotionFetch(respond: (request: NotionRequest) => NotionReply): {
  requests: NotionRequest[];
} {
  const requests: NotionRequest[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request: NotionRequest = {
      path: String(input).replace(NOTION_API, ""),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);

    const reply = respond(request);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  }) as typeof globalThis.fetch;

  onTestFinished(() => {
    globalThis.fetch = original;
  });

  return { requests };
}

export function notionList<T>(results: T[], nextCursor?: string): NotionReply {
  return { body: { results, has_more: nextCursor !== undefined, next_cursor: nextCursor ?? null } };
}
