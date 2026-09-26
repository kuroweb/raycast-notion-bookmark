import {
  NotionDataSource,
  NotionDataSourceProperty,
  NotionPage,
  NotionProperty,
  notionFetch,
  paginate,
  plainText,
  titlePropertyName,
} from "../lib/notion-client";
import { DataSourceTags, Tag } from "./types";

export const TAGS_PROPERTY = "Tags";

export function parseTagNames(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of input.split(/[,、]/)) {
    const name = part.trim().slice(0, 2000);
    if (!name) {
      continue;
    }
    const key = matchKey(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function tagsDataSourceId(schema: Record<string, NotionDataSourceProperty> | undefined): string | undefined {
  const property = schema?.[TAGS_PROPERTY];
  return property?.type === "relation" ? property.relation?.data_source_id : undefined;
}

export async function loadTagsDataSourceId(token: string, bookmarkDataSourceId: string): Promise<string | undefined> {
  if (!bookmarkDataSourceId) {
    return undefined;
  }

  const dataSource = await notionFetch<NotionDataSource>(
    token,
    `/data_sources/${encodeURIComponent(bookmarkDataSourceId)}`,
    { method: "GET" },
  );
  return tagsDataSourceId(dataSource.properties);
}

export async function loadTagsForDataSource(token: string, dataSourceId: string): Promise<DataSourceTags | null> {
  const relatedId = await loadTagsDataSourceId(token, dataSourceId);
  if (!relatedId) {
    return null;
  }

  return { tagsDataSourceId: relatedId, tags: await loadTags(token, relatedId) };
}

export async function resolveTagIds(
  token: string,
  relatedId: string,
  selectedIds: string[],
  newNames: string[],
): Promise<string[]> {
  if (selectedIds.length === 0 && newNames.length === 0) {
    return [];
  }

  const tagsSource = await notionFetch<NotionDataSource>(token, `/data_sources/${encodeURIComponent(relatedId)}`, {
    method: "GET",
  });
  if (tagsSource.in_trash) {
    throw new Error("The Tags database is in the trash.");
  }

  const titleName = titlePropertyName(tagsSource.properties ?? {});
  if (!titleName) {
    throw new Error("The Tags database needs a title property.");
  }

  let tags = await loadTags(token, relatedId);
  const existingIds = new Set(tags.map((tag) => tag.id));
  const ids: string[] = [];
  const seen = new Set<string>();

  function add(id: string) {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    ids.push(id);
  }

  for (const id of selectedIds) {
    if (existingIds.has(id)) {
      add(id);
    }
  }

  for (const name of newNames) {
    const match = findTag(tags, name);
    if (match) {
      add(match.id);
      continue;
    }

    const created = await createTagPage(token, relatedId, titleName, name);
    tags = [...tags, created];
    add(created.id);
  }

  return ids;
}

export async function loadTags(token: string, dataSourceId: string): Promise<Tag[]> {
  const pages = await paginate<NotionPage>((cursor) =>
    notionFetch(token, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
      }),
    }),
  );

  return pages
    .filter((page) => !page.in_trash && !page.archived)
    .map((page) => ({ id: page.id, name: tagName(page.properties) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

async function createTagPage(token: string, dataSourceId: string, titleName: string, name: string): Promise<Tag> {
  const content = name.trim().slice(0, 2000) || "Untitled";
  const page = await notionFetch<NotionPage>(token, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties: {
        [titleName]: { title: [{ type: "text", text: { content } }] },
      },
    }),
  });
  return { id: page.id, name: content };
}

function findTag(tags: Tag[], name: string): Tag | undefined {
  const key = matchKey(name);
  return tags.find((tag) => matchKey(tag.name) === key);
}

export function selectedTagIds(tagIds: string[], tags: Tag[]): string[] {
  const available = new Set(tags.map((tag) => tag.id));
  return tagIds.filter((id) => available.has(id));
}

export function matchKey(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function tagName(properties: Record<string, NotionProperty>): string {
  const name = titlePropertyName(properties);
  return name ? plainText(properties[name].title) || "Untitled" : "Untitled";
}
