import {
  DataSource,
  NotionDataSource,
  NotionPage,
  NotionProperty,
  notionFetch,
  paginate,
  plainText,
  titlePropertyName,
  urlPropertyName,
} from "../lib/notion-client";
import { TAGS_PROPERTY, loadTags, loadTagsDataSourceId, matchKey, resolveTagIds, tagsDataSourceId } from "../tags/tags";
import { MAX_CLIP_CHARS, truncateClip } from "./clip-limit";
import { Bookmark } from "./types";
import { parseHttpUrl, urlEqualsVariants, urlsMatch } from "./url";

export async function loadBookmarks(token: string, dataSources: DataSource[]): Promise<Bookmark[]> {
  const [pageGroups, tagNames] = await Promise.all([
    Promise.all(dataSources.map((dataSource) => loadDataSourcePages(token, dataSource))),
    loadTagNames(token, dataSources),
  ]);

  return pageGroups
    .flatMap(({ dataSource, pages }) => pages.map((page) => toBookmark(page, dataSource, tagNames)))
    .sort((a, b) => b.lastEditedTime.localeCompare(a.lastEditedTime));
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

export async function loadBookmarkForEdit(
  token: string,
  pageId: string,
): Promise<{
  title: string;
  url: string | null;
  tagIds: string[];
  tagsIncomplete: boolean;
  markdown: string;
  clipTooLarge: boolean;
}> {
  const [page, clip] = await Promise.all([
    notionFetch<NotionPage>(token, `/pages/${encodeURIComponent(pageId)}`, { method: "GET" }),
    loadPageMarkdown(token, pageId),
  ]);
  if (page.in_trash) {
    throw new Error("This bookmark is in the trash.");
  }

  const markdown = clip.markdown;
  return {
    title: pageTitle(page.properties),
    url: pageUrl(page.properties),
    tagIds: pageTagIds(page.properties),
    tagsIncomplete: pageTagsIncomplete(page.properties),
    markdown,
    clipTooLarge: clip.truncated || markdown.length > MAX_CLIP_CHARS,
  };
}

async function loadPageMarkdown(token: string, pageId: string): Promise<{ markdown: string; truncated: boolean }> {
  const result = await notionFetch<{ markdown?: string; truncated?: boolean }>(
    token,
    `/pages/${encodeURIComponent(pageId)}/markdown`,
    { method: "GET" },
  );
  return {
    markdown: result.markdown ?? "",
    truncated: Boolean(result.truncated),
  };
}

export async function updateBookmark(
  token: string,
  pageId: string,
  dataSourceId: string,
  title: string,
  url: string | null,
  tags?: { selectedIds: string[]; newNames: string[] },
  markdown?: string,
): Promise<void> {
  const parsedUrl = url === null ? null : parseHttpUrl(url);
  if (url !== null && !parsedUrl) {
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

  const relatedId = tagsDataSourceId(schema);
  if (relatedId && tags) {
    const tagIds = await resolveTagIds(token, relatedId, tags.selectedIds, tags.newNames);
    properties[TAGS_PROPERTY] = { relation: tagIds.map((id) => ({ id })) };
  }

  if (markdown !== undefined) {
    await notionFetch(token, `/pages/${encodeURIComponent(pageId)}/markdown`, {
      method: "PATCH",
      body: JSON.stringify({
        type: "replace_content",
        replace_content: { new_str: truncateClip(markdown) },
      }),
    });
  }

  await notionFetch<NotionPage>(token, `/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
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

async function loadDataSourcePages(
  token: string,
  dataSource: DataSource,
): Promise<{ dataSource: DataSource; pages: NotionPage[] }> {
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

  return {
    dataSource,
    pages: pages.filter((page) => !page.in_trash && !page.archived),
  };
}

async function loadTagNames(token: string, dataSources: DataSource[]): Promise<Map<string, string>> {
  const relatedIds = [
    ...new Set(
      (
        await Promise.all(
          dataSources.map(async (dataSource) => {
            try {
              return await loadTagsDataSourceId(token, dataSource.id);
            } catch {
              return undefined;
            }
          }),
        )
      ).filter((id): id is string => Boolean(id)),
    ),
  ];

  const names = new Map<string, string>();
  await Promise.all(
    relatedIds.map(async (relatedId) => {
      try {
        const tags = await loadTags(token, relatedId);
        for (const tag of tags) {
          names.set(tag.id, tag.name);
        }
      } catch {
        // Tags are optional; search still works on title and URL.
      }
    }),
  );
  return names;
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

function toBookmark(page: NotionPage, dataSource: DataSource, tagNames?: Map<string, string>): Bookmark {
  const title = pageTitle(page.properties);
  const url = pageUrl(page.properties);
  const tagIds = pageTagIds(page.properties);
  const tags = tagNames ? pageTagNames(page.properties, tagNames) : [];
  return {
    id: page.id,
    title,
    url,
    notionUrl: page.url,
    dataSourceId: dataSource.id,
    dataSourceTitle: dataSource.title,
    lastEditedTime: page.last_edited_time,
    tags,
    tagIds,
    searchText: matchKey([title, url ?? "", ...tags].join("\n")),
  };
}

function pageTagIds(properties: Record<string, NotionProperty>): string[] {
  const property = properties[TAGS_PROPERTY];
  if (property?.type !== "relation") {
    return [];
  }

  return (property.relation ?? []).map((related) => related.id);
}

function pageTagsIncomplete(properties: Record<string, NotionProperty>): boolean {
  const property = properties[TAGS_PROPERTY];
  return property?.type === "relation" && Boolean(property.has_more);
}

function pageTagNames(properties: Record<string, NotionProperty>, tagNames: Map<string, string>): string[] {
  const property = properties[TAGS_PROPERTY];
  if (property?.type !== "relation") {
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (const related of property.relation ?? []) {
    const name = tagNames.get(related.id);
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

function pageTitle(properties: Record<string, NotionProperty>): string {
  const name = titlePropertyName(properties);
  return name ? plainText(properties[name].title) || "Untitled" : "Untitled";
}

function pageUrl(properties: Record<string, NotionProperty>): string | null {
  const name = urlPropertyName(properties);
  return name ? parseHttpUrl(properties[name].url) : null;
}
