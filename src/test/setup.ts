import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Radix (radio group, select) measures with it.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
