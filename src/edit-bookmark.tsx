import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, showToast, useNavigation } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useState } from "react";
import { hostname, parseHttpUrl } from "./bookmark/url";
import { MAX_CLIP_CHARS } from "./clip/markdown";
import { loadBookmarkForEdit, updateBookmark } from "./notion/bookmarks";
import { loadTagsForDataSource, parseTagNames } from "./notion/tags";
import { Bookmark, Tag } from "./types";

type FormValues = {
  title?: string;
  url?: string;
  tags?: string[];
  newTags?: string;
  clip?: string;
};

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

  async function save(values: FormValues) {
    if (isSaving || isLoading || isLoadingTags || error || !data) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Form is not ready",
        message: error?.message,
      });
      return;
    }

    const urlInput = values.url?.trim() ?? "";
    const url = urlInput.length === 0 ? null : parseHttpUrl(urlInput);
    if (urlInput.length > 0 && !url) {
      await showToast({
        style: Toast.Style.Failure,
        title: "URL must start with http:// or https://",
      });
      return;
    }

    const content = (values.title?.trim() || (url ? hostname(url) : "")).slice(0, 2000) || "Untitled";
    const nextClip = values.clip ?? "";
    const markdown = !data.clipTooLarge && nextClip !== data.markdown ? nextClip.slice(0, MAX_CLIP_CHARS) : undefined;
    setIsSaving(true);
    try {
      await updateBookmark(
        token,
        bookmark.id,
        bookmark.dataSourceId,
        content,
        url,
        tagsData && !data.tagsIncomplete
          ? {
              selectedIds: values.tags ?? [],
              newNames: parseTagNames(values.newTags),
            }
          : undefined,
        markdown,
      );
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

function selectedTagIds(tagIds: string[], tags: Tag[]): string[] {
  const available = new Set(tags.map((tag) => tag.id));
  return tagIds.filter((id) => available.has(id));
}
