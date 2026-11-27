import DOMPurify from "isomorphic-dompurify";

/**
 * Tags and attributes kept - the BE's allow-list (`RichTextPolicy`, ADR-0013), which is what the back office's Tiptap
 * editor (StarterKit + Image) writes. The BE cleaned the HTML before storing it; it is cleaned again here because it
 * goes straight into `dangerouslySetInnerHTML` (the second line of defence).
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "hr",
  "a",
  "img",
];
const ALLOWED_ATTR = ["href", "title", "rel", "src", "alt"];

function httpImagesOnly(
  _node: Element,
  data: { attrName: string; attrValue: string; keepAttr: boolean },
) {
  if (data.attrName === "src" && !/^https?:/i.test(data.attrValue.trim())) data.keepAttr = false;
}

/** The description's HTML, cleaned; "" when only whitespace or empty tags are left. */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html?.trim()) return "";
  // DOMPurify lets `data:` through on <img> whatever ALLOWED_URI_REGEXP says; the BE keeps http(s) images only.
  DOMPurify.addHook("uponSanitizeAttribute", httpImagesOnly);
  let clean: string;
  try {
    clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute");
  }
  const hasContent = /<img\b|<hr\b/i.test(clean) || clean.replace(/<[^>]*>/g, "").trim() !== "";
  return hasContent ? clean : "";
}

/**
 * A rich-text description (HTML from the back office's editor): a product's or a variant's. No business logic - the
 * HTML comes in as a prop; nothing is rendered when it is empty.
 */
export function RichTextView({
  html,
  className = "",
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const clean = sanitizeRichText(html);
  if (!clean) return null;
  return (
    <div
      className={`rich-text max-w-[68ch] ${className}`}
      // Cleaned by sanitizeRichText (the allow-list above): no script, style or event attribute.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
