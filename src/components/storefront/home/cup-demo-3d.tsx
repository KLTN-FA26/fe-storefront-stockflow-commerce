"use client";

import { useEffect, useRef } from "react";
import {
  Box3,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { ARTWORK_ASPECT, drawCupArtwork } from "./cup-demo-artwork";

const MODEL_URL = "/models/sample-cup-12oz.glb";
/** `print:BODY` in the file; three.js drops the ':' from node names when it loads (`sanitizeNodeName`). */
const isPrintNode = (name: string | undefined) =>
  (name ?? "").replace(/[^a-z]/gi, "").toLowerCase() === "printbody";
/** The band goes all the way round, so only about a third faces the camera: draw it large to stay sharp. */
const TEXTURE_WIDTH = 4096;

interface CupDemo3DProps {
  ink: string;
  text: string;
  /** WebGL or the model is not there: the demo shows its 2D sheet alone. Must be stable. */
  onFail: () => void;
}

/**
 * The demo's 3D cup: the sample 12oz `.glb` with the demo artwork wrapped on its print part, turning slowly (not when
 * the visitor asks for reduced motion) and turnable by dragging. Loaded on demand (`next/dynamic`, no SSR).
 */
export default function CupDemo3D({ ink, text, onFail }: CupDemo3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const artworkRef = useRef<{ canvas: HTMLCanvasElement; texture: CanvasTexture } | null>(null);
  // What the scene is first built with; later changes go through the effect that redraws the texture.
  const firstRef = useRef({ ink, text });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onFail();
      return;
    }
    // At least 2x: on a 1x screen this supersamples the cup, so its edges and print stay crisp.
    renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 2), 3));
    renderer.outputColorSpace = SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = "grab";

    const scene = new Scene();
    scene.add(new HemisphereLight("white", "gray", 2.2));
    const key = new DirectionalLight("white", 1.6);
    key.position.set(2, 3, 4);
    scene.add(key);
    const camera = new PerspectiveCamera(28, 1, 0.01, 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minPolarAngle = Math.PI * 0.32;
    controls.maxPolarAngle = Math.PI * 0.6;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 1.4;

    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = Math.round(TEXTURE_WIDTH / ARTWORK_ASPECT);
    drawCupArtwork(canvas, firstRef.current.ink, firstRef.current.text);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    // Sharp at the cup's curved sides, where the band is seen at a slant.
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // The model's print UVs run bottom-up: three.js' default flip puts the band the right way up.
    texture.flipY = true;
    artworkRef.current = { canvas, texture };

    let disposed = false;
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        root.traverse((node) => {
          if (node instanceof Mesh && (isPrintNode(node.name) || isPrintNode(node.parent?.name))) {
            node.material = new MeshStandardMaterial({ map: texture, roughness: 0.55 });
          }
        });
        const box = new Box3().setFromObject(root);
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        root.position.sub(center);
        scene.add(root);
        const distance = size.y * 3.1;
        camera.position.set(0, size.y * 0.35, distance);
        camera.near = distance / 100;
        camera.far = distance * 10;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();
      },
      undefined,
      () => {
        if (!disposed) onFail();
      },
    );

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Render only while on screen.
    let visible = true;
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    seen.observe(host);
    renderer.setAnimationLoop(() => {
      if (!visible) return;
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      seen.disconnect();
      controls.dispose();
      texture.dispose();
      scene.traverse((node) => {
        if (node instanceof Mesh) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      artworkRef.current = null;
    };
  }, [onFail]);

  useEffect(() => {
    const artwork = artworkRef.current;
    if (!artwork || !ink) return;
    drawCupArtwork(artwork.canvas, ink, text);
    artwork.texture.needsUpdate = true;
  }, [ink, text]);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />;
}
