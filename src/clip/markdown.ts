import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

export const MAX_CLIP_CHARS = 100_000;

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
  const heading = text.match(/^#\s+(.+?)(?:\n+|$)/);
  if (heading && heading[1].trim() === title.trim()) {
    return text.slice(heading[0].length).trim();
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
  const articleHtml = extractArticleHtml(document) || document.body?.innerHTML || html;
  return normalizeMarkdown(turndown.turndown(articleHtml)).slice(0, MAX_CLIP_CHARS);
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
};

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
