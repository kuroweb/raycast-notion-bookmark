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
  launchCommand,
  openExtensionPreferences,
  showHUD,
  showToast,
} from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useRef, useState } from "react";
import { hostname, parseHttpUrl } from "./bookmark/url";
import { readActiveTab, readPageClip } from "./clip/capture";
import { prepareClip, toMarkdown } from "./clip/markdown";
import { createBookmark, findBookmarksByUrl } from "./notion/bookmarks";
import { loadTagsForDataSource, parseTagNames } from "./notion/tags";
import {
  loadLastSavedDataSourceId,
  loadSaveClipEnabled,
  loadSelectedDataSources,
  saveLastSavedDataSourceId,
  saveSaveClipEnabled,
} from "./storage";
import { DataSource } from "./types";

type FormValues = {
  title?: string;
  url?: string;
  dataSourceId?: string;
  tags?: string[];
  newTags?: string;
  saveClip?: boolean;
  clip?: string;
};

type FormDefaults = {
  title: string;
  url: string;
  clip: string;
  saveClip: boolean;
  dataSourceId: string;
  dataSources: DataSource[];
};

export default function SaveBookmark(props: LaunchProps) {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const [isSaving, setIsSaving] = useState(false);
  const [urlValue, setUrlValue] = useState<string | null>(null);
  const [dataSourceIdValue, setDataSourceIdValue] = useState<string | null>(null);
  const [saveClipValue, setSaveClipValue] = useState<boolean | null>(null);
  const [clipValue, setClipValue] = useState<string | null>(null);
  const revealedFields = useRef(false);
  const { data, isLoading, error } = usePromise(loadFormDefaults, [props.fallbackText]);
  const dataSources = data?.dataSources ?? [];
  const urlForLookup = urlValue ?? data?.url ?? "";
  const selectedDataSourceId = dataSourceIdValue ?? data?.dataSourceId ?? "";
  const saveClipEnabled = saveClipValue ?? data?.saveClip ?? true;
  const { data: existing = [] } = usePromise(findBookmarksByUrl, [token, dataSources, urlForLookup], {
    execute: dataSources.length > 0 && parseHttpUrl(urlForLookup) !== null,
  });
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
  const existingInTarget =
    existing.find((bookmark) => bookmark.dataSourceId === selectedDataSourceId) ?? existing[0] ?? null;

  function handleSaveClipChange(enabled: boolean) {
    setSaveClipValue(enabled);
    saveSaveClipEnabled(enabled).catch(() => undefined);
    if (!enabled || (clipValue ?? data?.clip ?? "").length > 0) {
      return;
    }
    readPageClip(undefined, parseHttpUrl(urlValue ?? data?.url) ?? undefined)
      .then((clip) => {
        if (clip) {
          setClipValue(clip);
        }
      })
      .catch(() => undefined);
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

    const url = parseHttpUrl(values.url);
    if (!url) {
      await showToast({
        style: Toast.Style.Failure,
        title: "URL must start with http:// or https://",
      });
      return;
    }

    const content = (values.title?.trim() || hostname(url)).slice(0, 2000) || "Untitled";
    setIsSaving(true);
    let hud: string | undefined;
    try {
      const duplicates = await findBookmarksByUrl(token, dataSources, url, dataSource.id);
      const alreadySaved = duplicates.find((bookmark) => bookmark.dataSourceId === dataSource.id);
      await saveLastSavedDataSourceId(dataSource.id);
      const saveClip = saveClipEnabled;
      await saveSaveClipEnabled(saveClip);
      if (alreadySaved) {
        hud = `Already saved in ${dataSource.title}`;
      } else {
        const clip = values.clip?.trim() || (await readPageClip(undefined, url));
        const markdown = saveClip ? prepareClip(toMarkdown(clip, url), content) : "";
        await createBookmark(token, dataSource.id, content, url, markdown || undefined, {
          selectedIds: values.tags ?? [],
          newNames: parseTagNames(values.newTags),
        });
        hud = `Saved to ${dataSource.title}`;
      }
    } catch (saveError) {
      await showFailureToast(saveError, { title: "Could not save bookmark" });
      return;
    } finally {
      setIsSaving(false);
    }

    if (!hud) {
      return;
    }

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
          <Action.SubmitForm
            title={existingInTarget?.dataSourceId === selectedDataSourceId ? "Already Saved" : "Save Bookmark"}
            onSubmit={save}
          />
          {existingInTarget ? (
            <Action.OpenInBrowser title="Open Existing Bookmark" url={existingInTarget.notionUrl} />
          ) : null}
          <Action
            title="Configure Databases"
            icon={Icon.Gear}
            onAction={() => {
              launchCommand({
                name: "configure-databases",
                type: LaunchType.UserInitiated,
              }).catch((configureError) =>
                showFailureToast(configureError, { title: "Could not open Configure Databases" }),
              );
            }}
          />
          <Action title="Open Extension Preferences" icon={Icon.Key} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      {error ? <Form.Description text={error.message} /> : null}
      {!error && !isLoading && dataSources.length === 0 ? (
        <Form.Description text="Open Configure Databases and choose which databases to use." />
      ) : null}
      {!error && dataSources.length > 0 && revealedFields.current ? (
        <>
          <Form.Description title="Status" text={savedStatusText(existing)} />
          <Form.TextField
            id="url"
            title="URL"
            placeholder="https://"
            defaultValue={data?.url}
            autoFocus={!data?.url}
            onChange={setUrlValue}
          />
          <Form.TextField
            id="title"
            title="Title"
            placeholder="Page title"
            defaultValue={data?.title}
            autoFocus={Boolean(data?.url) && !data?.title}
          />
          <Form.Dropdown
            id="dataSourceId"
            title="Database"
            value={selectedDataSourceId}
            storeValue
            onChange={(id) => {
              setDataSourceIdValue(id);
              saveLastSavedDataSourceId(id).catch(() => undefined);
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
          <Form.Checkbox
            id="saveClip"
            title="Page clip"
            label="Save page clip"
            value={saveClipEnabled}
            onChange={handleSaveClipChange}
          />
          <Form.TextArea
            id="clip"
            placeholder="Selected text or page content. Requires the Raycast browser extension."
            value={clipValue ?? data?.clip ?? ""}
            onChange={setClipValue}
          />
        </>
      ) : null}
    </Form>
  );
}

async function loadFormDefaults(fallbackText: string | undefined): Promise<FormDefaults> {
  const dataSources = await loadSelectedDataSources();
  const [lastId, saveClip] = await Promise.all([loadLastSavedDataSourceId(), loadSaveClipEnabled()]);
  const dataSourceId = preferredDataSourceId(dataSources, lastId ?? undefined) ?? dataSources[0]?.id ?? "";
  const fallbackUrl = parseHttpUrl(fallbackText);
  if (fallbackUrl) {
    const tab = await readActiveTab();
    if (tab && tab.url === fallbackUrl) {
      return {
        title: tab.title,
        url: fallbackUrl,
        clip: saveClip ? await readPageClip(tab.id, tab.url) : "",
        saveClip,
        dataSourceId,
        dataSources,
      };
    }

    return {
      title: "",
      url: fallbackUrl,
      clip: "",
      saveClip,
      dataSourceId,
      dataSources,
    };
  }

  const fallbackTitle = fallbackText?.trim() ?? "";
  const tab = await readActiveTab();
  if (tab) {
    return {
      title: fallbackTitle || tab.title,
      url: tab.url,
      clip: saveClip ? await readPageClip(tab.id, tab.url) : "",
      saveClip,
      dataSourceId,
      dataSources,
    };
  }

  let clipboardUrl: string | null = null;
  try {
    clipboardUrl = parseHttpUrl(await Clipboard.readText());
  } catch {
    clipboardUrl = null;
  }
  if (clipboardUrl) {
    return { title: fallbackTitle, url: clipboardUrl, clip: "", saveClip, dataSourceId, dataSources };
  }

  return {
    title: fallbackTitle,
    url: "",
    clip: "",
    saveClip,
    dataSourceId,
    dataSources,
  };
}

function preferredDataSourceId(dataSources: DataSource[], id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  return dataSources.some((dataSource) => dataSource.id === id) ? id : undefined;
}

function savedStatusText(bookmarks: { dataSourceTitle: string }[]): string {
  if (bookmarks.length === 0) {
    return "Not saved";
  }

  const names = [...new Set(bookmarks.map((bookmark) => bookmark.dataSourceTitle))];
  return `Already saved in ${names.join(", ")}`;
}
