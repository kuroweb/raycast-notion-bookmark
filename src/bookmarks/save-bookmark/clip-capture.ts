import { BrowserExtension, getSelectedText } from "@raycast/api";
import { truncateClip } from "../clip-limit";
import { parseHttpUrl } from "../url";
import { htmlToMarkdown, toMarkdown } from "./clip-markdown";

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
      return truncateClip(toMarkdown(selected, pageUrl));
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
    return truncateClip(toMarkdown(text, pageUrl));
  } catch {
    return "";
  }
}
