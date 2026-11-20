import { beginEdit } from "../../drawing/model/history";
import {
  combine,
  expand,
  reorderOperand,
  removeOperand,
  updateSource,
} from "./combine";
import { canCombine } from "./selection";
import { doc } from "../../../shared/document";
import type { BooleanOp, Shape } from "../../../shared/types";

export function apply(op: BooleanOp) {
  if (!canCombine.value) return;
  beginEdit();
  combine(op, doc.selected.slice());
}

export function changeOp(shape: Shape, op: BooleanOp) {
  beginEdit();
  updateSource(shape, { op });
}

export function moveOperand(shape: Shape, index: number, delta: number) {
  beginEdit();
  reorderOperand(shape, index, delta);
}

export function dropOperand(shape: Shape, index: number) {
  beginEdit();
  removeOperand(shape, index);
}

/** Freezes the operation into plain outlines; undo restores the live source. */
export function expandBoolean(shape: Shape) {
  beginEdit();
  expand(shape);
}
