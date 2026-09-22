import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, showToast, useNavigation } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useState } from "react";
import { loadSnippetForEdit, updateSnippet } from "./notion/snippets";
import { loadTagsForDataSource, parseTagNames } from "./notion/tags";
import { Snippet, Tag } from "./types";

const UNTITLED = "Untitled";

type FormValues = {
  title?: string;
  body?: string;
  tags?: string[];
  newTags?: string;
};

export function EditSnippet({ snippet, onSaved }: { snippet: Snippet; onSaved: () => void }) {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const { pop } = useNavigation();
  const [isSaving, setIsSaving] = useState(false);
  const { data, error, isLoading } = usePromise(loadSnippetForEdit, [token, snippet.id]);
  const {
    data: tagsData,
    error: tagsError,
    isLoading: isLoadingTags,
  } = usePromise(loadTagsForDataSource, [token, snippet.dataSourceId], {
    execute: snippet.dataSourceId.length > 0,
  });

  async function save(values: FormValues) {
    if (isSaving || isLoading || isLoadingTags || error || !data) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Form is not ready",
        message: error?.message,
      });
      return;
    }

    const nextBody = values.body ?? "";
    if (!data.bodyTooLarge && nextBody.trim().length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Snippet body is empty",
      });
      return;
    }

    const content = data.bodyTooLarge ? undefined : nextBody;
    setIsSaving(true);
    try {
      await updateSnippet(
        token,
        snippet.id,
        snippet.dataSourceId,
        (values.title?.trim() || UNTITLED).slice(0, 2000),
        tagsData && !data.tagsIncomplete
          ? {
              selectedIds: values.tags ?? [],
              newNames: parseTagNames(values.newTags),
            }
          : undefined,
        content,
      );
    } catch (saveError) {
      await showFailureToast(saveError, { title: "Could not update snippet" });
      return;
    } finally {
      setIsSaving(false);
    }

    onSaved();
    pop();
    await showToast({ style: Toast.Style.Success, title: "Snippet updated" });
  }

  return (
    <Form
      isLoading={isSaving || isLoading || isLoadingTags}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Update Snippet" icon={Icon.Pencil} onSubmit={save} />
        </ActionPanel>
      }
    >
      {error ? <Form.Description text={error.message} /> : null}
      {data && !isLoadingTags ? (
        <>
          <Form.Description title="Database" text={snippet.dataSourceTitle} />
          <Form.TextField
            id="title"
            title="Title"
            placeholder={UNTITLED}
            defaultValue={data.title}
            autoFocus={data.bodyTooLarge}
          />
          {data.tagsIncomplete ? (
            <Form.Description title="Tags" text="This snippet has too many tags to edit here." />
          ) : null}
          {tagsError ? <Form.Description title="Tags" text={tagsError.message} /> : null}
          {tagsData && !data.tagsIncomplete ? (
            <>
              <Form.TagPicker
                key={tagsData.tagsDataSourceId}
                id="tags"
                title="Tags"
                placeholder="Select tags"
                defaultValue={selectedTagIds(data.tagIds, tagsData.tags)}
              >
                {tagsData.tags.map((tag) => (
                  <Form.TagPicker.Item key={tag.id} value={tag.id} title={tag.name} />
                ))}
              </Form.TagPicker>
              <Form.TextField id="newTags" title="New tags" placeholder="Comma-separated names to create" />
            </>
          ) : null}
          {data.bodyTooLarge ? (
            <Form.Description title="Body" text="This snippet's body is too large to edit here." />
          ) : (
            <Form.TextArea id="body" title="Body" placeholder="Snippet body" defaultValue={data.body} autoFocus />
          )}
        </>
      ) : null}
    </Form>
  );
}

function selectedTagIds(tagIds: string[], tags: Tag[]): string[] {
  const available = new Set(tags.map((tag) => tag.id));
  return tagIds.filter((id) => available.has(id));
}
