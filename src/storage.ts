import { LocalStorage } from "@raycast/api";
import { DataSource } from "./types";

const SELECTED_DATA_SOURCES_KEY = "selected-data-sources";
const LAST_SAVED_DATA_SOURCE_ID_KEY = "last-saved-data-source-id";
const DATA_SOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSelectedDataSources(): Promise<DataSource[]> {
  const raw = await LocalStorage.getItem(SELECTED_DATA_SOURCES_KEY);
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

export async function saveSelectedDataSources(dataSources: DataSource[]): Promise<void> {
  const stored = dataSources.map((dataSource) => ({ id: dataSource.id, title: dataSource.title }));
  await LocalStorage.setItem(SELECTED_DATA_SOURCES_KEY, JSON.stringify(stored));
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

function isStoredDataSource(value: unknown): value is { id: string; title: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && DATA_SOURCE_ID.test(record.id) && typeof record.title === "string";
}
