import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, showToast, useNavigation } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useMemo, useRef, useState } from "react";
import { dataSourceOptions } from "../../lib/data-sources";
import { loadTagsForDataSource, selectedTagIds } from "../../tags/tags";
import { loadBookmarkForEdit, updateBookmark } from "../bookmarks";
import { loadSelectedDataSources } from "../storage";
import { Bookmark } from "../types";
import { BookmarkFormValues, resolveBookmarkEdit } from "./form";

export function EditBookmark({ bookmark, onSaved }: { bookmark: Bookmark; onSaved: () => void }) {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const { pop } = useNavigation();
  const [isSaving, setIsSaving] = useState(false);
  const [dataSourceIdValue, setDataSourceIdValue] = useState<string | null>(null);
  const revealedFields = useRef(false);
  const { data, error: loadError, isLoading } = usePromise(loadBookmarkForEdit, [token, bookmark.id]);
  const {
    data: selected = [],
    error: selectionError,
    isLoading: isLoadingSelection,
  } = usePromise(loadSelectedDataSources);
  const dataSources = useMemo(
    () => dataSourceOptions(selected, { id: bookmark.dataSourceId, title: bookmark.dataSourceTitle }),
    [selected, bookmark.dataSourceId, bookmark.dataSourceTitle],
  );
  const selectedDataSourceId = dataSourceIdValue ?? bookmark.dataSourceId;
  const {
    data: tagsData,
    error: tagsError,
    isLoading: isLoadingTags,
  } = usePromise(loadTagsForDataSource, [token, selectedDataSourceId], {
    execute: selectedDataSourceId.length > 0,
  });

  const error = loadError ?? selectionError;
  // データベースを切り替えるとタグを読み直すが、入力済みの値を消さないよう一度出した項目は出したままにする。
  if (!error && data && !isLoadingSelection && !isLoadingTags) {
    revealedFields.current = true;
  }

  async function save(values: BookmarkFormValues) {
    if (isSaving || isLoading || isLoadingSelection || isLoadingTags || error || !data) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Form is not ready",
        message: error?.message,
      });
      return;
    }

    const resolved = resolveBookmarkEdit(values, data, Boolean(tagsData), dataSources);
    if ("error" in resolved) {
      await showToast({ style: Toast.Style.Failure, title: resolved.error });
      return;
    }

    const { dataSource, title, url, tags, markdown } = resolved.edit;
    setIsSaving(true);
    try {
      await updateBookmark(token, {
        pageId: bookmark.id,
        fromDataSourceId: bookmark.dataSourceId,
        dataSourceId: dataSource.id,
        title,
        url,
        tags,
        markdown,
      });
    } catch (saveError) {
      await showFailureToast(saveError, { title: "Could not update bookmark" });
      return;
    } finally {
      setIsSaving(false);
    }

    onSaved();
    pop();
    await showToast({
      style: Toast.Style.Success,
      title: dataSource.id === bookmark.dataSourceId ? "Bookmark updated" : `Moved to ${dataSource.title}`,
    });
  }

  return (
    <Form
      isLoading={isSaving || isLoading || isLoadingSelection || isLoadingTags}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Update Bookmark" icon={Icon.Pencil} onSubmit={save} />
        </ActionPanel>
      }
    >
      {error ? <Form.Description text={error.message} /> : null}
      {data && revealedFields.current ? (
        <>
          <Form.TextField
            id="title"
            title="Title"
            placeholder="Page title"
            defaultValue={data.title}
            autoFocus={Boolean(data.url)}
          />
          <Form.TextField
            id="url"
            title="URL"
            placeholder="https://"
            defaultValue={data.url ?? ""}
            autoFocus={!data.url}
          />
          <Form.Dropdown
            id="dataSourceId"
            title="Database"
            value={selectedDataSourceId}
            onChange={setDataSourceIdValue}
          >
            {dataSources.map((dataSource) => (
              <Form.Dropdown.Item key={dataSource.id} value={dataSource.id} title={dataSource.title} />
            ))}
          </Form.Dropdown>
          {data.tagsIncomplete ? (
            <Form.Description title="Tags" text="This bookmark has too many tags to edit here." />
          ) : null}
          {tagsError ? <Form.Description title="Tags" text={tagsError.message} /> : null}
          {tagsData && !isLoadingTags && !data.tagsIncomplete ? (
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
