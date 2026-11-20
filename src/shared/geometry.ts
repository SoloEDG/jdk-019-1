import type { Contour, Node, Point, Shape } from "./types";

/**
 * Every shape is a list of closed (or open) contours. Older shapes only have a
 * single `nodes` loop, so normalise on read without copying node objects: node
 * dragging relies on mutating the very nodes the editor displays.
 */
export function contoursOf(s: Shape): Contour[] {
  if (s.contours && s.contours.length) return s.contours;
  return s.nodes.length ? [{ nodes: s.nodes }] : [];
}

/**
 * Keep the legacy `nodes` field pointing at the first contour after structural
 * edits so older readers (and single-loop code) keep working. Openness is left
 * untouched: a pen path is one contour and still open.
 */
export function syncLegacy(s: Shape) {
  if (!s.contours) return;
  s.nodes = s.contours[0]?.nodes ?? [];
}

export function cloneContours(contours: Contour[]): Contour[] {
  return contours.map((c) => ({
    nodes: c.nodes.map((n) => ({
      x: n.x,
      y: n.y,
      in: { x: n.in.x, y: n.in.y },
      out: { x: n.out.x, y: n.out.y },
    })),
  }));
}

function translateNodes(nodes: Node[], x: number, y: number) {
  for (const n of nodes) {
    n.x += x;
    n.y += y;
    n.in.x += x;
    n.in.y += y;
    n.out.x += x;
    n.out.y += y;
  }
}

/**
 * Moves a shape in real document space. Live booleans carry their source
 * operands along so re-evaluating the operation keeps the same placement.
 */
export function translateShape(s: Shape, x: number, y: number) {
  if (s.contours) {
    s.contours.forEach((c) => translateNodes(c.nodes, x, y));
    syncLegacy(s);
  } else {
    translateNodes(s.nodes, x, y);
  }
  if (s.source) {
    s.source.evaluated.forEach((c) => translateNodes(c.nodes, x, y));
    s.source.operands.forEach((o) => translateShape(o, x, y));
  }
}

function format(n: number): string {
  const v = Math.abs(n) < 1e-9 ? 0 : n;
  const rounded = Number(v.toFixed(4));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function samePoint(a: Point, b: Point) {
  return format(a.x) === format(b.x) && format(a.y) === format(b.y);
}

function contourPath(nodes: Node[], closed: boolean): string {
  if (!nodes.length) return "";
  let d = `M ${format(nodes[0].x)} ${format(nodes[0].y)}`;
  const count = nodes.length;
  const last = closed ? count : count - 1;
  for (let i = 1; i <= last; i++) {
    const a = nodes[i - 1];
    const b = nodes[i % count];
    if (samePoint(a.out, a) && samePoint(b.in, b)) {
      d += ` L ${format(b.x)} ${format(b.y)}`;
    } else {
      d += ` C ${format(a.out.x)} ${format(a.out.y)} ${format(b.in.x)} ${format(b.in.y)} ${format(b.x)} ${format(b.y)}`;
    }
  }
  return d + (closed ? " Z" : "");
}

export function shapePath(s: Shape): string {
  const contours = contoursOf(s);
  if (!contours.length) return "";
  return contours
    .map((c) => contourPath(c.nodes, s.closed))
    .filter(Boolean)
    .join(" ");
}

/**
 * Holes are kept independent of winding so that editing anchor points can
 * never accidentally fill a hole. This value is mirrored on screen and in SVG.
 */
export function fillRuleOf(s: Shape): "evenodd" | "nonzero" {
  return contoursOf(s).length > 1 ? "evenodd" : "nonzero";
}

export function nodeCount(s: Shape): number {
  return contoursOf(s).reduce((sum, c) => sum + c.nodes.length, 0);
}
