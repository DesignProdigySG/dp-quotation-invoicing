import path from "path";
import { Font } from "@react-pdf/renderer";

const fontsDir = path.join(process.cwd(), "lib/pdf/fonts");

// Regular weight only — every JP/KR field rendered through fontFor() is normal
// weight in DocumentPdf.tsx (bold is only used for the title and grand total,
// which are always plain Latin/numeric and use Montserrat's own bold cut
// below), so a bold cut for these would never be loaded. Skipping it halves
// the font bytes parsed per cold start.
Font.register({
  family: "NotoSansJP",
  fonts: [{ src: path.join(fontsDir, "NotoSansJP-Regular.woff") }],
});

Font.register({
  family: "NotoSansKR",
  fonts: [{ src: path.join(fontsDir, "NotoSansKR-Regular.woff") }],
});

// Montserrat is the brand's body font and the default for every Latin-text
// field. Unlike the CJK fonts, it's small (Latin-only glyph set) and is used
// for bold text (title, grand total), so both weights are registered.
Font.register({
  family: "Montserrat",
  fonts: [
    { src: path.join(fontsDir, "Montserrat-Regular.woff") },
    { src: path.join(fontsDir, "Montserrat-Bold.woff"), fontWeight: 700 },
  ],
});

export const DEFAULT_FONT_FAMILY = "Montserrat";

// Hangul syllables + Jamo, checked first since Korean text can otherwise be
// picked up by ranges Noto Sans JP and KR both cover (e.g. shared punctuation).
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
// Hiragana, Katakana, CJK Unified Ideographs, halfwidth Katakana.
const JAPANESE = /[぀-ヿ一-鿿･-ﾟ]/;

// Montserrat (like Helvetica before it) has no glyphs outside Latin-1, so any
// Japanese/Korean text in it silently renders as gibberish (tofu/replacement
// boxes) instead of throwing — this picks a font that actually has the right
// glyphs based on what's in the string, falling back to the brand font
// otherwise.
export function fontFor(text?: string | number | null): string {
  const value = typeof text === "number" ? String(text) : text;
  if (!value) return DEFAULT_FONT_FAMILY;
  if (HANGUL.test(value)) return "NotoSansKR";
  if (JAPANESE.test(value)) return "NotoSansJP";
  return DEFAULT_FONT_FAMILY;
}
