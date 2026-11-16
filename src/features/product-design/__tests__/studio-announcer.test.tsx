import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import { StudioAnnouncer, useStudioAnnouncer } from "../components/studio/studio-announcer";

type Announce = ReturnType<typeof useStudioAnnouncer>["announce"];

/** The assertive region: not `role="alert"`, so it never doubles a screen's own alerts. */
const urgent = () => document.querySelector<HTMLElement>('[aria-live="assertive"]');

function Harness({ onReady }: { onReady: (announce: Announce) => void }) {
  const { announcement, announce } = useStudioAnnouncer();
  useEffect(() => onReady(announce), [announce, onReady]);
  return <StudioAnnouncer announcement={announcement} />;
}

function renderAnnouncer(): Announce {
  let say: Announce | undefined;
  render(<Harness onReady={(announce) => (say = announce)} />);
  if (!say) throw new Error("announcer not ready");
  return say;
}

describe("StudioAnnouncer", () => {
  it("says routine news politely", () => {
    const say = renderAnnouncer();
    act(() => say("Đã lưu"));
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");
    expect(urgent()).toBeEmptyDOMElement();
  });

  it("says an urgent message at once, and a later polite one does not replace it", () => {
    const say = renderAnnouncer();
    act(() => say("Không tải được ảnh. Hãy thử lại.", { urgent: true }));
    act(() => say("Đã lưu"));
    expect(urgent()).toHaveTextContent("Không tải được ảnh. Hãy thử lại.");
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");
  });
});
