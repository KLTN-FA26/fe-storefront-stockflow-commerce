import type { PrintSurface, SurfacePoint } from "../surfaces";

/**
 * A texture UV picked on a mesh → surface coordinates in mm. The inverse of `PrintSurface.uvOf`
 * (UVs span `flatBounds`, V grows upwards) followed by `fromFlat`.
 */
export function uvToSurfacePoint(surface: PrintSurface, uv: [number, number]): SurfacePoint {
  const { width, height } = surface.flatBounds;
  return surface.fromFlat(uv[0] * width, (1 - uv[1]) * height);
}
