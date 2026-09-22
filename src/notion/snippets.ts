import { DataSource, Snippet } from "../types";
import {
  NotionDataSource,
  NotionPage,
  NotionProperty,
  notionFetch,
  paginate,
  plainText,
  titlePropertyName,
} from "./client";
import { TAGS_PROPERTY, loadTags, loadTagsDataSourceId, matchKey, resolveTagIds, tagsDataSourceId } from "./tags";

export async function loadSnippets(token: string, dataSources: DataSource[]): Promise<Snippet[]> {
  const [pageGroups, tagNames] = await Promise.all([
    Promise.all(dataSources.map((dataSource) => loadDataSourcePages(token, dataSource))),
    loadTagNames(token, dataSources),
  ]);

  const pages = pageGroups.flatMap(({ dataSource, pages }) => pages.map((page) => ({ dataSource, page })));
  const bodies = await mapWithLimit(pages, 4, ({ page }) => loadSnippetBody(token, page.id));
  return pages
    .map(({ dataSource, page }, index) => toSnippet(page, dataSource, tagNames, bodies[index]))
    .sort((a, b) => b.lastEditedTime.localeCompare(a.lastEditedTime));
}

export async function createSnippet(
  token: string,
  dataSourceId: string,
  title: string,
  markdown: string,
  tags?: { selectedIds: string[]; newNames: string[] },
): Promise<void> {
  if (markdown.trim().length === 0) {
    throw new Error("Snippet body is empty");
  }

  const dataSource = await notionFetch<NotionDataSource>(token, `/data_sources/${encodeURIComponent(dataSourceId)}`, {
    method: "GET",
  });
  if (dataSource.in_trash) {
    throw new Error("This database is in the trash.");
  }

  const schema = dataSource.properties ?? {};
  const titleName = titlePropertyName(schema);
  if (!titleName) {
    throw new Error("This database needs a title property.");
  }

  const content = title.trim().slice(0, 2000) || "Untitled";
  const properties: Record<string, unknown> = {
    [titleName]: { title: [{ type: "text", text: { content } }] },
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
      markdown: wrapCodeBlock(markdown),
    }),
  });
}

export async function loadSnippetMarkdown(
  token: string,
  pageId: string,
): Promise<{ body: string; truncated: boolean }> {
  const page = await loadSnippetPageMarkdown(token, pageId);
  return {
    body: toSnippetBody(page.markdown),
    truncated: page.truncated,
  };
}

async function loadSnippetBody(token: string, pageId: string): Promise<{ body: string; truncated: boolean }> {
  try {
    return await loadSnippetMarkdown(token, pageId);
  } catch {
    return { body: "", truncated: false };
  }
}

export async function loadSnippetForEdit(
  token: string,
  pageId: string,
): Promise<{
  title: string;
  tagIds: string[];
  tagsIncomplete: boolean;
  body: string;
  bodyTooLarge: boolean;
}> {
  const [page, clip] = await Promise.all([
    notionFetch<NotionPage>(token, `/pages/${encodeURIComponent(pageId)}`, { method: "GET" }),
    loadSnippetPageMarkdown(token, pageId),
  ]);
  if (page.in_trash) {
    throw new Error("This snippet is in the trash.");
  }

  return {
    title: pageTitle(page.properties),
    tagIds: pageTagIds(page.properties),
    tagsIncomplete: pageTagsIncomplete(page.properties),
    body: toSnippetBody(clip.markdown),
    bodyTooLarge: clip.truncated,
  };
}

export async function updateSnippet(
  token: string,
  pageId: string,
  dataSourceId: string,
  title: string,
  tags?: { selectedIds: string[]; newNames: string[] },
  body?: string,
): Promise<void> {
  if (body !== undefined && body.trim().length === 0) {
    throw new Error("Snippet body is empty");
  }

  const dataSource = await notionFetch<NotionDataSource>(token, `/data_sources/${encodeURIComponent(dataSourceId)}`, {
    method: "GET",
  });
  if (dataSource.in_trash) {
    throw new Error("This database is in the trash.");
  }

  const schema = dataSource.properties ?? {};
  const titleName = titlePropertyName(schema);
  if (!titleName) {
    throw new Error("This database needs a title property.");
  }

  if (body !== undefined) {
    await notionFetch(token, `/pages/${encodeURIComponent(pageId)}/markdown`, {
      method: "PATCH",
      body: JSON.stringify({
        type: "replace_content",
        replace_content: { new_str: wrapCodeBlock(body) },
      }),
    });
  }

  const storedTitle = title.trim().slice(0, 2000) || "Untitled";
  const properties: Record<string, unknown> = {
    [titleName]: { title: [{ type: "text", text: { content: storedTitle } }] },
  };
  const relatedId = tagsDataSourceId(schema);
  if (relatedId && tags) {
    const tagIds = await resolveTagIds(token, relatedId, tags.selectedIds, tags.newNames);
    properties[TAGS_PROPERTY] = { relation: tagIds.map((id) => ({ id })) };
  }

  await notionFetch<NotionPage>(token, `/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

async function loadSnippetPageMarkdown(
  token: string,
  pageId: string,
): Promise<{ markdown: string; truncated: boolean }> {
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
        // Tags are optional; search still works on title.
      }
    }),
  );
  return names;
}

function toSnippet(
  page: NotionPage,
  dataSource: DataSource,
  tagNames: Map<string, string>,
  clip: { body: string; truncated: boolean },
): Snippet {
  const title = pageTitle(page.properties);
  const tags = pageTagNames(page.properties, tagNames);
  return {
    id: page.id,
    title,
    body: clip.body,
    truncated: clip.truncated,
    dataSourceId: dataSource.id,
    dataSourceTitle: dataSource.title,
    lastEditedTime: page.last_edited_time,
    tags,
    searchText: matchKey([title, clip.body, ...tags].join("\n")),
  };
}

async function mapWithLimit<T, R>(items: T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await map(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
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

function pageTitle(properties: Record<string, NotionProperty>): string {
  const name = titlePropertyName(properties);
  return name ? plainText(properties[name].title) || "Untitled" : "Untitled";
}

function toSnippetBody(markdown: string): string {
  const text = trimEdgeEmptyBlocks(markdown.split("\n")).join("\n");
  return unwrapWrappingCodeFence(text) ?? text;
}

function trimEdgeEmptyBlocks(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && isEdgeBlank(lines[start])) {
    start += 1;
  }
  while (end > start && isEdgeBlank(lines[end - 1])) {
    end -= 1;
  }
  return lines.slice(start, end);
}

function isEdgeBlank(line: string): boolean {
  return line === "" || isEmptyBlock(line);
}

function wrapCodeBlock(body: string): string {
  const fence = codeFenceFor(body);
  return `${fence}plain text\n${body}\n${fence}`;
}

function codeFenceFor(body: string): string {
  let length = 3;
  for (const line of body.split("\n")) {
    const ticks = /^[ \t]{0,3}(`+)/.exec(line);
    if (ticks) {
      length = Math.max(length, ticks[1].length + 1);
    }
  }
  return "`".repeat(length);
}

function isEmptyBlock(line: string): boolean {
  return /^\s*<empty-block\b[^>]*\/?>\s*$/.test(line);
}

function unwrapWrappingCodeFence(text: string): string | undefined {
  const open = /^[ \t]*(?<fence>`{3,})[^\n]*\n/.exec(text);
  const fence = open?.groups?.fence;
  if (!open || !fence) {
    return undefined;
  }

  const lines = text.slice(open[0].length).split("\n");
  const last = lines.at(-1);
  if (!last || !isClosingFence(last, fence)) {
    return undefined;
  }
  return lines.slice(0, -1).join("\n");
}

function isClosingFence(line: string, fence: string): boolean {
  const match = /^[ \t]{0,3}(`+)[ \t]*$/.exec(line);
  return Boolean(match && match[1].length >= fence.length);
}
