import { doc } from "../../../shared/document";
import type { BooleanOp, Shape } from "../../../shared/types";
import { contoursOf, fillRuleOf, syncLegacy } from "../../../shared/geometry";
import { runBoolean } from "../lib/engine";

/**
 * Operands come from the live selection, so an operation always uses the objects
 * as they currently sit on the artboard — including group members at their own
 * positions. A group contributes one operand: the union of its members.
 */
export function buildOperands(ordered: Shape[]): Shape[] {
  const members = new Map<string, Shape[]>();
  for (const shape of ordered) {
    if (!shape.group) continue;
    const list = members.get(shape.group) ?? [];
    list.push(shape);
    members.set(shape.group, list);
  }
  const operands: Shape[] = [];
  const emitted = new Set<string>();
  for (const shape of ordered) {
    if (!shape.group) {
      operands.push(snapshot(shape));
      continue;
    }
    if (emitted.has(shape.group)) continue;
    emitted.add(shape.group);
    const group = members.get(shape.group)!;
    const merged = { ...snapshot(group[0]), id: shape.group };
    delete merged.source;
    merged.name = group[0].name || "Group";
    merged.group = undefined;
    merged.contours = group.flatMap((member) =>
      cloneContours(contoursOf(member)),
    );
    if (group.length > 1) {
      // Union the members as whole shapes so a member that is itself hollow
      // keeps its hole instead of being flattened into a filled loop.
      const joined = runBoolean(
        group.map((member) => ({
          contours: contoursOf(member),
          fillRule: fillRuleOf(member),
        })),
        "union",
      );
      if (joined.length) merged.contours = joined;
    }
    merged.closed = true;
    syncLegacy(merged);
    operands.push(merged);
  }
  return operands;
}

function snapshot(s: Shape): Shape {
  return JSON.parse(JSON.stringify(s)) as Shape;
}

function cloneContours(contours: Shape["contours"]) {
  return (contours ?? []).map((c) => ({
    nodes: c.nodes.map((n) => ({
      x: n.x,
      y: n.y,
      in: { ...n.in },
      out: { ...n.out },
    })),
  }));
}

/**
 * Recompute a live boolean in place from its captured operands. If a parameter
 * change removes every contour, the previous result is kept so the artwork does
 * not vanish under the user's cursor; the call reports the failure.
 */
export function evaluate(s: Shape): boolean {
  if (!s.source) return false;
  const result = runBoolean(
    s.source.operands.map((o) => ({
      contours: contoursOf(o),
      fillRule: fillRuleOf(o),
    })),
    s.source.op,
  );
  if (!result.length) return false;
  s.contours = cloneContours(result);
  s.closed = true;
  s.source.evaluated = cloneContours(result);
  s.source.detached = false;
  s.name = result.length > 1 ? "Compound path" : "Combined path";
  syncLegacy(s);
  return true;
}

/** Records that the result geometry was hand-edited and no longer matches. */
export function markDetached(s: Shape) {
  if (s.source) s.source.detached = true;
}

/**
 * Applies a boolean operation to the given shapes. The result keeps the
 * bottom-most operand's appearance and takes the selection's top-most stacking
 * slot, so objects above and below the selection keep their relative order.
 * Operands leave the layer stack but are kept by value on the result, so it can
 * be re-parameterised or expanded later. Subtract uses the lowest object as its
 * base, matching the "lower minus upper" convention.
 */
export function combine(op: BooleanOp, ids: string[]): Shape | undefined {
  const ordered = doc.shapes.filter((s) => ids.includes(s.id));
  if (!ordered.length) return;
  const operands = buildOperands(ordered);
  const result = runBoolean(
    operands.map((o) => ({ contours: contoursOf(o), fillRule: fillRuleOf(o) })),
    op,
  );

  const top = doc.shapes.map((s) => ids.includes(s.id)).lastIndexOf(true);
  const below = doc.shapes.slice(0, top + 1).filter((s) => !ids.includes(s.id));
  const above = doc.shapes.slice(top + 1);

  if (!result.length) {
    // The operation consumes everything (identical subtract, disjoint
    // intersect). Leave no empty shell behind; undo brings the objects back.
    doc.shapes = [...below, ...above];
    doc.selected = [];
    return;
  }

  const base = ordered[0];
  const sameGroup =
    base.group && ordered.every((o) => o.group === base.group)
      ? base.group
      : undefined;

  const shape: Shape = {
    id: crypto.randomUUID(),
    name: result.length > 1 ? "Compound path" : "Combined path",
    nodes: [],
    closed: true,
    contours: cloneContours(result),
    fill: base.fill,
    stroke: base.stroke,
    width: base.width,
    opacity: base.opacity,
    group: sameGroup,
    source: {
      op,
      shapes: ordered.map((s) => s.id),
      operands,
      evaluated: cloneContours(result),
      detached: false,
    },
  };
  syncLegacy(shape);
  doc.shapes = [...below, shape, ...above];
  doc.selected = [shape.id];
  return shape;
}

/** Changes the operation (or operand stack) of a live boolean and rebuilds it. */
export function updateSource(
  s: Shape,
  patch: Partial<{ op: BooleanOp; operands: Shape[]; shapes: string[] }>,
) {
  if (!s.source) return;
  Object.assign(s.source, patch);
  evaluate(s);
}

export function reorderOperand(s: Shape, index: number, delta: number) {
  if (!s.source) return;
  const next = index + delta;
  if (index < 0 || next < 0 || next >= s.source.operands.length) return;
  const operands = s.source.operands.slice();
  [operands[index], operands[next]] = [operands[next], operands[index]];
  updateSource(s, { operands });
}

export function removeOperand(s: Shape, index: number) {
  if (!s.source || s.source.operands.length < 2) return;
  const operands = s.source.operands.filter((_, i) => i !== index);
  updateSource(s, { operands });
}

/**
 * Drops provenance, leaving the evaluated outlines as ordinary editable shapes.
 * The visible geometry is copied verbatim, so nothing moves on screen. The
 * expanded result can no longer be re-parameterised.
 */
export function expand(s: Shape): Shape | undefined {
  if (!s.source) return;
  const plain = JSON.parse(JSON.stringify(s)) as Shape;
  plain.contours = cloneContours(s.contours ?? s.source.evaluated);
  plain.nodes = [];
  plain.closed = true;
  plain.name = "Outline";
  delete plain.source;
  syncLegacy(plain);
  const index = doc.shapes.findIndex((x) => x.id === s.id);
  if (index < 0) return;
  const next = doc.shapes.slice();
  next[index] = plain;
  doc.shapes = next;
  doc.selected = [plain.id];
  return plain;
}
