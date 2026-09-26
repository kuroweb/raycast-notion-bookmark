import { DataSource } from "../../lib/notion-client";
import { parseTagNames } from "../../tags/tags";
import { hostname, parseHttpUrl } from "../url";
import { prepareClip, toMarkdown } from "./clip-markdown";

export type SaveBookmarkFormValues = {
  title?: string;
  url?: string;
  dataSourceId?: string;
  tags?: string[];
  newTags?: string;
  clip?: string;
};

export type BookmarkSave = {
  dataSource: DataSource;
  title: string;
  url: string;
  tags: { selectedIds: string[]; newNames: string[] };
};

export function resolveBookmarkSave(
  values: SaveBookmarkFormValues,
  dataSources: DataSource[],
): { save: BookmarkSave } | { error: string } {
  const dataSource = dataSources.find((item) => item.id === values.dataSourceId);
  if (!dataSource) {
    return { error: "Select a database" };
  }

  const url = parseHttpUrl(values.url);
  if (!url) {
    return { error: "URL must start with http:// or https://" };
  }

  return {
    save: {
      dataSource,
      title: (values.title?.trim() || hostname(url)).slice(0, 2000) || "Untitled",
      url,
      tags: { selectedIds: values.tags ?? [], newNames: parseTagNames(values.newTags) },
    },
  };
}

/** 本文を保存しない設定なら undefined を返し、Notion のページ本文を作らない。 */
export function clipMarkdown(clip: string, url: string, title: string, saveClip: boolean): string | undefined {
  if (!saveClip) {
    return undefined;
  }
  return prepareClip(toMarkdown(clip, url), title) || undefined;
}

export function savedStatusText(bookmarks: { dataSourceTitle: string }[]): string {
  if (bookmarks.length === 0) {
    return "Not saved";
  }

  const names = [...new Set(bookmarks.map((bookmark) => bookmark.dataSourceTitle))];
  return `Already saved in ${names.join(", ")}`;
}
