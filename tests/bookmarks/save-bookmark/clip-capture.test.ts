import { beforeEach, describe, expect, it } from "vitest";
import { readActiveTab, readPageClip } from "../../../src/bookmarks/save-bookmark/clip-capture";
import { browserExtensionMock, getSelectedTextMock, resetBrowserExtension } from "../../support/browser-extension";

beforeEach(resetBrowserExtension);

describe("readActiveTab", () => {
  it("active なタブの id・タイトル・URL を返す", async () => {
    browserExtensionMock.getTabs.mockResolvedValue([
      { id: 1, title: "Other", url: "https://example.com/other" },
      { id: 2, title: "  Active  ", url: "https://example.com/active", active: true },
    ]);

    expect(await readActiveTab()).toEqual({ id: 2, title: "Active", url: "https://example.com/active" });
  });

  it("タイトルがなければ空文字にする", async () => {
    browserExtensionMock.getTabs.mockResolvedValue([{ id: 1, url: "https://example.com/a", active: true }]);
    expect(await readActiveTab()).toEqual({ id: 1, title: "", url: "https://example.com/a" });
  });

  it("active なタブがない、URL が http/https でない場合は null", async () => {
    browserExtensionMock.getTabs.mockResolvedValue([{ id: 1, url: "https://example.com/a" }]);
    expect(await readActiveTab()).toBeNull();

    browserExtensionMock.getTabs.mockResolvedValue([{ id: 1, url: "chrome://newtab", active: true }]);
    expect(await readActiveTab()).toBeNull();
  });

  it("ブラウザ拡張がなければ null", async () => {
    expect(await readActiveTab()).toBeNull();
  });
});

describe("readPageClip", () => {
  it("HTML を markdown にして返し、tabId を渡す", async () => {
    browserExtensionMock.getContent.mockResolvedValue(
      "<article><p>body text long enough for readability to keep it around.</p></article>",
    );

    expect(await readPageClip(7, "https://example.com/a")).toContain("body text long enough");
    expect(browserExtensionMock.getContent).toHaveBeenCalledWith({ format: "html", tabId: 7 });
  });

  it("tabId がなければ渡さない", async () => {
    browserExtensionMock.getContent.mockResolvedValue("<article><p>body text long enough to survive.</p></article>");
    await readPageClip();
    expect(browserExtensionMock.getContent).toHaveBeenCalledWith({ format: "html" });
  });

  it("HTML が取れなければ選択テキストを使う", async () => {
    getSelectedTextMock.mockResolvedValue("  # Selected\n\n\n\nbody  ");
    expect(await readPageClip()).toBe("# Selected\n\nbody");
  });

  it("選択テキストが URL だけなら使わず、テキスト取得に進む", async () => {
    getSelectedTextMock.mockResolvedValue("https://example.com/a");
    browserExtensionMock.getContent.mockImplementation(async ({ format }: { format: string }) => {
      if (format === "html") {
        throw new Error("no browser extension");
      }
      return "  plain text body  ";
    });

    expect(await readPageClip()).toBe("plain text body");
  });

  it("すべて失敗すれば空文字", async () => {
    expect(await readPageClip()).toBe("");
  });

  it("HTML が空の markdown になれば次の手段へ進む", async () => {
    browserExtensionMock.getContent.mockImplementation(async ({ format }: { format: string }) =>
      format === "html" ? "   " : "text fallback",
    );

    expect(await readPageClip()).toBe("text fallback");
  });
});
