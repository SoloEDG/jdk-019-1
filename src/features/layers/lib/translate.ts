import type { Shape } from "../../../shared/types";
import { syncLegacy, translateShape } from "../../../shared/geometry";
export function translate(s: Shape, x: number, y: number) {
  translateShape(s, x, y);
  syncLegacy(s);
}
