/**
 * Whether this browser can give the live 3D preview a WebGL context. Probes a throwaway canvas
 * (webgl2, then webgl) and hands the context straight back so probing never uses up one of the
 * browser's few live contexts. False when there is no DOM, no context, or creation throws.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
