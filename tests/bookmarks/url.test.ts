import { describe, expect, it } from "vitest";
import { hostname, parseHttpUrl, urlEqualsVariants, urlsMatch } from "../../src/bookmarks/url";

describe("parseHttpUrl", () => {
  it("http と https の URL は前後の空白を除いて返す", () => {
    expect(parseHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(parseHttpUrl("  http://example.com/a  ")).toBe("http://example.com/a");
  });

  it("空・未入力は null", () => {
    expect(parseHttpUrl("")).toBeNull();
    expect(parseHttpUrl(null)).toBeNull();
    expect(parseHttpUrl(undefined)).toBeNull();
  });

  it("http/https 以外のスキームと URL でない文字列は null", () => {
    expect(parseHttpUrl("ftp://example.com")).toBeNull();
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("example.com")).toBeNull();
    expect(parseHttpUrl("not a url")).toBeNull();
  });
});

describe("hostname", () => {
  it("www. を落としたホスト名を返す", () => {
    expect(hostname("https://www.example.com/a?b=1")).toBe("example.com");
    expect(hostname("https://docs.example.com/a")).toBe("docs.example.com");
  });

  it("URL として解釈できない値はそのまま返す", () => {
    expect(hostname("not a url")).toBe("not a url");
  });
});

describe("urlsMatch", () => {
  it("fragment、末尾スラッシュ、ホスト名の大文字小文字を無視して一致する", () => {
    expect(urlsMatch("https://example.com/a", "https://example.com/a#section")).toBe(true);
    expect(urlsMatch("https://example.com/a/", "https://example.com/a")).toBe(true);
    expect(urlsMatch("https://EXAMPLE.com/a", "https://example.com/a")).toBe(true);
    expect(urlsMatch("https://example.com", "https://example.com/")).toBe(true);
  });

  it("パス、クエリ、スキームが違えば一致しない", () => {
    expect(urlsMatch("https://example.com/a", "https://example.com/b")).toBe(false);
    expect(urlsMatch("https://example.com/a", "https://example.com/a?x=1")).toBe(false);
    expect(urlsMatch("http://example.com/a", "https://example.com/a")).toBe(false);
    expect(urlsMatch("https://example.com/A", "https://example.com/a")).toBe(false);
  });

  it("片方でも http/https でなければ一致しない", () => {
    expect(urlsMatch("ftp://example.com", "ftp://example.com")).toBe(false);
    expect(urlsMatch("", "")).toBe(false);
  });
});

describe("urlEqualsVariants", () => {
  it("末尾スラッシュ有無の両方を返し、fragment は落とす", () => {
    expect(urlEqualsVariants("https://example.com/a#x").sort()).toEqual(
      ["https://example.com/a", "https://example.com/a/"].sort(),
    );
    expect(urlEqualsVariants("https://example.com/a/").sort()).toEqual(
      ["https://example.com/a", "https://example.com/a/"].sort(),
    );
  });

  it("ルートはスキーム+ホストの形も含む", () => {
    expect(urlEqualsVariants("https://example.com/").sort()).toEqual(
      ["https://example.com", "https://example.com/"].sort(),
    );
  });

  it("クエリは保持する", () => {
    expect(urlEqualsVariants("https://example.com/a?x=1")).toContain("https://example.com/a?x=1");
  });

  // findBookmarksByUrl は variants で Notion に問い合わせ、結果を urlsMatch で再確認する。
  // ここがズレると「Notion からは引けたのに最後に全部落ちる」= 保存済み判定の漏れになる。
  it("生成した変種はすべて元の URL と一致する", () => {
    for (const url of ["https://example.com", "https://example.com/a/", "https://example.com/a?x=1#f"]) {
      for (const variant of urlEqualsVariants(url)) {
        expect(urlsMatch(variant, url)).toBe(true);
      }
    }
  });

  it("http/https 済みの URL を前提にしており、不正値では例外を投げる", () => {
    expect(() => urlEqualsVariants("not a url")).toThrow();
  });
});
