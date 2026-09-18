import { DataSource } from "../types";
import { NotionDataSource, notionFetch, paginate, plainText } from "./client";

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
