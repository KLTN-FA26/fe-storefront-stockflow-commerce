import type { DesignDocument } from "../document/schema";

/**
 * `JSON.stringify` of `value` with every object's keys in code-unit order. Building a sorted object
 * and stringifying it would not do: a JS object lists integer-like keys first, whatever the
 * insertion order. Like JSON, it drops `undefined` and function properties, writes them as `null`
 * in arrays, and honours `toJSON`.
 */
function serialize(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null) {
    const { toJSON } = value as { toJSON?: unknown };
    if (typeof toJSON === "function") return serialize(toJSON.call(value));
    if (Array.isArray(value))
      return `[${value.map((item) => serialize(item) ?? "null").join(",")}]`;
    const members = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const text = serialize((value as Record<string, unknown>)[key]);
        return text === undefined ? [] : [`${JSON.stringify(key)}:${text}`];
      });
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The stable text two equal documents share, whatever order their keys were written in. */
export function canonicalJson(value: unknown): string {
  return serialize(value) ?? "null";
}

/** SHA-256 of `bytes` as lower-case hex (64 characters). */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** SHA-256, as lower-case hex, of the document's canonical JSON: the fingerprint a print job quotes. */
export async function documentChecksum(doc: DesignDocument): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalJson(doc)));
}
