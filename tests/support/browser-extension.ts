import { vi } from "vitest";

/**
 * Raycast のブラウザ拡張と選択テキスト取得はランタイム外では使えないので、
 * clip-capture のテストではこのモックへ差し替える。
 */
export const browserExtensionMock = {
  getTabs: vi.fn(),
  getContent: vi.fn(),
};

export const getSelectedTextMock = vi.fn();

export function resetBrowserExtension(): void {
  browserExtensionMock.getTabs.mockReset();
  browserExtensionMock.getContent.mockReset();
  getSelectedTextMock.mockReset();
  browserExtensionMock.getTabs.mockRejectedValue(new Error("no browser extension"));
  browserExtensionMock.getContent.mockRejectedValue(new Error("no browser extension"));
  getSelectedTextMock.mockRejectedValue(new Error("no selection"));
}
