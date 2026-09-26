import type { LocalStorage } from "@raycast/api";

/**
 * LocalStorage のインメモリ実装。[[raycast-api.ts]] 経由で `@raycast/api` に差し替わる。
 * モジュール単位の状態を持つので、各テストは beforeEach(clearStore) で始める。
 */
const store = new Map<string, string | number | boolean>();

export const localStorageMock: Pick<typeof LocalStorage, "getItem" | "setItem" | "removeItem" | "clear"> = {
  async getItem<T extends LocalStorage.Value = LocalStorage.Value>(key: string) {
    return store.get(key) as T | undefined;
  },
  async setItem(key: string, value: string | number | boolean) {
    store.set(key, value);
  },
  async removeItem(key: string) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
};

export function setStoredItem(key: string, value: string | number | boolean): void {
  store.set(key, value);
}

export function storedItem(key: string): string | number | boolean | undefined {
  return store.get(key);
}

export function clearStore(): void {
  store.clear();
}
