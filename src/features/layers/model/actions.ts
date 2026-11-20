import { beginEdit } from "../../drawing/model/history";
import { doc } from "../../../shared/document";
export function group() {
  beginEdit();
  const id = crypto.randomUUID();
  const selected = doc.shapes.filter((s) => doc.selected.includes(s.id));
  if (selected.length < 2) return;
  const top = doc.shapes
    .map((s) => doc.selected.includes(s.id))
    .lastIndexOf(true);
  const below = doc.shapes
    .slice(0, top + 1)
    .filter((s) => !doc.selected.includes(s.id));
  const above = doc.shapes.slice(top + 1);
  selected.forEach((s) => (s.group = id));
  doc.shapes = [...below, ...selected, ...above];
}
export function reorder(delta: number) {
  const first = doc.shapes.find((s) => doc.selected.includes(s.id));
  if (!first) return;
  // A boolean result is one object even though its operands live inside it.
  const keyOf = (s: typeof first) => (s.group ? "g:" + s.group : "s:" + s.id);
  const blocks: (typeof doc.shapes)[] = [];
  for (const shape of doc.shapes) {
    const last = blocks.at(-1);
    if (last && keyOf(last[0]) === keyOf(shape)) last.push(shape);
    else blocks.push([shape]);
  }
  const i = blocks.findIndex((b) => b.some((s) => s.id === first.id)),
    j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return;
  beginEdit();
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  doc.shapes = blocks.flat();
}
export function remove() {
  beginEdit();
  const removed = new Set(
    doc.shapes.filter((s) => doc.selected.includes(s.id)).map((s) => s.id),
  );
  doc.shapes = doc.shapes.filter((s) => !removed.has(s.id));
  doc.selected = [];
}
