import { parseTagNames } from "../../tags/tags";

export type SnippetFormValues = {
  title?: string;
  body?: string;
  tags?: string[];
  newTags?: string;
};

export type LoadedSnippet = {
  bodyTooLarge: boolean;
  tagsIncomplete: boolean;
};

export type SnippetEdit = {
  title: string;
  tags?: { selectedIds: string[]; newNames: string[] };
  body?: string;
};

export function resolveSnippetEdit(
  values: SnippetFormValues,
  loaded: LoadedSnippet,
  canEditTags: boolean,
): { edit: SnippetEdit } | { error: string } {
  const nextBody = values.body ?? "";
  if (!loaded.bodyTooLarge && nextBody.trim().length === 0) {
    return { error: "Snippet body is empty" };
  }

  return {
    edit: {
      title: (values.title?.trim() || "Untitled").slice(0, 2000),
      ...(canEditTags && !loaded.tagsIncomplete
        ? { tags: { selectedIds: values.tags ?? [], newNames: parseTagNames(values.newTags) } }
        : {}),
      ...(loaded.bodyTooLarge ? {} : { body: nextBody }),
    },
  };
}
