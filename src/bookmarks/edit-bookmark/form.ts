import { DataSource } from "../../lib/notion-client";
import { parseTagNames } from "../../tags/tags";
import { truncateClip } from "../clip-limit";
import { hostname, parseHttpUrl } from "../url";

export type BookmarkFormValues = {
  title?: string;
  url?: string;
  dataSourceId?: string;
  tags?: string[];
  newTags?: string;
  clip?: string;
};

export type LoadedBookmark = {
  markdown: string;
  clipTooLarge: boolean;
  tagsIncomplete: boolean;
};

export type BookmarkEdit = {
  dataSource: DataSource;
  title: string;
  url: string | null;
  tags?: { selectedIds: string[]; newNames: string[] };
  markdown?: string;
};

export function resolveBookmarkEdit(
  values: BookmarkFormValues,
  loaded: LoadedBookmark,
  canEditTags: boolean,
  dataSources: DataSource[],
): { edit: BookmarkEdit } | { error: string } {
  const dataSource = dataSources.find((item) => item.id === values.dataSourceId);
  if (!dataSource) {
    return { error: "Select a database" };
  }

  const urlInput = values.url?.trim() ?? "";
  const url = urlInput.length === 0 ? null : parseHttpUrl(urlInput);
  if (urlInput.length > 0 && !url) {
    return { error: "URL must start with http:// or https://" };
  }

  const nextClip = values.clip ?? "";
  return {
    edit: {
      dataSource,
      title: (values.title?.trim() || (url ? hostname(url) : "")).slice(0, 2000) || "Untitled",
      url,
      ...(canEditTags && !loaded.tagsIncomplete
        ? { tags: { selectedIds: values.tags ?? [], newNames: parseTagNames(values.newTags) } }
        : {}),
      ...(!loaded.clipTooLarge && nextClip !== loaded.markdown ? { markdown: truncateClip(nextClip) } : {}),
    },
  };
}
