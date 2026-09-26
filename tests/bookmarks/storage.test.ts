import { beforeEach, describe, expect, it } from "vitest";
import {
  loadLastSavedDataSourceId,
  loadSaveClipEnabled,
  loadSelectedDataSources,
  saveLastSavedDataSourceId,
  saveSaveClipEnabled,
  saveSelectedDataSources,
} from "../../src/bookmarks/storage";
import { clearStore, setStoredItem, storedItem } from "../support/local-storage";

const SELECTED_KEY = "selected-data-sources";
const LAST_SAVED_KEY = "last-saved-data-source-id";
const SAVE_CLIP_KEY = "save-clip-enabled";

const dataSourceA = { id: "11111111-2222-3333-4444-555555555555", title: "Tech Bookmark" };
const dataSourceB = { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", title: "Work Bookmark" };

beforeEach(clearStore);

describe("選択したデータソース", () => {
  it("保存した id と title を読み戻す", async () => {
    await saveSelectedDataSources([dataSourceA, dataSourceB]);
    expect(await loadSelectedDataSources()).toEqual([dataSourceA, dataSourceB]);
  });

  it("id と title 以外の項目は保存しない", async () => {
    await saveSelectedDataSources([{ ...dataSourceA, extra: "drop me" } as never]);
    expect(JSON.parse(String(storedItem(SELECTED_KEY)))).toEqual([dataSourceA]);
  });

  it("未保存なら空配列", async () => {
    expect(await loadSelectedDataSources()).toEqual([]);
  });

  it("JSON として壊れていれば空配列", async () => {
    setStoredItem(SELECTED_KEY, "{not json");
    expect(await loadSelectedDataSources()).toEqual([]);
  });

  it("配列でなければ空配列", async () => {
    setStoredItem(SELECTED_KEY, JSON.stringify({ id: dataSourceA.id, title: dataSourceA.title }));
    expect(await loadSelectedDataSources()).toEqual([]);
  });

  it("UUID 形式でない id や title 欠落の要素は捨てる", async () => {
    setStoredItem(
      SELECTED_KEY,
      JSON.stringify([dataSourceA, { id: "not-a-uuid", title: "Bad" }, { id: dataSourceB.id }, null, "string"]),
    );
    expect(await loadSelectedDataSources()).toEqual([dataSourceA]);
  });
});

describe("最後に保存したデータソースの id", () => {
  it("前後の空白を除いて保存し、読み戻す", async () => {
    await saveLastSavedDataSourceId(`  ${dataSourceA.id}  `);
    expect(storedItem(LAST_SAVED_KEY)).toBe(dataSourceA.id);
    expect(await loadLastSavedDataSourceId()).toBe(dataSourceA.id);
  });

  it("空白だけの id は保存せず、既存の値も消さない", async () => {
    await saveLastSavedDataSourceId(dataSourceA.id);
    await saveLastSavedDataSourceId("   ");
    expect(await loadLastSavedDataSourceId()).toBe(dataSourceA.id);
  });

  it("未保存なら null", async () => {
    expect(await loadLastSavedDataSourceId()).toBeNull();
  });

  it("空文字が入っていれば null", async () => {
    setStoredItem(LAST_SAVED_KEY, "");
    expect(await loadLastSavedDataSourceId()).toBeNull();
  });

  // 選択済みデータソースと違い、こちらは UUID 形式を検証しない（保存先の候補と突き合わせる側で弾く）。
  it("UUID 形式でない値もそのまま返す", async () => {
    setStoredItem(LAST_SAVED_KEY, "not-a-uuid");
    expect(await loadLastSavedDataSourceId()).toBe("not-a-uuid");
  });
});

describe("本文を保存するかの設定", () => {
  it("未保存なら既定で有効", async () => {
    expect(await loadSaveClipEnabled()).toBe(true);
  });

  it("boolean を文字列で保存し、読み戻す", async () => {
    await saveSaveClipEnabled(false);
    expect(storedItem(SAVE_CLIP_KEY)).toBe("false");
    expect(await loadSaveClipEnabled()).toBe(false);

    await saveSaveClipEnabled(true);
    expect(storedItem(SAVE_CLIP_KEY)).toBe("true");
    expect(await loadSaveClipEnabled()).toBe(true);
  });

  it("true/false 以外の真偽表現も解釈する", async () => {
    setStoredItem(SAVE_CLIP_KEY, 0);
    expect(await loadSaveClipEnabled()).toBe(false);
    setStoredItem(SAVE_CLIP_KEY, "1");
    expect(await loadSaveClipEnabled()).toBe(true);
  });

  it("解釈できない値なら既定で有効", async () => {
    setStoredItem(SAVE_CLIP_KEY, "yes");
    expect(await loadSaveClipEnabled()).toBe(true);
  });
});
