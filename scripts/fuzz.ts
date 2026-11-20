/**
 * Randomised tangency/sliver stress test for the boolean engine. Build it with
 * the same esbuild invocation described in scripts/harness.ts.
 */
import { runBoolean } from "../src/features/booleans/lib/engine";
import type { Contour } from "../src/shared/types";

function circle(cx: number, cy: number, r: number): Contour {
  const k = r * 0.5522847498307936;
  return {
    nodes: [
      { x: cx + r, y: cy, in: { x: cx + r, y: cy - k }, out: { x: cx + r, y: cy + k } },
      { x: cx, y: cy + r, in: { x: cx + k, y: cy + r }, out: { x: cx - k, y: cy + r } },
      { x: cx - r, y: cy, in: { x: cx - r, y: cy + k }, out: { x: cx - r, y: cy - k } },
      { x: cx, y: cy - r, in: { x: cx - k, y: cy - r }, out: { x: cx + k, y: cy - r } },
    ],
  };
}
function rect(x: number, y: number, w: number, h: number): Contour {
  const n = (px: number, py: number) => ({ x: px, y: py, in: { x: px, y: py }, out: { x: px, y: py } });
  return { nodes: [n(x, y), n(x + w, y), n(x + w, y + h), n(x, y + h)] };
}
let seed = 1234567;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function segmentLengths(c: Contour) {
  const out: number[] = [];
  for (let i = 0; i < c.nodes.length; i++) {
    const a = c.nodes[i];
    const b = c.nodes[(i + 1) % c.nodes.length];
    out.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  return out;
}
function area(c: Contour) {
  let a = 0;
  for (let i = 0; i < c.nodes.length; i++) {
    const p = c.nodes[i];
    const q = c.nodes[(i + 1) % c.nodes.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

let failures = 0;
const shapes: [string, Contour][] = [];
// tangency, slivers, duplicate edges deliberately generated at tiny offsets.
const offsets = [0, 1e-7, 1e-4, 1e-3, 0.01, 0.5, 1, 2, 5, 49.9999, 50, 50.0001, 75, 99.9999, 100, 100.0001];
for (const dx of offsets) {
  shapes.push(["cA", circle(100, 100, 50)]);
  shapes.push(["cB", circle(100 + dx, 100, 50)]);
  shapes.push([`rA`, rect(0, 0, 100, 100)]);
  shapes.push([`rB`, rect(dx, 0, 100, 100)]);
}
const ops = ["union", "intersect", "subtract", "exclude"] as const;
let runs = 0;
for (let i = 0; i < shapes.length; i += 2) {
  const pair = [shapes[i], shapes[i + 1]];
  for (const op of ops) {
    runs++;
    const res = runBoolean(pair.map(([, c]) => ({ contours: [c], fillRule: "nonzero" as const })), op);
    for (const c of res) {
      const lens = segmentLengths(c);
      const degenerate = lens.some((l) => l < 1e-3);
      const tiny = area(c) < 1e-2;
      const dupes = lens.some((l) => l === 0);
      if (c.nodes.length < 3 || degenerate || tiny || dupes) {
        failures++;
        console.log("FRAGMENT", op, i, JSON.stringify(pair.map(([n]) => n)), c.nodes.length, lens.map((l) => +l.toFixed(6)), area(c));
      }
    }
    // Nested evaluation must be stable (idempotent union).
    if (res.length) {
      const again = runBoolean([{ contours: res, fillRule: "evenodd" }], "union");
      if (again.length !== 1 && again.length !== res.filter((c) => area(c) > 1e-2).length) {
        failures++;
        console.log("UNSTABLE", op, i, res.length, again.length);
      }
    }
  }
}
console.log(`${runs} operations, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
