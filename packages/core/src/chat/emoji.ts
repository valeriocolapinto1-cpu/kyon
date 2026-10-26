const PART =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|️|⃣|[#*0-9])/u;
const WHOLE = new RegExp(`^${PART.source}+$`, 'u');
const VISIBLE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

/** A single emoji (with skin tone, ZWJ sequences, flags, keycaps), never text. */
export function isEmoji(value: string): boolean {
  return value.length > 0 && value.length <= 16 && WHOLE.test(value) && VISIBLE.test(value);
}

/** The quick reactions offered first. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🙏'] as const;
