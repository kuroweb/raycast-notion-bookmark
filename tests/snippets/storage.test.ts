import { beforeEach, describe, expect, it } from "vitest";
import {
  loadLastSavedSnippetDataSourceId,
  loadSelectedSnippetDataSources,
  saveLastSavedSnippetDataSourceId,
  saveSelectedSnippetDataSources,
} from "../../src/snippets/storage";
import { clearStore, setStoredItem, storedItem } from "../support/local-storage";

const SELECTED_KEY = "selected-snippet-data-sources";
const LAST_SAVED_KEY = "last-saved-snippet-data-source-id";

const dataSource = { id: "11111111-2222-3333-4444-555555555555", title: "Snippets" };

beforeEach(clearStore);

describe("選択したスニペットのデータソース", () => {
  it("ブックマークとは別のキーに保存する", async () => {
    await saveSelectedSnippetDataSources([dataSource]);
    expect(JSON.parse(String(storedItem(SELECTED_KEY)))).toEqual([dataSource]);
    expect(storedItem("selected-data-sources")).toBeUndefined();
    expect(await loadSelectedSnippetDataSources()).toEqual([dataSource]);
  });

  it("未保存・壊れた値・不正な要素は空配列に落とす", async () => {
    expect(await loadSelectedSnippetDataSources()).toEqual([]);

    setStoredItem(SELECTED_KEY, "{not json");
    expect(await loadSelectedSnippetDataSources()).toEqual([]);

    setStoredItem(SELECTED_KEY, JSON.stringify([{ id: "not-a-uuid", title: "Bad" }]));
    expect(await loadSelectedSnippetDataSources()).toEqual([]);
  });
});

describe("最後に保存したスニペットのデータソースの id", () => {
  it("前後の空白を除いて保存し、読み戻す", async () => {
    await saveLastSavedSnippetDataSourceId(`  ${dataSource.id}  `);
    expect(storedItem(LAST_SAVED_KEY)).toBe(dataSource.id);
    expect(await loadLastSavedSnippetDataSourceId()).toBe(dataSource.id);
  });

  it("空白だけの id は保存せず、未保存なら null", async () => {
    await saveLastSavedSnippetDataSourceId("   ");
    expect(await loadLastSavedSnippetDataSourceId()).toBeNull();
  });
});
