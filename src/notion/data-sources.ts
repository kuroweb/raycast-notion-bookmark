import { DataSource } from "../types";
import { NotionDataSource, notionFetch, paginate, plainText } from "./client";

export async function listAccessibleDataSources(token: string): Promise<DataSource[]> {
  const items = await searchAccessibleDataSources(token);
  return toSortedDataSources(items.filter(hasUrlProperty));
}

export async function listAccessibleSnippetDataSources(token: string): Promise<DataSource[]> {
  const items = await searchAccessibleDataSources(token);
  return toSortedDataSources(items.filter((item) => !hasUrlProperty(item)));
}

async function searchAccessibleDataSources(token: string): Promise<NotionDataSource[]> {
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

function hasUrlProperty(item: NotionDataSource): boolean {
  return Object.values(item.properties ?? {}).some((property) => property.type === "url");
}

function toSortedDataSources(items: NotionDataSource[]): DataSource[] {
  return items
    .map((item) => ({
      id: item.id,
      title: plainText(item.title) || "Untitled",
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "ja"));
}
