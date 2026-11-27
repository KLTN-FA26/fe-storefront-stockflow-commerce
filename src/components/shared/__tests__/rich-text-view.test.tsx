import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RichTextView, sanitizeRichText } from "../RichTextView";

describe("sanitizeRichText (BE RichTextPolicy allow-list, ADR-0013)", () => {
  it("keeps what the back office's editor writes", () => {
    const html =
      '<h2>Ly</h2><p><strong>a</strong> <em>b</em> <a href="https://x.vn" title="t">c</a></p>' +
      '<ul><li><p>d</p></li></ul><img src="https://cdn.x.vn/a.webp" alt="ảnh">';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("drops scripts, styles, handlers and non-http links", () => {
    const clean = sanitizeRichText(
      '<p style="color:red" onclick="x()">a</p><script>x()</script><iframe src="https://x"></iframe>' +
        '<a href="javascript:x()">b</a><img src="data:image/png;base64,AA" onerror="x()">',
    );
    expect(clean).not.toMatch(/script|style|onclick|onerror|iframe|javascript|data:/);
    expect(clean).toContain("<p>a</p>");
  });

  it("is empty when nothing readable is left", () => {
    expect(sanitizeRichText(null)).toBe("");
    expect(sanitizeRichText("  ")).toBe("");
    expect(sanitizeRichText("<p></p><p> </p>")).toBe("");
    expect(sanitizeRichText("<script>x()</script>")).toBe("");
    expect(sanitizeRichText("<hr>")).toBe("<hr>");
  });
});

describe("RichTextView", () => {
  it("renders the cleaned HTML, and nothing for an empty description", () => {
    const { container, rerender } = render(<RichTextView html="<p>Ly <strong>bền</strong></p>" />);
    expect(screen.getByText("bền").tagName).toBe("STRONG");
    rerender(<RichTextView html="<p></p>" />);
    expect(container).toBeEmptyDOMElement();
  });
});
