import { DataSource, NotionDataSource, plainText, searchAccessibleDataSources } from "../lib/notion-client";

export async function listAccessibleSnippetDataSources(token: string): Promise<DataSource[]> {
  const items = await searchAccessibleDataSources(token);
  return toSortedDataSources(items.filter((item) => !hasUrlProperty(item)));
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
