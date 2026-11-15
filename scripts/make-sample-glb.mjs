/**
 * Writes `public/models/sample-cup-12oz.glb`: a technical sample of the 12 oz cup of the mock print
 * configuration `CUP12-BODY`, built to the `.glb` convention (spec 2026-11-13 section 4). Not art:
 * it only proves that a file that follows the convention loads, measures and takes the artwork
 * where the 2D dieline says.
 *
 *   node scripts/make-sample-glb.mjs
 *
 * Plain JavaScript, no import from `src`. Units in the file are metres, Y up, base at Y = 0, the
 * front of the cup faces +Z. Nodes: `print:BODY` (the printed band), `wall` (the rest of the outer wall), `rim`, `bottom`, `inner`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Numbers below come from `cup12oz` in `src/lib/api/mock-fixtures/design-print-configs.ts`
// (`size: [90, 60, 110]`, `band: [6, 8]`, `rimMm: 3` in `cupTemplate`) and from the engine fixture
// `cup12oz` (`src/features/product-design/engine/__tests__/fixtures.ts`, the same model numbers).
const TOP_DIAMETER_MM = 90; // size[0]
const BOTTOM_DIAMETER_MM = 60; // size[1]
const HEIGHT_MM = 110; // size[2]
const BAND_TOP_OFFSET_MM = 6; // band[0]: slant distance from the rim to the printed band
const BAND_BOTTOM_OFFSET_MM = 8; // band[1]: slant distance from the printed band to the base
const RIM_MM = 3; // rimMm: diameter of the rolled lip (the tube)
// From `viewer3d/cup-mesh.ts`: the paper thickness of the inner wall.
const WALL_MM = 0.6;
const RADIAL_SEGMENTS = 128; // the convention asks for at least 32; 64 or more is advised
// The cup's height is its highest point and a manufacturer's nominal height includes the rolled
// rim, as a real Blender cup of 110 mm has. The code-built cup (`cup-mesh.ts`) centres the rim tube
// on Y = height, so it reaches height + rimMm / 2; this sample instead sits the tube on the cone
// with its TOP at Y = 110, so nothing in the file is above 110 and the file measures 90 / 60 / 110.
const RIM_TUBE_RADIUS_MM = Math.max(RIM_MM, WALL_MM) / 2;
const RIM_CENTRE_Y_MM = HEIGHT_MM - RIM_TUBE_RADIUS_MM;
const BAND_HEIGHT_SEGMENTS = 4;
const RIM_RADIAL_SEGMENTS = 64;
const RIM_TUBE_SEGMENTS = 8;

const TAU = Math.PI * 2;
const MM = 1 / 1000; // the file is in metres

const topR = TOP_DIAMETER_MM / 2;
const bottomR = BOTTOM_DIAMETER_MM / 2;
// Same relations as `cup-mesh.ts`: slant length, and y = height * (1 - v / slant) at slant distance v from the rim.
const slant = Math.hypot(HEIGHT_MM, topR - bottomR);
const yAt = (v) => HEIGHT_MM * (1 - v / slant);
const radiusAtY = (y) => bottomR + ((topR - bottomR) * y) / HEIGHT_MM;
const bandTopY = yAt(BAND_TOP_OFFSET_MM);
const bandBottomY = yAt(slant - BAND_BOTTOM_OFFSET_MM);

/** A mesh as flat arrays; triangles are re-wound so each faces the same way as its normals. */
function finish({ positions, normals, uvs, indices }) {
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const p = (i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const e1 = pb.map((v, k) => v - pa[k]);
    const e2 = pc.map((v, k) => v - pa[k]);
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const vn = [a, b, c].reduce((sum, i) => sum.map((v, k) => v + normals[3 * i + k]), [0, 0, 0]);
    if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] < 0) {
      indices[t + 1] = c;
      indices[t + 2] = b;
    }
  }
  return { positions, normals, uvs, indices };
}

/** Rings (top down) revolved about Y; the first and last vertex of a ring coincide (the seam, at -Z). */
function revolve(rings, normalOf, segments) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  rings.forEach(({ y, radius }, j) => {
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      const [sin, cos] = [Math.sin(a), Math.cos(a)];
      positions.push(-radius * sin * MM, y * MM, -radius * cos * MM);
      const n = normalOf(j);
      normals.push(-n.radial * sin, n.y, -n.radial * cos);
      uvs.push(i / segments, 1 - j / (rings.length - 1));
    }
  });
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const [b, c] = [a + segments + 1, a + 1];
      indices.push(a, b, c, b, b + 1, c);
    }
  }
  return finish({ positions, normals, uvs, indices });
}

// The outer wall's normal in the (radial, y) plane, as in `cup-mesh.ts`.
const lean = { radial: HEIGHT_MM / slant, y: (bottomR - topR) / slant };

// print:BODY: exactly the printed band (vRange = [bandTop, slant - bandBottom]) at its real height.
const bodyRings = Array.from({ length: BAND_HEIGHT_SEGMENTS + 1 }, (_, j) => {
  const y = bandTopY + ((bandBottomY - bandTopY) * j) / BAND_HEIGHT_SEGMENTS;
  return { y, radius: radiusAtY(y) };
});
const body = revolve(bodyRings, () => lean, RADIAL_SEGMENTS);

// wall: the unprinted outer wall above and below the band (the `unprinted` strips of `cup-mesh.ts`),
// so the cup is closed from the base to the rim. One mesh, two strips.
function merge(a, b) {
  const offset = a.positions.length / 3;
  return {
    positions: [...a.positions, ...b.positions],
    normals: [...a.normals, ...b.normals],
    uvs: [...a.uvs, ...b.uvs],
    indices: [...a.indices, ...b.indices.map((i) => i + offset)],
  };
}
const strip = (fromY, toY) =>
  revolve(
    [fromY, toY].map((y) => ({ y, radius: radiusAtY(y) })),
    () => lean,
    RADIAL_SEGMENTS,
  );
// The upper strip ends where the rim tube is centred (the tube covers the join).
const wall = merge(strip(RIM_CENTRE_Y_MM, bandTopY), strip(bandBottomY, 0));

// inner: the inner wall and the floor, facing inwards. It starts inside the rim tube.
const innerRings = [
  { y: RIM_CENTRE_Y_MM, radius: radiusAtY(RIM_CENTRE_Y_MM) - WALL_MM },
  { y: WALL_MM, radius: bottomR - WALL_MM },
  { y: WALL_MM, radius: 0 },
];
const inner = revolve(
  innerRings,
  (j) => (j === 0 ? { radial: -lean.radial, y: -lean.y } : { radial: 0, y: 1 }),
  RADIAL_SEGMENTS,
);

// bottom: a disc under the base, facing down.
function disc() {
  const positions = [0, 0, 0];
  const normals = [0, -1, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i < RADIAL_SEGMENTS; i++) {
    const a = (i / RADIAL_SEGMENTS) * TAU;
    positions.push(-bottomR * Math.sin(a) * MM, 0, -bottomR * Math.cos(a) * MM);
    normals.push(0, -1, 0);
    uvs.push(0.5 - 0.5 * Math.sin(a), 0.5 - 0.5 * Math.cos(a));
    indices.push(0, 1 + i, 1 + ((i + 1) % RADIAL_SEGMENTS));
  }
  return finish({ positions, normals, uvs, indices });
}

// rim: the rolled lip, a torus on the cone whose top is at Y = HEIGHT_MM.
function rim() {
  const tube = RIM_TUBE_RADIUS_MM;
  const centreR = radiusAtY(RIM_CENTRE_Y_MM);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= RIM_RADIAL_SEGMENTS; i++) {
    const a = (i / RIM_RADIAL_SEGMENTS) * TAU;
    for (let k = 0; k < RIM_TUBE_SEGMENTS; k++) {
      const phi = (k / RIM_TUBE_SEGMENTS) * TAU;
      const radius = centreR + tube * Math.cos(phi);
      positions.push(
        -radius * Math.sin(a) * MM,
        (RIM_CENTRE_Y_MM + tube * Math.sin(phi)) * MM,
        -radius * Math.cos(a) * MM,
      );
      normals.push(-Math.cos(phi) * Math.sin(a), Math.sin(phi), -Math.cos(phi) * Math.cos(a));
      uvs.push(i / RIM_RADIAL_SEGMENTS, k / RIM_TUBE_SEGMENTS);
    }
  }
  for (let i = 0; i < RIM_RADIAL_SEGMENTS; i++) {
    for (let k = 0; k < RIM_TUBE_SEGMENTS; k++) {
      const a = i * RIM_TUBE_SEGMENTS + k;
      const b = i * RIM_TUBE_SEGMENTS + ((k + 1) % RIM_TUBE_SEGMENTS);
      const c = (i + 1) * RIM_TUBE_SEGMENTS + k;
      const d = (i + 1) * RIM_TUBE_SEGMENTS + ((k + 1) % RIM_TUBE_SEGMENTS);
      indices.push(a, c, b, b, c, d);
    }
  }
  return finish({ positions, normals, uvs, indices });
}

// Mesh names differ from the node names on purpose: three names a node's object after the node.
const parts = [
  { node: "print:BODY", mesh: "body-mesh", material: 0, data: body },
  { node: "wall", mesh: "wall-mesh", material: 1, data: wall },
  { node: "rim", mesh: "rim-mesh", material: 1, data: rim() },
  { node: "bottom", mesh: "bottom-mesh", material: 1, data: disc() },
  { node: "inner", mesh: "inner-mesh", material: 2, data: inner },
];

// ---- glTF 2.0 binary -----------------------------------------------------------------------
const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];

function addView(typedArray, target) {
  const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
  bytes.copy(padded);
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
  chunks.push(padded);
  byteLength += padded.length;
  return bufferViews.length - 1;
}

const ITEM_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3 };
const FLOAT = 5126;
const UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

function addAccessor(typedArray, type, componentType, target, bounds) {
  const view = addView(typedArray, target);
  const count = typedArray.length / ITEM_SIZE[type];
  accessors.push({ bufferView: view, componentType, count, type, ...(bounds ?? {}) });
  return accessors.length - 1;
}

const meshes = parts.map(({ mesh, material, data }) => {
  const positions = new Float32Array(data.positions);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  const attributes = {
    POSITION: addAccessor(positions, "VEC3", FLOAT, ARRAY_BUFFER, { min, max }),
    NORMAL: addAccessor(new Float32Array(data.normals), "VEC3", FLOAT, ARRAY_BUFFER),
    TEXCOORD_0: addAccessor(new Float32Array(data.uvs), "VEC2", FLOAT, ARRAY_BUFFER),
  };
  const indices = addAccessor(new Uint32Array(data.indices), "SCALAR", UINT, ELEMENT_ARRAY_BUFFER);
  return { name: mesh, primitives: [{ attributes, indices, material, mode: 4 }] };
});

const paper = (name, colour, roughness) => ({
  name,
  pbrMetallicRoughness: { baseColorFactor: colour, metallicFactor: 0, roughnessFactor: roughness },
});

const json = {
  asset: { version: "2.0", generator: "scripts/make-sample-glb.mjs" },
  scene: 0,
  scenes: [{ name: "sample-cup-12oz", nodes: parts.map((_, i) => i) }],
  nodes: parts.map(({ node }, i) => ({ name: node, mesh: i })),
  meshes,
  materials: [
    paper("paper-print", [0.96, 0.95, 0.92, 1], 0.85),
    paper("paper-outer", [0.93, 0.92, 0.89, 1], 0.85),
    paper("paper-inner", [0.88, 0.86, 0.82, 1], 0.9),
  ],
  accessors,
  bufferViews,
  buffers: [{ byteLength }],
};

const pad = (buffer, fill) => {
  const out = Buffer.alloc(Math.ceil(buffer.length / 4) * 4, fill);
  buffer.copy(out);
  return out;
};
const jsonChunk = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
const binChunk = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const chunkHeader = (length, type) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(length, 0);
  h.writeUInt32LE(type, 4);
  return h;
};
const glb = Buffer.concat([
  header,
  chunkHeader(jsonChunk.length, 0x4e4f534a), // JSON
  jsonChunk,
  chunkHeader(binChunk.length, 0x004e4942), // BIN
  binChunk,
]);

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/models/sample-cup-12oz.glb",
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, glb);
console.log(
  `${out}: ${glb.length} bytes, band y ${bandBottomY.toFixed(3)} to ${bandTopY.toFixed(3)} mm`,
);
