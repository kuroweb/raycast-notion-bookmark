import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  LaunchType,
  List,
  getPreferenceValues,
  launchCommand,
  openExtensionPreferences,
} from "@raycast/api";
import { getFavicon, showFailureToast, useCachedPromise, usePromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { hostname } from "./bookmark/url";
import { EditBookmark } from "./edit-bookmark";
import { loadBookmarks } from "./notion/bookmarks";
import { matchKey } from "./notion/tags";
import { loadSelectedDataSources } from "./storage";
import { Bookmark } from "./types";

const ALL_DATA_SOURCES = "all";

export default function SearchBookmarks() {
  const token = getPreferenceValues<Preferences>().notionToken.trim();
  const [query, setQuery] = useState("");
  const [dataSourceId, setDataSourceId] = useState(ALL_DATA_SOURCES);
  const {
    data: selected = [],
    isLoading: isLoadingSelection,
    error: selectionError,
  } = usePromise(loadSelectedDataSources);
  const {
    data: bookmarks = [],
    isLoading: isLoadingBookmarks,
    error: bookmarksError,
    revalidate,
  } = useCachedPromise(loadBookmarks, [token, selected], { execute: selected.length > 0 });

  const error = selectionError ?? bookmarksError;
  const filtered = useMemo(() => filterBookmarks(bookmarks, query, dataSourceId), [bookmarks, query, dataSourceId]);

  return (
    <List
      isLoading={isLoadingSelection || isLoadingBookmarks}
      filtering={false}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search title, URL, or tag"
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
          description="Open Configure Databases and choose which databases to search."
          actions={
            <ActionPanel>
              <SettingsActions />
            </ActionPanel>
          }
        />
      ) : null}
      {!error && selected.length > 0 && filtered.length === 0 && !isLoadingBookmarks ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No results"
          description="Title, URL, and tags were searched."
          actions={
            <ActionPanel>
              <SaveBookmarkAction />
              <SettingsActions />
            </ActionPanel>
          }
        />
      ) : null}
      {filtered.map((bookmark) => (
        <BookmarkItem key={bookmark.id} bookmark={bookmark} onReload={revalidate} />
      ))}
    </List>
  );
}

function BookmarkItem({ bookmark, onReload }: { bookmark: Bookmark; onReload: () => void }) {
  const openUrl = bookmark.url ?? bookmark.notionUrl;
  const subtitle = bookmark.url ? hostname(bookmark.url) : "Notion";

  return (
    <List.Item
      title={bookmark.title}
      subtitle={subtitle}
      icon={bookmark.url ? getFavicon(bookmark.url, { fallback: Icon.Link }) : Icon.Document}
      accessories={[
        { tag: bookmark.dataSourceTitle },
        // Cached entries from before tags existed have no tags field.
        ...(bookmark.tags ?? []).slice(0, 3).map((name) => ({ tag: name })),
      ]}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url={openUrl} />
          {bookmark.url ? <Action.OpenInBrowser title="Open in Notion" url={bookmark.notionUrl} /> : null}
          <Action.Push
            title="Edit Bookmark"
            icon={Icon.Pencil}
            shortcut={Keyboard.Shortcut.Common.Edit}
            target={<EditBookmark bookmark={bookmark} onSaved={onReload} />}
          />
          <Action.CopyToClipboard title="Copy URL" content={openUrl} />
          <Action.CopyToClipboard title="Copy Notion URL" content={bookmark.notionUrl} />
          <SaveBookmarkAction />
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

function SaveBookmarkAction() {
  return (
    <Action
      title="Save Bookmark"
      icon={Icon.Plus}
      shortcut={Keyboard.Shortcut.Common.New}
      onAction={() => {
        launchCommand({
          name: "save-bookmark",
          type: LaunchType.UserInitiated,
        }).catch((error) => showFailureToast(error, { title: "Could not open Save Bookmark" }));
      }}
    />
  );
}

function SettingsActions() {
  return (
    <ActionPanel.Section>
      <Action
        title="Configure Databases"
        icon={Icon.Gear}
        onAction={() => {
          launchCommand({
            name: "configure-databases",
            type: LaunchType.UserInitiated,
          }).catch((error) => showFailureToast(error, { title: "Could not open Configure Databases" }));
        }}
      />
      <Action title="Open Extension Preferences" icon={Icon.Key} onAction={openExtensionPreferences} />
    </ActionPanel.Section>
  );
}

function filterBookmarks(bookmarks: Bookmark[], query: string, dataSourceId: string): Bookmark[] {
  const scoped =
    dataSourceId === ALL_DATA_SOURCES ? bookmarks : bookmarks.filter((item) => item.dataSourceId === dataSourceId);
  const terms = matchKey(query.trim()).split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return scoped;
  }

  return scoped.filter((bookmark) => terms.every((term) => bookmark.searchText.includes(term)));
}
