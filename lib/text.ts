// Text from YouTube can contain characters Postgres refuses: NUL bytes ("invalid byte sequence 0x00") and
// lone UTF-16 surrogates (half an emoji, e.g. after a naive .slice()), which the Neon HTTP driver can't even
// encode. One such title fails a whole batch insert, so every external string is cleaned on the way in.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const pgSafe = (s: string): string => s.replace(CONTROL, "").replace(LONE_SURROGATE, "");

/** Cut to at most `max` UTF-16 units without leaving half an emoji behind. */
export const clip = (s: string, max: number): string => pgSafe(s).slice(0, max).replace(LONE_SURROGATE, "");
