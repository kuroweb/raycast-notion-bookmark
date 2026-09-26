import { Cache } from "@raycast/api";

/**
 * 本文は 1 ページ 1 リクエストなので、再検証のたびに全ページ分の /markdown を叩くと重い。
 * ページの last_edited_time が変わらない限り本文も変わらないため、それをキーに使い回す。
 */
const cache = new Cache({ namespace: "snippet-bodies" });

export type SnippetBody = { body: string; truncated: boolean };

export function cachedSnippetBody(pageId: string, lastEditedTime: string): SnippetBody | undefined {
  const raw = cache.get(pageId);
  if (raw === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isEntry(parsed) && parsed.lastEditedTime === lastEditedTime
      ? { body: parsed.body, truncated: parsed.truncated }
      : undefined;
  } catch {
    return undefined;
  }
}

export function storeSnippetBody(pageId: string, lastEditedTime: string, value: SnippetBody): void {
  cache.set(pageId, JSON.stringify({ lastEditedTime, ...value }));
}

function isEntry(value: unknown): value is { lastEditedTime: string; body: string; truncated: boolean } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.lastEditedTime === "string" &&
    typeof record.body === "string" &&
    typeof record.truncated === "boolean"
  );
}
