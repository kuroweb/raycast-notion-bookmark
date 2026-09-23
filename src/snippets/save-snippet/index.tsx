import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  LaunchProps,
  LaunchType,
  PopToRootType,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  getSelectedText,
  launchCommand,
  openExtensionPreferences,
  showHUD,
  showToast,
} from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useRef, useState } from "react";
import { DataSource } from "../../lib/notion-client";
import { loadTagsForDataSource, parseTagNames } from "../../tags/tags";
import { createSnippet } from "../snippets";
import { loadSelectedSnippetDataSources } from "../storage";

const UNTITLED = "Untitled";

type FormValues = {
  title?: string;
  body?: string;
  dataSourceId?: string;
  tags?: string[];
  newTags?: string;
};

type FormDefaults = {
  title: string;
  body: string;
  dataSourceId: string;
  dataSources: DataSource[];
};

export default function SaveSnippet(props: LaunchProps) {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const [isSaving, setIsSaving] = useState(false);
  const [dataSourceIdValue, setDataSourceIdValue] = useState<string | null>(null);
  const revealedFields = useRef(false);
  const { data, isLoading, error } = usePromise(loadFormDefaults, [props.fallbackText]);
  const dataSources = data?.dataSources ?? [];
  const selectedDataSourceId = dataSourceIdValue ?? data?.dataSourceId ?? "";
  const {
    data: tagsData,
    error: tagsError,
    isLoading: isLoadingTags,
  } = usePromise(loadTagsForDataSource, [token, selectedDataSourceId], {
    execute: selectedDataSourceId.length > 0,
  });
  const tagsPending = selectedDataSourceId.length > 0 && isLoadingTags;
  if (!error && dataSources.length > 0 && !tagsPending) {
    revealedFields.current = true;
  }

  async function save(values: FormValues) {
    if (isLoading || isSaving || tagsPending || error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Form is not ready",
        message: error?.message,
      });
      return;
    }

    const dataSource = dataSources.find((item) => item.id === values.dataSourceId);
    if (!dataSource) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Select a database",
      });
      return;
    }

    const body = values.body ?? "";
    if (body.trim().length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Snippet body is empty",
      });
      return;
    }

    const content = (values.title?.trim() || UNTITLED).slice(0, 2000);
    setIsSaving(true);
    try {
      await createSnippet(token, dataSource.id, content, body, {
        selectedIds: values.tags ?? [],
        newNames: parseTagNames(values.newTags),
      });
    } catch (saveError) {
      await showFailureToast(saveError, { title: "Could not save snippet" });
      return;
    } finally {
      setIsSaving(false);
    }

    const hud = `Saved to ${dataSource.title}`;
    try {
      await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
      await showHUD(hud);
    } catch {
      await showToast({ style: Toast.Style.Success, title: hud });
    }
  }

  return (
    <Form
      isLoading={isLoading || isSaving || tagsPending}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Snippet" onSubmit={save} />
          <Action
            title="Configure Snippet Databases"
            icon={Icon.Gear}
            onAction={() => {
              launchCommand({
                name: "configure-snippet-databases",
                type: LaunchType.UserInitiated,
              }).catch((configureError) =>
                showFailureToast(configureError, { title: "Could not open Configure Snippet Databases" }),
              );
            }}
          />
          <Action title="Open Extension Preferences" icon={Icon.Key} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      {error ? <Form.Description text={error.message} /> : null}
      {!error && !isLoading && dataSources.length === 0 ? (
        <Form.Description text="Open Configure Snippet Databases and choose which databases to use." />
      ) : null}
      {!error && dataSources.length > 0 && revealedFields.current ? (
        <>
          <Form.TextField id="title" title="Title" placeholder={UNTITLED} defaultValue={data?.title} />
          <Form.TextArea id="body" title="Body" placeholder="Snippet body" defaultValue={data?.body} autoFocus />
          <Form.Dropdown
            id="dataSourceId"
            title="Database"
            value={selectedDataSourceId}
            onChange={(id) => {
              setDataSourceIdValue(id);
            }}
          >
            {dataSources.map((dataSource) => (
              <Form.Dropdown.Item key={dataSource.id} value={dataSource.id} title={dataSource.title} />
            ))}
          </Form.Dropdown>
          {tagsError ? <Form.Description title="Tags" text={tagsError.message} /> : null}
          {tagsData && !isLoadingTags ? (
            <>
              <Form.TagPicker key={tagsData.tagsDataSourceId} id="tags" title="Tags" placeholder="Select tags">
                {tagsData.tags.map((tag) => (
                  <Form.TagPicker.Item key={tag.id} value={tag.id} title={tag.name} />
                ))}
              </Form.TagPicker>
              <Form.TextField id="newTags" title="New tags" placeholder="Comma-separated names to create" />
            </>
          ) : null}
        </>
      ) : null}
    </Form>
  );
}

async function loadFormDefaults(fallbackText: string | undefined): Promise<FormDefaults> {
  const dataSources = await loadSelectedSnippetDataSources();
  const dataSourceId = dataSources[0]?.id ?? "";
  return {
    title: UNTITLED,
    body: await readInitialBody(fallbackText),
    dataSourceId,
    dataSources,
  };
}

async function readInitialBody(fallbackText: string | undefined): Promise<string> {
  if (fallbackText !== undefined && fallbackText.length > 0) {
    return fallbackText;
  }

  try {
    const selected = await getSelectedText();
    if (selected.length > 0) {
      return selected;
    }
  } catch {
    // No selection in the previous app.
  }

  try {
    return (await Clipboard.readText()) ?? "";
  } catch {
    return "";
  }
}
