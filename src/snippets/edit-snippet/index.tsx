import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, showToast, useNavigation } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useMemo, useRef, useState } from "react";
import { dataSourceOptions } from "../../lib/data-sources";
import { loadTagsForDataSource, selectedTagIds } from "../../tags/tags";
import { loadSnippetForEdit, updateSnippet } from "../snippets";
import { loadSelectedSnippetDataSources } from "../storage";
import { Snippet } from "../types";
import { SnippetFormValues, resolveSnippetEdit } from "./form";

const UNTITLED = "Untitled";

export function EditSnippet({ snippet, onSaved }: { snippet: Snippet; onSaved: () => void }) {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const { pop } = useNavigation();
  const [isSaving, setIsSaving] = useState(false);
  const [dataSourceIdValue, setDataSourceIdValue] = useState<string | null>(null);
  const revealedFields = useRef(false);
  const { data, error: loadError, isLoading } = usePromise(loadSnippetForEdit, [token, snippet.id]);
  const {
    data: selected = [],
    error: selectionError,
    isLoading: isLoadingSelection,
  } = usePromise(loadSelectedSnippetDataSources);
  const dataSources = useMemo(
    () => dataSourceOptions(selected, { id: snippet.dataSourceId, title: snippet.dataSourceTitle }),
    [selected, snippet.dataSourceId, snippet.dataSourceTitle],
  );
  const selectedDataSourceId = dataSourceIdValue ?? snippet.dataSourceId;
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

  async function save(values: SnippetFormValues) {
    if (isSaving || isLoading || isLoadingSelection || isLoadingTags || error || !data) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Form is not ready",
        message: error?.message,
      });
      return;
    }

    const resolved = resolveSnippetEdit(values, data, Boolean(tagsData), dataSources);
    if ("error" in resolved) {
      await showToast({ style: Toast.Style.Failure, title: resolved.error });
      return;
    }

    const { dataSource, title, tags, body } = resolved.edit;
    setIsSaving(true);
    try {
      await updateSnippet(token, {
        pageId: snippet.id,
        fromDataSourceId: snippet.dataSourceId,
        dataSourceId: dataSource.id,
        title,
        tags,
        body,
      });
    } catch (saveError) {
      await showFailureToast(saveError, { title: "Could not update snippet" });
      return;
    } finally {
      setIsSaving(false);
    }

    onSaved();
    pop();
    await showToast({
      style: Toast.Style.Success,
      title: dataSource.id === snippet.dataSourceId ? "Snippet updated" : `Moved to ${dataSource.title}`,
    });
  }

  return (
    <Form
      isLoading={isSaving || isLoading || isLoadingSelection || isLoadingTags}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Update Snippet" icon={Icon.Pencil} onSubmit={save} />
        </ActionPanel>
      }
    >
      {error ? <Form.Description text={error.message} /> : null}
      {data && revealedFields.current ? (
        <>
          <Form.TextField
            id="title"
            title="Title"
            placeholder={UNTITLED}
            defaultValue={data.title}
            autoFocus={data.bodyTooLarge}
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
            <Form.Description title="Tags" text="This snippet has too many tags to edit here." />
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
