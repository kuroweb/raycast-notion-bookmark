import { BrowserExtension, getSelectedText } from "@raycast/api";
import { parseHttpUrl } from "../bookmark/url";
import { MAX_CLIP_CHARS, htmlToMarkdown, toMarkdown } from "./markdown";

export async function readActiveTab(): Promise<{ id: number; title: string; url: string } | null> {
  try {
    const tabs = await BrowserExtension.getTabs();
    const active = tabs.find((tab) => tab.active);
    const url = parseHttpUrl(active?.url);
    if (!active || !url) {
      return null;
    }
    return { id: active.id, title: active.title?.trim() ?? "", url };
  } catch {
    return null;
  }
}

export async function readPageClip(tabId?: number, pageUrl?: string): Promise<string> {
  try {
    const html = await BrowserExtension.getContent({
      format: "html",
      ...(tabId === undefined ? {} : { tabId }),
    });
    const markdown = htmlToMarkdown(html, pageUrl);
    if (markdown) {
      return markdown;
    }
  } catch {
    // Raycast browser extension may be missing.
  }

  try {
    const selected = (await getSelectedText()).trim();
    if (selected && !parseHttpUrl(selected)) {
      return toMarkdown(selected, pageUrl).slice(0, MAX_CLIP_CHARS);
    }
  } catch {
    // No selection in the previous app.
  }

  try {
    const text = (
      await BrowserExtension.getContent({
        format: "text",
        ...(tabId === undefined ? {} : { tabId }),
      })
    ).trim();
    return toMarkdown(text, pageUrl).slice(0, MAX_CLIP_CHARS);
  } catch {
    return "";
  }
}
