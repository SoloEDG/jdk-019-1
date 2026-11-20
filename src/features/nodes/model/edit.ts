import { doc } from "../../../shared/document";
import { markDetached } from "../../booleans/model/combine";

/**
 * Called after a node edit lands. A live boolean's saved operands no longer
 * describe the artwork once a handle moved, so it is marked detached; its
 * provenance stays available for a deliberate re-apply.
 */
export function edited(shapeId: string) {
  const shape = doc.shapes.find((s) => s.id === shapeId);
  if (shape) markDetached(shape);
}
