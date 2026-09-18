import { parseHttpUrl, urlEqualsVariants, urlsMatch } from "../bookmark/url";
import { Bookmark, DataSource } from "../types";
import {
  NotionDataSource,
  NotionPage,
  NotionProperty,
  notionFetch,
  paginate,
  plainText,
  titlePropertyName,
  urlPropertyName,
} from "./client";
import { TAGS_PROPERTY, resolveTagIds, tagsDataSourceId } from "./tags";

export async function loadBookmarks(token: string, dataSources: DataSource[]): Promise<Bookmark[]> {
  const pages = await Promise.all(dataSources.map((dataSource) => loadDataSourceBookmarks(token, dataSource)));
  return pages.flat().sort((a, b) => b.lastEditedTime.localeCompare(a.lastEditedTime));
}

export async function createBookmark(
  token: string,
  dataSourceId: string,
  title: string,
  url: string,
  markdown?: string,
  tags?: { selectedIds: string[]; newNames: string[] },
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

  const schema = dataSource.properties ?? {};
  const titleName = titlePropertyName(schema);
  const urlName = urlPropertyName(schema);
  if (!titleName || !urlName) {
    throw new Error("This database needs a title property and a URL property.");
  }

  const content = title.trim().slice(0, 2000) || "Untitled";
  const properties: Record<string, unknown> = {
    [titleName]: { title: [{ type: "text", text: { content } }] },
    [urlName]: { url: parsedUrl },
  };

  const selectedIds = tags?.selectedIds ?? [];
  const newNames = tags?.newNames ?? [];
  const relatedId = tagsDataSourceId(schema);
  if (relatedId && (selectedIds.length > 0 || newNames.length > 0)) {
    const tagIds = await resolveTagIds(token, relatedId, selectedIds, newNames);
    if (tagIds.length > 0) {
      properties[TAGS_PROPERTY] = { relation: tagIds.map((id) => ({ id })) };
    }
  }

  await notionFetch<NotionPage>(token, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
      ...(markdown ? { markdown } : {}),
    }),
  });
}

export async function findBookmarksByUrl(
  token: string,
  dataSources: DataSource[],
  url: string,
  requiredDataSourceId?: string,
): Promise<Bookmark[]> {
  const parsedUrl = parseHttpUrl(url);
  if (!parsedUrl || dataSources.length === 0) {
    return [];
  }

  const found = await Promise.all(
    dataSources.map(async (dataSource) => {
      try {
        return await findDataSourceBookmarksByUrl(token, dataSource, parsedUrl);
      } catch (error) {
        if (dataSource.id === requiredDataSourceId) {
          throw error;
        }
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

function pageTitle(properties: Record<string, NotionProperty>): string {
  const name = titlePropertyName(properties);
  return name ? plainText(properties[name].title) || "Untitled" : "Untitled";
}

function pageUrl(properties: Record<string, NotionProperty>): string | null {
  const name = urlPropertyName(properties);
  return name ? parseHttpUrl(properties[name].url) : null;
}
