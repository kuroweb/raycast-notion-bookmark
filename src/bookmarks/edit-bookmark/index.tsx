import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, showToast, useNavigation } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useState } from "react";
import { loadTagsForDataSource, selectedTagIds } from "../../tags/tags";
import { loadBookmarkForEdit, updateBookmark } from "../bookmarks";
import { Bookmark } from "../types";
import { BookmarkFormValues, resolveBookmarkEdit } from "./form";

export function EditBookmark({ bookmark, onSaved }: { bookmark: Bookmark; onSaved: () => void }) {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const { pop } = useNavigation();
  const [isSaving, setIsSaving] = useState(false);
  const { data, error, isLoading } = usePromise(loadBookmarkForEdit, [token, bookmark.id]);
  const {
    data: tagsData,
    error: tagsError,
    isLoading: isLoadingTags,
  } = usePromise(loadTagsForDataSource, [token, bookmark.dataSourceId], {
    execute: bookmark.dataSourceId.length > 0,
  });

  async function save(values: BookmarkFormValues) {
    if (isSaving || isLoading || isLoadingTags || error || !data) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Form is not ready",
        message: error?.message,
      });
      return;
    }

    const resolved = resolveBookmarkEdit(values, data, Boolean(tagsData));
    if ("error" in resolved) {
      await showToast({ style: Toast.Style.Failure, title: resolved.error });
      return;
    }

    const { title, url, tags, markdown } = resolved.edit;
    setIsSaving(true);
    try {
      await updateBookmark(token, bookmark.id, bookmark.dataSourceId, title, url, tags, markdown);
    } catch (saveError) {
      await showFailureToast(saveError, { title: "Could not update bookmark" });
      return;
    } finally {
      setIsSaving(false);
    }

    onSaved();
    pop();
    await showToast({ style: Toast.Style.Success, title: "Bookmark updated" });
  }

  return (
    <Form
      isLoading={isSaving || isLoading || isLoadingTags}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Update Bookmark" icon={Icon.Pencil} onSubmit={save} />
        </ActionPanel>
      }
    >
      {error ? <Form.Description text={error.message} /> : null}
      {data && !isLoadingTags ? (
        <>
          <Form.Description title="Database" text={bookmark.dataSourceTitle} />
          <Form.TextField
            id="url"
            title="URL"
            placeholder="https://"
            defaultValue={data.url ?? ""}
            autoFocus={!data.url}
          />
          <Form.TextField
            id="title"
            title="Title"
            placeholder="Page title"
            defaultValue={data.title}
            autoFocus={Boolean(data.url)}
          />
          {data.tagsIncomplete ? (
            <Form.Description title="Tags" text="This bookmark has too many tags to edit here." />
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
          {data.clipTooLarge ? (
            <Form.Description title="Page clip" text="This page's body is too large to edit here." />
          ) : (
            <Form.TextArea
              id="clip"
              title="Page clip"
              placeholder="Page content saved as markdown."
              defaultValue={data.markdown}
            />
          )}
        </>
      ) : null}
    </Form>
  );
}
