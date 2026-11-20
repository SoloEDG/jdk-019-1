import type { Shape } from "../../../shared/types";
import { shapePath } from "../../../shared/geometry";

/** SVG path data for everything the shape paints, holes included. */
export function path(s: Shape) {
  return shapePath(s);
}
