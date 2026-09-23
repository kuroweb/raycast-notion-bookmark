import { URL } from "node:url";

export function parseHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

export function urlsMatch(left: string, right: string): boolean {
  const a = canonicalBookmarkUrl(left);
  const b = canonicalBookmarkUrl(right);
  return a !== null && a === b;
}

export function urlEqualsVariants(url: string): string[] {
  const parsed = new URL(url);
  parsed.hash = "";
  const variants = new Set<string>([parsed.toString()]);
  if (parsed.pathname === "/") {
    variants.add(`${parsed.protocol}//${parsed.host}`);
    variants.add(`${parsed.protocol}//${parsed.host}/`);
  } else if (parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
    variants.add(parsed.toString());
  } else {
    parsed.pathname = `${parsed.pathname}/`;
    variants.add(parsed.toString());
  }
  return [...variants];
}

function canonicalBookmarkUrl(value: string): string | null {
  const parsed = parseHttpUrl(value);
  if (!parsed) {
    return null;
  }

  const url = new URL(parsed);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
