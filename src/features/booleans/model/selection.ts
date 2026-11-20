import { computed } from "vue";
import { doc } from "../../../shared/document";
import type { Shape } from "../../../shared/types";
import { contoursOf } from "../../../shared/geometry";

export const selectedShapes = computed(() =>
  doc.shapes.filter((s) => doc.selected.includes(s.id)),
);

/** How many operands the selection would form: groups count once. */
export const operandCount = computed(() => {
  const keys = new Set<string>();
  for (const s of selectedShapes.value) keys.add(s.group ?? s.id);
  return keys.size;
});

/**
 * A boolean needs two distinct objects (a group is one object) and every
 * selected shape must be closed and have geometry.
 */
export const canCombine = computed(
  () =>
    operandCount.value >= 2 &&
    selectedShapes.value.every((s) => s.closed && contoursOf(s).length > 0),
);

/** The live boolean under selection, if any, for the parameters panel. */
export const activeBoolean = computed<Shape | undefined>(() => {
  const shape = doc.shapes.find((s) => doc.selected.includes(s.id));
  return shape?.source ? shape : undefined;
});

export function isBoolean(s: Shape): boolean {
  return !!s.source;
}
