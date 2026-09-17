import { URL } from "node:url";
import { prepareClip } from "./clip";
import { Bookmark, DataSource } from "./types";

const NOTION_VERSION = "2026-03-11";
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

export async function createBookmark(
  token: string,
  dataSourceId: string,
  title: string,
  url: string,
  clip?: string,
): Promise<void> {
  const parsedUrl = parseHttpUrl(url);
  if (!parsedUrl) {
    throw new Error("URL must start with http:// or https://");
  }

  const dataSource = await notionFetch<NotionDataSource>(token, `/data_sources/${encodeURIComponent(dataSourceId)}`, {
    method: "GET",
  });
  if (dataSource.in_trash) {
    throw new Error("This database is in the trash.");
  }

  const properties = dataSource.properties ?? {};
  const titleName = titlePropertyName(properties);
  const urlName = urlPropertyName(properties);
  if (!titleName || !urlName) {
    throw new Error("This database needs a title property and a URL property.");
  }

  const content = title.trim().slice(0, 2000) || "Untitled";
  const markdown = clip ? prepareClip(clip, content) : "";
  await notionFetch<NotionPage>(token, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties: {
        [titleName]: { title: [{ type: "text", text: { content } }] },
        [urlName]: { url: parsedUrl },
      },
      ...(markdown ? { markdown } : {}),
    }),
  });
}

export async function findBookmarksByUrl(token: string, dataSources: DataSource[], url: string): Promise<Bookmark[]> {
  const parsedUrl = parseHttpUrl(url);
  if (!parsedUrl || dataSources.length === 0) {
    return [];
  }

  const found = await Promise.all(
    dataSources.map(async (dataSource) => {
      try {
        return await findDataSourceBookmarksByUrl(token, dataSource, parsedUrl);
      } catch {
        return [];
      }
    }),
  );
  return found.flat();
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

  return pages.filter((page) => !page.in_trash && !page.archived).map((page) => toBookmark(page, dataSource));
}

async function findDataSourceBookmarksByUrl(token: string, dataSource: DataSource, url: string): Promise<Bookmark[]> {
  const detail = await notionFetch<NotionDataSource>(token, `/data_sources/${encodeURIComponent(dataSource.id)}`, {
    method: "GET",
  });
  const urlName = urlPropertyName(detail.properties ?? {});
  if (!urlName) {
    return [];
  }

  const variants = urlEqualsVariants(url);
  const filter =
    variants.length === 1
      ? { property: urlName, url: { equals: variants[0] } }
      : { or: variants.map((value) => ({ property: urlName, url: { equals: value } })) };

  const pages = await paginate<NotionPage>((cursor) =>
    notionFetch(token, `/data_sources/${encodeURIComponent(dataSource.id)}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter,
        page_size: 100,
        start_cursor: cursor,
      }),
    }),
  );

  return pages
    .filter((page) => !page.in_trash && !page.archived)
    .map((page) => toBookmark(page, dataSource))
    .filter((bookmark) => bookmark.url !== null && urlsMatch(bookmark.url, url));
}

function toBookmark(page: NotionPage, dataSource: DataSource): Bookmark {
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
  const name = titlePropertyName(properties);
  return name ? plainText(properties[name].title) || "Untitled" : "Untitled";
}

function pageUrl(properties: Record<string, NotionProperty>): string | null {
  const name = urlPropertyName(properties);
  return name ? parseHttpUrl(properties[name].url) : null;
}

function titlePropertyName(properties: Record<string, { type: string }>): string | undefined {
  for (const [name, property] of Object.entries(properties)) {
    if (property.type === "title") {
      return name;
    }
  }
}

function urlPropertyName(properties: Record<string, { type: string }>): string | undefined {
  if (properties.URL?.type === "url") {
    return "URL";
  }

  for (const [name, property] of Object.entries(properties)) {
    if (property.type === "url") {
      return name;
    }
  }
}

export function parseHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

function urlsMatch(left: string, right: string): boolean {
  const a = canonicalBookmarkUrl(left);
  const b = canonicalBookmarkUrl(right);
  return a !== null && a === b;
}

function canonicalBookmarkUrl(value: string): string | null {
  const parsed = parseHttpUrl(value);
  if (!parsed) {
    return null;
  }

  const url = new URL(parsed);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

function urlEqualsVariants(url: string): string[] {
  const parsed = new URL(url);
  const variants = new Set<string>([parsed.toString()]);
  if (parsed.pathname === "/") {
    variants.add(`${parsed.protocol}//${parsed.host}`);
    variants.add(`${parsed.protocol}//${parsed.host}/`);
  } else if (parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
    variants.add(parsed.toString());
  } else {
    parsed.pathname = `${parsed.pathname}/`;
    variants.add(parsed.toString());
  }
  return [...variants];
}

function plainText(items: RichText[] | undefined): string {
  return (items ?? []).map((item) => item.plain_text).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
