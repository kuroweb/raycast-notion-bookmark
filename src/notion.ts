import { URL } from "node:url";
import { Bookmark, DataSource } from "./types";

const NOTION_VERSION = "2025-09-03";
const NOTION_API = "https://api.notion.com/v1";
const MAX_RETRY_ATTEMPTS = 5;

type RichText = {
  plain_text: string;
};

type NotionList<T> = {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
};

type NotionDataSource = {
  object: string;
  id: string;
  title?: RichText[];
  in_trash?: boolean;
  properties?: Record<string, { type: string }>;
};

type NotionPage = {
  id: string;
  url: string;
  last_edited_time: string;
  in_trash?: boolean;
  archived?: boolean;
  properties: Record<string, NotionProperty>;
};

type NotionProperty = {
  type: string;
  title?: RichText[];
  url?: string | null;
};

export async function listAccessibleDataSources(token: string): Promise<DataSource[]> {
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

  return results
    .filter((item) => item.object === "data_source" && !item.in_trash)
    .filter((item) => Object.values(item.properties ?? {}).some((property) => property.type === "url"))
    .map((item) => ({
      id: item.id,
      title: plainText(item.title) || "Untitled",
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export async function loadBookmarks(token: string, dataSources: DataSource[]): Promise<Bookmark[]> {
  const pages = await Promise.all(dataSources.map((dataSource) => loadDataSourceBookmarks(token, dataSource)));
  return pages.flat().sort((a, b) => b.lastEditedTime.localeCompare(a.lastEditedTime));
}

async function loadDataSourceBookmarks(token: string, dataSource: DataSource): Promise<Bookmark[]> {
  const pages = await paginate<NotionPage>((cursor) =>
    notionFetch(token, `/data_sources/${encodeURIComponent(dataSource.id)}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      }),
    }),
  );

  return pages
    .filter((page) => !page.in_trash && !page.archived)
    .map((page) => {
      const title = pageTitle(page.properties);
      const url = pageUrl(page.properties);
      return {
        id: page.id,
        title,
        url,
        notionUrl: page.url,
        dataSourceId: dataSource.id,
        dataSourceTitle: dataSource.title,
        lastEditedTime: page.last_edited_time,
        searchText: [title, url ?? ""].join("\n").toLowerCase(),
      };
    });
}

async function paginate<T>(fetchPage: (cursor: string | undefined) => Promise<NotionList<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchPage(cursor);
    all.push(...page.results);
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return all;
}

async function notionFetch<T>(token: string, path: string, init: RequestInit, attempt = 0): Promise<T> {
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

function pageTitle(properties: Record<string, NotionProperty>): string {
  for (const property of Object.values(properties)) {
    if (property.type === "title") {
      return plainText(property.title) || "Untitled";
    }
  }
  return "Untitled";
}

function pageUrl(properties: Record<string, NotionProperty>): string | null {
  const namedUrl = properties.URL;
  if (namedUrl?.type === "url") {
    return httpUrl(namedUrl.url);
  }

  for (const property of Object.values(properties)) {
    if (property.type === "url") {
      return httpUrl(property.url);
    }
  }

  return null;
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function plainText(items: RichText[] | undefined): string {
  return (items ?? []).map((item) => item.plain_text).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
