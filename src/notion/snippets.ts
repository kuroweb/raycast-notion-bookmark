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

  return pageGroups
    .flatMap(({ dataSource, pages }) => pages.map((page) => toSnippet(page, dataSource, tagNames)))
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
      markdown,
    }),
  });
}

export async function loadSnippetMarkdown(token: string, pageId: string): Promise<string> {
  const result = await notionFetch<{ markdown?: string }>(token, `/pages/${encodeURIComponent(pageId)}/markdown`, {
    method: "GET",
  });
  return result.markdown ?? "";
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

function toSnippet(page: NotionPage, dataSource: DataSource, tagNames: Map<string, string>): Snippet {
  const title = pageTitle(page.properties);
  const tags = pageTagNames(page.properties, tagNames);
  return {
    id: page.id,
    title,
    dataSourceId: dataSource.id,
    dataSourceTitle: dataSource.title,
    lastEditedTime: page.last_edited_time,
    tags,
    searchText: matchKey([title, ...tags].join("\n")),
  };
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
