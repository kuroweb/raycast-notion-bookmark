import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { MAX_CLIP_CHARS } from "../clip-limit";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  hr: "---",
  emDelimiter: "*",
  strongDelimiter: "**",
});

turndown.addRule("strikethrough", {
  filter: ["del", "s"],
  replacement(content: string) {
    return content ? `~~${content}~~` : "";
  },
});

export function prepareClip(markdown: string, title: string): string {
  const text = markdown.slice(0, MAX_CLIP_CHARS);
  const cover = text.match(/^!\[[^\]]*\]\([^)]+\)\n*/);
  const prefix = cover?.[0] ?? "";
  const rest = text.slice(prefix.length);
  const heading = rest.match(/^#{1,2}\s+(.+?)(?:\n+|$)/);
  if (heading && heading[1].trim() === title.trim()) {
    const stripped = rest.slice(heading[0].length).trim();
    return [prefix.trim(), stripped].filter(Boolean).join("\n\n");
  }
  return text;
}

export function toMarkdown(clip: string, pageUrl?: string): string {
  const trimmed = clip.trim();
  if (!trimmed) {
    return "";
  }
  if (looksLikeHtml(trimmed)) {
    return htmlToMarkdown(trimmed, pageUrl);
  }
  return normalizeMarkdown(trimmed);
}

export function htmlToMarkdown(html: string, pageUrl?: string): string {
  const document = parseDocument(html, pageUrl);
  const coverUrl = coverImageUrl(document, pageUrl);
  const articleHtml = extractArticleHtml(document) || document.body?.innerHTML || html;
  const markdown = normalizeMarkdown(turndown.turndown(articleHtml));
  return withLeadingCover(markdown, coverUrl).slice(0, MAX_CLIP_CHARS);
}

function extractArticleHtml(document: ClipDocument): string {
  try {
    const article = new Readability(document as ConstructorParameters<typeof Readability>[0], {
      charThreshold: 20,
    }).parse();
    return article?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

function parseDocument(html: string, pageUrl?: string): ClipDocument {
  return parseHTML(withBaseUrl(html, pageUrl)).document as ClipDocument;
}

type ClipDocument = {
  body?: { innerHTML?: string };
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
};

const COVER_IMAGE_SELECTORS = [
  ['meta[property="og:image"]', "content"],
  ['meta[name="twitter:image"]', "content"],
  ['link[rel="image_src"]', "href"],
] as const;

function coverImageUrl(document: ClipDocument, pageUrl?: string): string | null {
  const base = pageUrl ?? document.querySelector("base")?.getAttribute("href") ?? undefined;
  for (const [selector, attribute] of COVER_IMAGE_SELECTORS) {
    const url = absoluteHttpUrl(document.querySelector(selector)?.getAttribute(attribute), base);
    if (url) {
      return url;
    }
  }
  return null;
}

function withLeadingCover(markdown: string, coverUrl: string | null): string {
  if (!coverUrl) {
    return markdown;
  }
  const image = `![](${coverUrl.replace(/\)/g, "%29")})`;
  if (markdown.startsWith(image) || leadingMarkdownImageUrl(markdown) === coverUrl) {
    return markdown;
  }
  return markdown ? `${image}\n\n${markdown}` : image;
}

function leadingMarkdownImageUrl(markdown: string): string | undefined {
  return markdown.match(/^!\[[^\]]*\]\(([^)]+)\)/)?.[1];
}

function absoluteHttpUrl(value: string | null | undefined, base?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed, base);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function withBaseUrl(html: string, pageUrl?: string): string {
  if (!pageUrl || /<base\s/i.test(html)) {
    return html;
  }

  const base = `<base href="${escapeAttr(pageUrl)}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${base}`);
  }
  return `<!DOCTYPE html><html><head>${base}</head><body>${html}</body></html>`;
}

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("<") && /<\/[a-z][a-z0-9]*\s*>/i.test(trimmed);
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
