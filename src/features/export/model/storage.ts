import { beginEdit, revision } from "../../drawing/model/history";
import { ref } from "vue";
import { doc } from "../../../shared/document";
import type { Contour, Node, Point, Shape } from "../../../shared/types";
export const storageStatus = ref("All changes saved locally");
export function save() {
  try {
    localStorage.setItem("forma-document", JSON.stringify(doc.shapes));
    storageStatus.value = "All changes saved locally";
  } catch {
    storageStatus.value =
      "Local storage unavailable — export to keep your work";
  }
}
function point(v: Point) {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y);
}
function node(v: Node) {
  return point(v) && point(v.in) && point(v.out);
}
function contour(v: Contour) {
  return !!v && Array.isArray(v.nodes) && v.nodes.every(node);
}
function validSource(s: Shape): boolean {
  if (!s.source) return true;
  const src = s.source;
  return (
    ["union", "intersect", "subtract", "exclude"].includes(src.op) &&
    Array.isArray(src.shapes) &&
    Array.isArray(src.operands) &&
    src.operands.every((o) => valid(o)) &&
    Array.isArray(src.evaluated) &&
    src.evaluated.every(contour)
  );
}
function valid(s: Shape): boolean {
  return (
    s &&
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    Array.isArray(s.nodes) &&
    s.nodes.every(node) &&
    (s.contours === undefined ||
      (Array.isArray(s.contours) && s.contours.every(contour))) &&
    typeof s.fill === "string" &&
    /^(none|#[0-9a-f]{3,8})$/i.test(s.fill) &&
    typeof s.stroke === "string" &&
    /^#[0-9a-f]{3,8}$/i.test(s.stroke) &&
    Number.isFinite(s.width) &&
    Number.isFinite(s.opacity) &&
    validSource(s)
  );
}
export function restore() {
  try {
    const value = JSON.parse(localStorage.getItem("forma-document") || "null");
    if (Array.isArray(value) && value.every(valid)) {
      beginEdit();
      doc.shapes = value;
      revision.value++;
      doc.selected = [];
      return true;
    }
  } catch {}
  return false;
}
