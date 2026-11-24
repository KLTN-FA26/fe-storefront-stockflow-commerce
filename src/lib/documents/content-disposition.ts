/**
 * The file name a download endpoint sends in `Content-Disposition` (BE `PdfDownload`): the Vietnamese
 * name RFC 5987-encoded in `filename*=UTF-8''Phi%E1%BA%BFu...`, beside an RFC 2047
 * `filename="=?UTF-8?Q?...?="` for older clients. A blob saved through an `<a download>` keeps no
 * name of its own, so the page reads it from here: `filename*` first, then the RFC 2047 word, then a
 * plain `filename`.
 */

const EXTENDED = /filename\*\s*=\s*([^;]+)/i;
const PLAIN = /(?:^|;)\s*filename\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/i;
const ENCODED_WORD = /=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g;

function decodeExtended(value: string): string | null {
  const raw = value.trim().replace(/^"|"$/g, "");
  const match = /^([^']*)'[^']*'(.*)$/.exec(raw);
  const charset = (match?.[1] ?? "utf-8").toLowerCase();
  const encoded = match ? (match[2] ?? "") : raw;
  try {
    if (charset === "utf-8" || charset === "") return decodeURIComponent(encoded);
    return unescape(encoded);
  } catch {
    return null;
  }
}

function decodeBytes(bytes: number[], charset: string): string {
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

/** RFC 2047 encoded words (`=?UTF-8?Q?Phi=E1=BA=BFu?=`); text without them comes back as it is. */
function decodeEncodedWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(ENCODED_WORD, (_word, charset: string, encoding: string, text: string) => {
      if (encoding.toUpperCase() === "B") {
        const binary = atob(text);
        return decodeBytes(
          Array.from(binary, (char) => char.charCodeAt(0)),
          charset,
        );
      }
      const bytes: number[] = [];
      const q = text.replace(/_/g, " ");
      for (let i = 0; i < q.length; i += 1) {
        if (q[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(q.slice(i + 1, i + 3))) {
          bytes.push(parseInt(q.slice(i + 1, i + 3), 16));
          i += 2;
        } else {
          bytes.push(q.charCodeAt(i));
        }
      }
      return decodeBytes(bytes, charset);
    });
}

/** The file name in a `Content-Disposition` header, or null when it names none. */
export function fileNameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  const extended = EXTENDED.exec(header);
  if (extended?.[1]) {
    const name = decodeExtended(extended[1]);
    if (name && name.trim()) return name.trim();
  }
  const plain = PLAIN.exec(header);
  if (plain?.[1]) {
    const quoted = plain[1].trim();
    const unquoted = quoted.startsWith('"') ? quoted.slice(1, -1).replace(/\\(.)/g, "$1") : quoted;
    const name = decodeEncodedWords(unquoted).trim();
    if (name) return name;
  }
  return null;
}
