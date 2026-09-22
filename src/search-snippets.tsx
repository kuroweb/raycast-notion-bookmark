import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  Keyboard,
  LaunchType,
  List,
  PopToRootType,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  launchCommand,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { showFailureToast, useCachedPromise, usePromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { EditSnippet } from "./edit-snippet";
import { loadSnippetMarkdown, loadSnippets } from "./notion/snippets";
import { matchKey } from "./notion/tags";
import { loadSelectedSnippetDataSources } from "./storage";
import { Snippet } from "./types";

const ALL_DATA_SOURCES = "all";

export default function SearchSnippets() {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const [query, setQuery] = useState("");
  const [dataSourceId, setDataSourceId] = useState(ALL_DATA_SOURCES);
  const {
    data: selected = [],
    isLoading: isLoadingSelection,
    error: selectionError,
  } = usePromise(loadSelectedSnippetDataSources);
  const {
    data: snippets = [],
    isLoading: isLoadingSnippets,
    error: snippetsError,
    revalidate,
  } = useCachedPromise(loadSnippets, [token, selected], { execute: selected.length > 0 });

  const error = selectionError ?? snippetsError;
  const filtered = useMemo(() => filterSnippets(snippets, query, dataSourceId), [snippets, query, dataSourceId]);

  return (
    <List
      isLoading={isLoadingSelection || isLoadingSnippets}
      isShowingDetail={!error && filtered.length > 0}
      filtering={false}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search title, body, or tag"
      searchBarAccessory={
        selected.length > 0 ? (
          <List.Dropdown tooltip="Database" value={dataSourceId} onChange={setDataSourceId}>
            <List.Dropdown.Item title="All Databases" value={ALL_DATA_SOURCES} />
            {selected.map((dataSource) => (
              <List.Dropdown.Item key={dataSource.id} title={dataSource.title} value={dataSource.id} />
            ))}
          </List.Dropdown>
        ) : undefined
      }
    >
      {error ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Failed to load"
          description={error.message}
          actions={
            <ActionPanel>
              <SettingsActions />
            </ActionPanel>
          }
        />
      ) : null}
      {!error && selected.length === 0 && !isLoadingSelection ? (
        <List.EmptyView
          icon={Icon.Gear}
          title="No databases selected"
          description="Open Configure Snippet Databases and choose which databases to search."
          actions={
            <ActionPanel>
              <SettingsActions />
            </ActionPanel>
          }
        />
      ) : null}
      {!error && selected.length > 0 && filtered.length === 0 && !isLoadingSnippets ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No results"
          description="Title, body, and tags were searched."
          actions={
            <ActionPanel>
              <SaveSnippetAction />
              <SettingsActions />
            </ActionPanel>
          }
        />
      ) : null}
      {filtered.map((snippet) => (
        <SnippetItem key={snippet.id} snippet={snippet} token={token} onReload={revalidate} />
      ))}
    </List>
  );
}

function SnippetItem({ snippet, token, onReload }: { snippet: Snippet; token: string; onReload: () => void }) {
  return (
    <List.Item
      id={snippet.id}
      title={snippet.title}
      icon={Icon.Document}
      accessories={[{ tag: snippet.dataSourceTitle }, ...snippet.tags.slice(0, 3).map((name) => ({ tag: name }))]}
      detail={<List.Item.Detail markdown={previewMarkdown(snippet.body ?? "", snippet.truncated === true)} />}
      actions={
        <ActionPanel>
          <Action title="Paste Snippet" icon={Icon.Clipboard} onAction={() => pasteSnippet(token, snippet.id)} />
          <Action.Push
            title="Edit Snippet"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Edit}
            target={<EditSnippet snippet={snippet} onSaved={onReload} />}
          />
          <SaveSnippetAction />
          <Action
            title="Reload"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={onReload}
          />
          <SettingsActions />
        </ActionPanel>
      }
    />
  );
}

function previewMarkdown(markdown: string, truncated: boolean): string {
  if (truncated) {
    const body = markdown.trim().length === 0 ? "" : asPlainPreview(markdown);
    return body ? `${body}\n\n*Body was truncated.*` : "*Body was truncated.*";
  }
  if (markdown.trim().length === 0) {
    return "*Snippet body is empty*";
  }
  return asPlainPreview(markdown);
}

function asPlainPreview(text: string): string {
  const fence = codeFence(text);
  return `${fence}\n${text}\n${fence}`;
}

function codeFence(text: string): string {
  let length = 3;
  for (const match of text.matchAll(/`+/g)) {
    length = Math.max(length, match[0].length + 1);
  }
  return "`".repeat(length);
}

async function pasteSnippet(token: string, pageId: string) {
  try {
    const snippet = await loadSnippetMarkdown(token, pageId);
    if (snippet.truncated) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Snippet body is too large to paste",
      });
      return;
    }
    if (snippet.body.trim().length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Snippet body is empty",
      });
      return;
    }

    await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
    await Clipboard.paste(snippet.body);
  } catch (error) {
    await showFailureToast(error, { title: "Could not paste snippet" });
  }
}

function SaveSnippetAction() {
  return (
    <Action
      title="Save Snippet"
      icon={Icon.Plus}
      shortcut={Keyboard.Shortcut.Common.New}
      onAction={() => {
        launchCommand({
          name: "save-snippet",
          type: LaunchType.UserInitiated,
        }).catch((error) => showFailureToast(error, { title: "Could not open Save Snippet" }));
      }}
    />
  );
}

function SettingsActions() {
  return (
    <ActionPanel.Section>
      <Action
        title="Configure Snippet Databases"
        icon={Icon.Gear}
        onAction={() => {
          launchCommand({
            name: "configure-snippet-databases",
            type: LaunchType.UserInitiated,
          }).catch((error) => showFailureToast(error, { title: "Could not open Configure Snippet Databases" }));
        }}
      />
      <Action title="Open Extension Preferences" icon={Icon.Key} onAction={openExtensionPreferences} />
    </ActionPanel.Section>
  );
}

function filterSnippets(snippets: Snippet[], query: string, dataSourceId: string): Snippet[] {
  const scoped =
    dataSourceId === ALL_DATA_SOURCES ? snippets : snippets.filter((item) => item.dataSourceId === dataSourceId);
  const terms = matchKey(query.trim()).split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return scoped;
  }

  return scoped.filter((snippet) => terms.every((term) => snippet.searchText.includes(term)));
}
