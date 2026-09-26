import { describe, expect, it } from "vitest";
import { MAX_CLIP_CHARS } from "../../../src/bookmarks/clip-limit";
import { htmlToMarkdown, prepareClip, toMarkdown } from "../../../src/bookmarks/save-bookmark/clip-markdown";

// Readability は charThreshold: 20 未満の本文を捨てるので、記事として残る長さの本文を使う。
const READABLE_BODY = "body text long enough for readability to keep it around.";

describe("prepareClip", () => {
  it("タイトルと同じ見出しを落とす", () => {
    expect(prepareClip("# Example Page\n\nbody text", "Example Page")).toBe("body text");
    expect(prepareClip("## Example Page\n\nbody text", " Example Page ")).toBe("body text");
  });

  it("先頭のカバー画像は残したまま見出しを落とす", () => {
    expect(prepareClip("![](https://example.com/cover.png)\n\n# Example Page\n\nbody", "Example Page")).toBe(
      "![](https://example.com/cover.png)\n\nbody",
    );
  });

  it("タイトルと違う見出しは残す", () => {
    expect(prepareClip("# Other\n\nbody", "Example Page")).toBe("# Other\n\nbody");
  });

  it("3階層目以降の見出しは落とさない", () => {
    expect(prepareClip("### Example Page\n\nbody", "Example Page")).toBe("### Example Page\n\nbody");
  });

  it("上限文字数で切る", () => {
    expect(prepareClip("a".repeat(MAX_CLIP_CHARS + 100), "title")).toHaveLength(MAX_CLIP_CHARS);
  });

  it("サロゲートペアの途中で切らない", () => {
    expect([...prepareClip(`a${"\u{1F600}".repeat(MAX_CLIP_CHARS)}`, "title")].at(-1)).toBe("\u{1F600}");
  });

  it("見出しが一致しないときは前後の空白も含めてそのまま返す", () => {
    expect(prepareClip("\n# Other\n\nbody\n\n", "Example Page")).toBe("\n# Other\n\nbody\n\n");
  });
});

describe("toMarkdown", () => {
  it("HTML は markdown に変換する", () => {
    expect(toMarkdown("<article><h1>Title</h1><p>Hello <strong>world</strong></p></article>")).toBe(
      "# Title\n\nHello **world**",
    );
  });

  it("markdown はそのまま正規化する", () => {
    expect(toMarkdown("  # Title   \n\n\n\nbody  \n")).toBe("# Title\n\nbody");
  });

  it("空白だけなら空文字", () => {
    expect(toMarkdown("   \n  ")).toBe("");
  });

  it("閉じタグのない < 始まりは HTML と見なさない", () => {
    expect(toMarkdown("<not html")).toBe("<not html");
  });
});

describe("htmlToMarkdown", () => {
  it("箇条書き・打ち消し線・コードブロックを変換する", () => {
    const html = `<article>
      <p>intro paragraph that gives readability enough text to keep this article.</p>
      <ul><li>first</li><li>second</li></ul>
      <p><del>gone</del></p>
      <pre><code>const a = 1;</code></pre>
    </article>`;
    const markdown = htmlToMarkdown(html);
    expect(markdown).toMatch(/^-\s+first$/m);
    expect(markdown).toMatch(/^-\s+second$/m);
    expect(markdown).toContain("~~gone~~");
    expect(markdown).toContain("```\nconst a = 1;\n```");
  });

  it("og:image を先頭のカバー画像にする", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/cover.png"></head>
      <body><article><p>${READABLE_BODY}</p></article></body></html>`;
    expect(htmlToMarkdown(html)).toMatch(/^!\[\]\(https:\/\/example\.com\/cover\.png\)\n\n/);
  });

  it("相対 URL のカバー画像は pageUrl で絶対 URL にする", () => {
    const html = `<html><head><meta name="twitter:image" content="/cover.png"></head>
      <body><article><p>${READABLE_BODY}</p></article></body></html>`;
    expect(htmlToMarkdown(html, "https://example.com/posts/1")).toMatch(/^!\[\]\(https:\/\/example\.com\/cover\.png\)/);
  });

  it("http/https でないカバー画像は付けない", () => {
    const html = `<html><head><meta property="og:image" content="data:image/png;base64,AAA"></head>
      <body><article><p>${READABLE_BODY}</p></article></body></html>`;
    const markdown = htmlToMarkdown(html);
    expect(markdown).not.toContain("![](");
    expect(markdown).toContain(READABLE_BODY);
  });

  it("先頭の画像が同じならカバー画像を重ねない", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/cover.png"></head>
      <body><article><p><img src="https://example.com/cover.png"></p>
      <p>${READABLE_BODY}</p></article></body></html>`;
    const markdown = htmlToMarkdown(html);
    expect(markdown.match(/cover\.png/g)).toHaveLength(1);
  });

  it("相対リンクは pageUrl を基準に絶対 URL にする", () => {
    const html = `<article><p>${READABLE_BODY}
      see <a href="/next">next</a>.</p></article>`;
    expect(htmlToMarkdown(html, "https://example.com/posts/1")).toContain("(https://example.com/next)");
  });

  it("上限文字数で切る", () => {
    const html = `<article><p>${"word ".repeat(MAX_CLIP_CHARS / 5 + 10)}</p></article>`;
    expect(htmlToMarkdown(html)).toHaveLength(MAX_CLIP_CHARS);
  });
});
