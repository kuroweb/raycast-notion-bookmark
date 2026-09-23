import { LocalStorage } from "@raycast/api";
import { DataSource } from "../lib/notion-client";

const SELECTED_DATA_SOURCES_KEY = "selected-data-sources";
const LAST_SAVED_DATA_SOURCE_ID_KEY = "last-saved-data-source-id";
const SAVE_CLIP_ENABLED_KEY = "save-clip-enabled";
const DATA_SOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSelectedDataSources(): Promise<DataSource[]> {
  return loadStoredDataSources(SELECTED_DATA_SOURCES_KEY);
}

export async function saveSelectedDataSources(dataSources: DataSource[]): Promise<void> {
  await writeSelectedDataSources(SELECTED_DATA_SOURCES_KEY, dataSources);
}

export async function loadLastSavedDataSourceId(): Promise<string | null> {
  const raw = await LocalStorage.getItem(LAST_SAVED_DATA_SOURCE_ID_KEY);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function saveLastSavedDataSourceId(id: string): Promise<void> {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return;
  }
  await LocalStorage.setItem(LAST_SAVED_DATA_SOURCE_ID_KEY, trimmed);
}

export async function loadSaveClipEnabled(): Promise<boolean> {
  const raw = await LocalStorage.getItem(SAVE_CLIP_ENABLED_KEY);
  return parseSaveClipEnabled(raw) ?? true;
}

export async function saveSaveClipEnabled(enabled: boolean): Promise<void> {
  await LocalStorage.setItem(SAVE_CLIP_ENABLED_KEY, enabled ? "true" : "false");
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

function parseSaveClipEnabled(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
}

function isStoredDataSource(value: unknown): value is { id: string; title: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && DATA_SOURCE_ID.test(record.id) && typeof record.title === "string";
}
