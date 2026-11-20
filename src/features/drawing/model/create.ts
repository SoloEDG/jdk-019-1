import { doc } from "../../../shared/document";
import type { Point, Shape } from "../../../shared/types";
import { contoursOf } from "../../../shared/geometry";

/** Starts a new open pen path; `nodes` and its only contour share one array. */
export function create(p: Point) {
  const nodes: Shape["nodes"] = [];
  const s: Shape = {
    id: crypto.randomUUID(),
    name: "Pen path",
    nodes,
    closed: false,
    contours: [{ nodes }],
    fill: "none",
    stroke: "#7754dc",
    width: 3,
    opacity: 1,
  };
  doc.shapes.push(s);
  doc.selected = [s.id];
  return s;
}
export function add(s: Shape, p: Point) {
  const contour = contoursOf(s)[0];
  const node = { ...p, in: { ...p }, out: { ...p } };
  contour.nodes.push(node);
  return node;
}
