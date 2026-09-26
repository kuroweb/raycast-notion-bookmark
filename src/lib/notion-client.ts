const NOTION_VERSION = "2026-03-11";
const NOTION_API = "https://api.notion.com/v1";
const MAX_RETRY_ATTEMPTS = 5;

export type RichText = {
  plain_text: string;
};

export type NotionList<T> = {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
};

export type NotionDataSourceProperty = {
  type: string;
  relation?: {
    data_source_id?: string;
  };
};

export type NotionDataSource = {
  object: string;
  id: string;
  title?: RichText[];
  in_trash?: boolean;
  properties?: Record<string, NotionDataSourceProperty>;
};

export type DataSource = {
  id: string;
  title: string;
};

export type NotionPage = {
  id: string;
  url: string;
  last_edited_time: string;
  in_trash?: boolean;
  archived?: boolean;
  properties: Record<string, NotionProperty>;
};

export type NotionProperty = {
  type: string;
  title?: RichText[];
  url?: string | null;
  has_more?: boolean;
  relation?: { id: string }[];
};

export async function searchAccessibleDataSources(token: string): Promise<NotionDataSource[]> {
  const results = await paginate<NotionDataSource>((cursor) =>
    notionFetch(token, "/search", {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "object", value: "data_source" },
        page_size: 100,
        start_cursor: cursor,
      }),
    }),
  );

  return results.filter((item) => item.object === "data_source" && !item.in_trash);
}

/** ページを別のデータソースへ移す。parent は更新APIでは変えられないので専用エンドポイントを使う。 */
export async function movePage(token: string, pageId: string, dataSourceId: string): Promise<void> {
  await notionFetch<NotionPage>(token, `/pages/${encodeURIComponent(pageId)}/move`, {
    method: "POST",
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dataSourceId } }),
  });
}

export async function paginate<T>(fetchPage: (cursor: string | undefined) => Promise<NotionList<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchPage(cursor);
    all.push(...page.results);
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return all;
}

export async function notionFetch<T>(token: string, path: string, init: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Notion-Version": NOTION_VERSION,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if ((response.status === 429 || response.status === 529) && attempt < MAX_RETRY_ATTEMPTS) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Math.min(2 ** attempt, 30);
    await sleep(seconds * 1000 + Math.random() * 250);
    return notionFetch(token, path, init, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(await notionErrorMessage(response));
  }

  return (await response.json()) as T;
}

export function plainText(items: RichText[] | undefined): string {
  return (items ?? []).map((item) => item.plain_text).join("");
}

export function titlePropertyName(properties: Record<string, { type: string }>): string | undefined {
  for (const [name, property] of Object.entries(properties)) {
    if (property.type === "title") {
      return name;
    }
  }
}

export function urlPropertyName(properties: Record<string, { type: string }>): string | undefined {
  if (properties.URL?.type === "url") {
    return "URL";
  }

  for (const [name, property] of Object.entries(properties)) {
    if (property.type === "url") {
      return name;
    }
  }
}

async function notionErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; code?: string };
    if (body.message) {
      return body.code ? `${body.code}: ${body.message}` : body.message;
    }
  } catch {
    // Fall through to status text.
  }
  return `Notion API ${response.status} ${response.statusText}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
