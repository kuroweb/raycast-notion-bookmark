export const MAX_CLIP_CHARS = 100_000;

/**
 * 上限で切る。絵文字などサロゲートペアの途中で切れて壊れた文字を送らないよう、
 * 末尾にはぐれたサロゲートが残る場合は1文字分落とす。
 */
export function truncateClip(text: string): string {
  if (text.length <= MAX_CLIP_CHARS) {
    return text;
  }

  const clipped = text.slice(0, MAX_CLIP_CHARS);
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
}
