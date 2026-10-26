// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readImageDimensions } from "../assets/image-header";
import { prepareSvg, svgIntrinsicSize, svgRasterSize } from "../assets/svg";
import { jpegBytes, pngBytes, webpBytes } from "./fixtures";

describe("readImageDimensions", () => {
  it("reads PNG, JPEG and WebP dimensions from headers", () => {
    expect(readImageDimensions(pngBytes(9000, 9000))).toEqual({
      width: 9000,
      height: 9000,
      type: "image/png",
    });
    expect(readImageDimensions(jpegBytes(640, 480))).toEqual({
      width: 640,
      height: 480,
      type: "image/jpeg",
    });
    expect(readImageDimensions(webpBytes("VP8X", 1200, 800))).toEqual({
      width: 1200,
      height: 800,
      type: "image/webp",
    });
    expect(readImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("reads every JPEG frame flavour past the segments before it", () => {
    expect(readImageDimensions(jpegBytes(4032, 3024, 0xc2))).toMatchObject({
      width: 4032,
      height: 3024,
    }); // progressive
    expect(readImageDimensions(jpegBytes(300, 200, 0xc1))).toMatchObject({
      width: 300,
      height: 200,
    });
  });

  it("reads the lossy and the lossless WebP headers", () => {
    expect(readImageDimensions(webpBytes("VP8", 321, 123))).toEqual({
      width: 321,
      height: 123,
      type: "image/webp",
    });
    expect(readImageDimensions(webpBytes("VP8L", 16384, 1))).toMatchObject({
      width: 16384,
      height: 1,
    });
    expect(readImageDimensions(webpBytes("VP8X", 16_777_216, 16_777_216))).toMatchObject({
      width: 16_777_216,
      height: 16_777_216,
    }); // a 24-bit canvas size does not overflow
  });

  it("answers null for a header it cannot read", () => {
    const png = pngBytes(10, 10);
    expect(readImageDimensions(png.slice(0, 20))).toBeNull(); // cut inside IHDR
    expect(readImageDimensions(pngBytes(0, 10))).toBeNull(); // no pixels
    expect(readImageDimensions(jpegBytes(10, 10).slice(0, 30))).toBeNull(); // cut before the frame
    expect(readImageDimensions(webpBytes("VP8X", 10, 10).slice(0, 26))).toBeNull();
    expect(readImageDimensions(new TextEncoder().encode("<svg/>"))).toBeNull();
    expect(readImageDimensions(new Uint8Array(0))).toBeNull();
  });
});

describe("svgIntrinsicSize", () => {
  it("sizes an SVG from attributes, then viewBox, then a default", () => {
    expect(svgIntrinsicSize('<svg width="120mm" height="60mm"/>')).toEqual({
      width: expect.closeTo(453.54, 1),
      height: expect.closeTo(226.77, 1),
    });
    expect(svgIntrinsicSize('<svg viewBox="0 0 400 100"/>')).toEqual({ width: 400, height: 100 });
    expect(svgIntrinsicSize("<svg/>")).toEqual({ width: 2000, height: 2000 });
  });

  it("converts px, pt, cm, in and unitless lengths to CSS px", () => {
    expect(svgIntrinsicSize('<svg width="200px" height="100"/>')).toEqual({
      width: 200,
      height: 100,
    });
    expect(svgIntrinsicSize('<svg width="72pt" height="1in"/>')).toEqual({
      width: 96,
      height: 96,
    });
    expect(svgIntrinsicSize('<svg width="2.54cm" height="2.54cm"/>')).toEqual({
      width: expect.closeTo(96, 6),
      height: expect.closeTo(96, 6),
    });
  });

  it("completes one length from the viewBox ratio and skips lengths it cannot read", () => {
    expect(svgIntrinsicSize('<svg width="300" viewBox="0 0 100 50"/>')).toEqual({
      width: 300,
      height: 150,
    });
    expect(svgIntrinsicSize('<svg width="100%" height="50%" viewBox="0,0 80,20"/>')).toEqual({
      width: 80,
      height: 20,
    });
    expect(svgIntrinsicSize('<svg width="40em" viewBox="0 0 10 10"/>')).toEqual({
      width: 10,
      height: 10,
    });
  });

  it("reads the root element's own attributes only", () => {
    expect(
      svgIntrinsicSize(
        '<?xml version="1.0"?><!-- <svg width="1" height="1"> --><svg stroke-width="9" viewBox="0 0 30 20"><rect width="5" height="5"/></svg>',
      ),
    ).toEqual({ width: 30, height: 20 });
  });

  it("falls back to the default for a viewBox without area", () => {
    expect(svgIntrinsicSize('<svg viewBox="0 0 0 0"/>')).toEqual({ width: 2000, height: 2000 });
    expect(svgIntrinsicSize('<svg viewBox="a b c d"/>')).toEqual({ width: 2000, height: 2000 });
  });
});

describe("prepareSvg", () => {
  it("gives the root an explicit px size, a viewBox and the SVG namespace", () => {
    const prepared = prepareSvg(
      '<svg width="120mm" height="60mm"><rect width="5" height="5"/></svg>',
    );
    expect(prepared.width).toBeCloseTo(453.54, 1);
    expect(prepared.svg).toMatch(/^<svg\b/);
    expect(prepared.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(prepared.svg).toMatch(/viewBox="0 0 453\.5\d* 226\.7\d*"/);
    expect(prepared.svg).toMatch(/width="453\.5\d*"/);
    expect(prepared.svg).toContain('<rect width="5" height="5"/></svg>'); // the content is untouched
  });

  it("keeps the drawing's own viewBox and namespace", () => {
    const prepared = prepareSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" width="50%"/>',
    );
    expect(prepared).toMatchObject({ width: 400, height: 100 });
    expect(prepared.svg.match(/xmlns=/g)).toHaveLength(1);
    expect(prepared.svg).toContain('viewBox="0 0 400 100"');
    expect(prepared.svg).not.toContain("50%");
  });
});

describe("svgRasterSize", () => {
  it("draws at the target width keeping the ratio", () => {
    expect(svgRasterSize({ width: 400, height: 100 }, 2000)).toEqual({ width: 2000, height: 500 });
    expect(svgRasterSize({ width: 3, height: 2 }, 2000.4)).toEqual({ width: 2000, height: 1333 });
  });

  it("shrinks an extreme ratio to the longest edge a canvas can take", () => {
    expect(svgRasterSize({ width: 1, height: 100 }, 2000)).toEqual({ width: 82, height: 8192 });
    expect(svgRasterSize({ width: 100000, height: 1 }, 2000)).toEqual({ width: 2000, height: 1 });
  });
});
