import { LocalStorage } from "@raycast/api";
import { DataSource } from "../lib/notion-client";

const SELECTED_SNIPPET_DATA_SOURCES_KEY = "selected-snippet-data-sources";
const LAST_SAVED_SNIPPET_DATA_SOURCE_ID_KEY = "last-saved-snippet-data-source-id";
const DATA_SOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSelectedSnippetDataSources(): Promise<DataSource[]> {
  return loadStoredDataSources(SELECTED_SNIPPET_DATA_SOURCES_KEY);
}

export async function saveSelectedSnippetDataSources(dataSources: DataSource[]): Promise<void> {
  await writeSelectedDataSources(SELECTED_SNIPPET_DATA_SOURCES_KEY, dataSources);
}

export async function loadLastSavedSnippetDataSourceId(): Promise<string | null> {
  const raw = await LocalStorage.getItem(LAST_SAVED_SNIPPET_DATA_SOURCE_ID_KEY);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function saveLastSavedSnippetDataSourceId(id: string): Promise<void> {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return;
  }
  await LocalStorage.setItem(LAST_SAVED_SNIPPET_DATA_SOURCE_ID_KEY, trimmed);
}

async function loadStoredDataSources(key: string): Promise<DataSource[]> {
  const raw = await LocalStorage.getItem(key);
  if (typeof raw !== "string" || raw.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredDataSource);
  } catch {
    return [];
  }
}

async function writeSelectedDataSources(key: string, dataSources: DataSource[]): Promise<void> {
  const stored = dataSources.map((dataSource) => ({ id: dataSource.id, title: dataSource.title }));
  await LocalStorage.setItem(key, JSON.stringify(stored));
}

function isStoredDataSource(value: unknown): value is { id: string; title: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && DATA_SOURCE_ID.test(record.id) && typeof record.title === "string";
}
