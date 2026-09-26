/**
 * `@raycast/api` は Raycast ランタイム外では使えないので、vitest.config.mts の alias で
 * このモジュールへ差し替える。テストは対象コードを普通に import すればよい。
 */
export { localStorageMock as LocalStorage } from "./local-storage";
export { browserExtensionMock as BrowserExtension, getSelectedTextMock as getSelectedText } from "./browser-extension";
export { CacheMock as Cache } from "./cache";
