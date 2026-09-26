import { DataSource } from "../../lib/notion-client";
import { parseTagNames } from "../../tags/tags";

export type SaveSnippetFormValues = {
  title?: string;
  body?: string;
  dataSourceId?: string;
  tags?: string[];
  newTags?: string;
};

export type SnippetSave = {
  dataSource: DataSource;
  title: string;
  body: string;
  tags: { selectedIds: string[]; newNames: string[] };
};

export function resolveSnippetSave(
  values: SaveSnippetFormValues,
  dataSources: DataSource[],
): { save: SnippetSave } | { error: string } {
  const dataSource = dataSources.find((item) => item.id === values.dataSourceId);
  if (!dataSource) {
    return { error: "Select a database" };
  }

  const body = values.body ?? "";
  if (body.trim().length === 0) {
    return { error: "Snippet body is empty" };
  }

  return {
    save: {
      dataSource,
      title: (values.title?.trim() || "Untitled").slice(0, 2000),
      body,
      tags: { selectedIds: values.tags ?? [], newNames: parseTagNames(values.newTags) },
    },
  };
}
