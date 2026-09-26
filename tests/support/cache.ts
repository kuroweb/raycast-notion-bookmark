/**
 * Cache のインメモリ実装。[[raycast-api.ts]] 経由で `@raycast/api` に差し替わる。
 * namespace ごとに状態を持つので、各テストは beforeEach(clearCaches) で始める。
 */
const stores = new Map<string, Map<string, string>>();

export class CacheMock {
  private readonly store: Map<string, string>;

  constructor(options?: { namespace?: string }) {
    const namespace = options?.namespace ?? "";
    const store = stores.get(namespace) ?? new Map<string, string>();
    stores.set(namespace, store);
    this.store = store;
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, data: string): void {
    this.store.set(key, data);
  }

  remove(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export function clearCaches(): void {
  // モジュール読み込み時に作られた Cache が store を参照し続けるので、中身だけ空にする。
  for (const store of stores.values()) {
    store.clear();
  }
}
