import paper from "paper/dist/paper-core";
import type { BooleanOp, Contour, Node, Point } from "../../../shared/types";

/**
 * Paper.js is used headlessly: one private scope, no project item ever added to
 * a layer. Results are converted straight back into plain contours.
 */
const scope = new paper.PaperScope();
scope.setup(new scope.Size(1, 1));

/**
 * Booleans of curves that meet at a tangent, share an edge, or overlap by a
 * hair can emit segments far below one screen pixel. Anything under this size
 * (in user units) is numerical debris rather than artwork.
 */
const EPSILON = 1e-3;
/** A loop whose area is sub-pixel is a sliver, not a shape; drop it. */
const MIN_AREA = 1e-2;
/** Coordinates are stored at this resolution, keeping output stable and tiny. */
const ROUND = 1e-4;

function round(v: number): number {
  const r = Math.round(v / ROUND) * ROUND;
  return Object.is(r, -0) ? 0 : r;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toPaper(
  contours: Contour[],
  fillRule: "evenodd" | "nonzero",
): paper.PathItem | null {
  const children: paper.Path[] = [];
  for (const contour of contours) {
    if (contour.nodes.length < 2) continue;
    const segments = contour.nodes.map((n) => {
      const point = new scope.Point(n.x, n.y);
      const inHandle = new scope.Point(n.in.x - n.x, n.in.y - n.y);
      const outHandle = new scope.Point(n.out.x - n.x, n.out.y - n.y);
      return new scope.Segment(point, inHandle, outHandle);
    });
    children.push(new scope.Path({ segments, closed: true, insert: false }));
  }
  if (!children.length) return null;
  if (children.length === 1) return children[0];
  const compound = new scope.CompoundPath({ children, insert: false });
  compound.fillRule = fillRule;
  return compound;
}

function itemParts(item: paper.PathItem): paper.Path[] {
  if (item.className === "CompoundPath") {
    return (item as paper.CompoundPath).children.filter(
      (c): c is paper.Path => c.className === "Path",
    );
  }
  if (item.className === "Path") {
    const path = item as paper.Path;
    return path.segments.length ? [path] : [];
  }
  return [];
}

function contourFromPath(path: paper.Path): Contour | null {
  const nodes: Node[] = [];
  for (const segment of path.segments) {
    const p = segment.point;
    nodes.push({
      x: round(p.x),
      y: round(p.y),
      in: {
        x: round(p.x + segment.handleIn.x),
        y: round(p.y + segment.handleIn.y),
      },
      out: {
        x: round(p.x + segment.handleOut.x),
        y: round(p.y + segment.handleOut.y),
      },
    });
  }
  return tidy({ nodes });
}

/**
 * Removes debris that boolean algorithms can leave behind: duplicated anchors
 * (zero-length segments), and anchors that sit on a straight line between their
 * neighbours. A clean contour keeps exact corners and nothing else.
 */
function tidy(contour: Contour): Contour | null {
  let nodes = contour.nodes.slice();
  // Collapse coincident anchors, choosing the handle that preserves the curve.
  let merged = true;
  while (merged && nodes.length > 1) {
    merged = false;
    for (let i = 0; i < nodes.length && nodes.length > 1; i++) {
      const j = (i + 1) % nodes.length;
      if (i === j) break;
      if (dist(nodes[i], nodes[j]) < EPSILON) {
        nodes[i].out = { ...nodes[j].out };
        nodes.splice(j, 1);
        merged = true;
        if (j < i) i--;
      }
    }
  }
  // Drop anchors that are redundant midpoints of a straight run.
  let trimmed = true;
  while (trimmed && nodes.length > 3) {
    trimmed = false;
    for (let i = 0; i < nodes.length; i++) {
      const prev = nodes[(i - 1 + nodes.length) % nodes.length];
      const cur = nodes[i];
      const next = nodes[(i + 1) % nodes.length];
      const straight =
        dist(prev.out, prev) < EPSILON &&
        dist(cur.in, cur) < EPSILON &&
        dist(cur.out, cur) < EPSILON &&
        dist(next.in, next) < EPSILON;
      if (!straight) continue;
      const along = dist(prev, cur) + dist(cur, next) - dist(prev, next);
      if (along < EPSILON * 2) {
        nodes.splice(i, 1);
        trimmed = true;
        break;
      }
    }
  }
  nodes = nodes.map((n) => ({
    x: round(n.x),
    y: round(n.y),
    in: { x: round(n.in.x), y: round(n.in.y) },
    out: { x: round(n.out.x), y: round(n.out.y) },
  }));
  if (nodes.length < 3) return null;
  return { nodes };
}

function contoursFromItem(item: paper.PathItem): Contour[] {
  const contours: Contour[] = [];
  for (const path of itemParts(item)) {
    if (!path.closed) continue;
    if (Math.abs(path.area) < MIN_AREA) continue;
    const contour = contourFromPath(path);
    if (contour) contours.push(contour);
  }
  return contours;
}

/**
 * Re-derives orientation from geometry so the same result always serialises the
 * same way: outer loops turn one way, holes the other (even-odd semantics).
 */
function normalise(contours: Contour[]): Contour[] {
  if (!contours.length) return contours;
  const items: paper.Path[] = [];
  for (const contour of contours) {
    const item = toPaper([contour], "nonzero") as paper.Path;
    items.push(item);
  }
  if (!items.length) return [];
  let rebuilt: paper.PathItem = items[0];
  if (items.length > 1) {
    const compound = new scope.CompoundPath({ children: items, insert: false });
    compound.fillRule = "evenodd";
    compound.reorient(false);
    rebuilt = compound;
  } else {
    items[0].reorient(true);
  }
  return contoursFromItem(rebuilt);
}

/**
 * Runs a boolean over operands given as {contours, fillRule}. Operands are
 * real paths at their actual document positions, so groups/offsets are honoured
 * by construction. Subtract uses the first operand as base.
 */
export function runBoolean(
  operands: { contours: Contour[]; fillRule: "evenodd" | "nonzero" }[],
  op: BooleanOp,
): Contour[] {
  const items: paper.PathItem[] = [];
  for (const operand of operands) {
    const item = toPaper(operand.contours, operand.fillRule);
    if (item) items.push(item);
  }
  if (!items.length) return [];

  let result: paper.PathItem | null;
  if (items.length === 1) {
    // Zero-argument operations reduce to "normalise this operand": crossings are
    // resolved and overlapping loops inside one compound are merged.
    const only = items[0];
    result = op === "exclude" ? only.clone() : only.unite(only.clone());
  } else if (op === "intersect") {
    result = items.reduce((a, b) => a.intersect(b));
  } else if (op === "exclude") {
    result = items.reduce((a, b) => a.exclude(b));
  } else if (op === "subtract") {
    const cut = items.slice(1).reduce((a, b) => a.unite(b));
    result = items[0].subtract(cut);
  } else {
    result = items.reduce((a, b) => a.unite(b));
  }
  if (!result) return [];
  return normalise(contoursFromItem(result));
}
