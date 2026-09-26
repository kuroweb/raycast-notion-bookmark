import { describe, expect, it } from "vitest";
import { MAX_CLIP_CHARS, truncateClip } from "../../src/bookmarks/clip-limit";

describe("truncateClip", () => {
  it("上限以内なら何もしない", () => {
    expect(truncateClip("body")).toBe("body");
    expect(truncateClip("a".repeat(MAX_CLIP_CHARS))).toHaveLength(MAX_CLIP_CHARS);
  });

  it("上限で切る", () => {
    expect(truncateClip("a".repeat(MAX_CLIP_CHARS + 10))).toHaveLength(MAX_CLIP_CHARS);
  });

  it("サロゲートペアの途中で切らない", () => {
    const clipped = truncateClip(`a${"\u{1F600}".repeat(MAX_CLIP_CHARS)}`);
    expect(clipped).toHaveLength(MAX_CLIP_CHARS - 1);
    expect([...clipped].at(-1)).toBe("\u{1F600}");
  });
});
