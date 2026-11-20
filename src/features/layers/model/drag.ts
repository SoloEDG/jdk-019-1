import { doc } from "../../../shared/document";
import { syncLegacy, translateShape } from "../../../shared/geometry";
export function translateSelected(x: number, y: number) {
  doc.shapes
    .filter((s) => doc.selected.includes(s.id))
    .forEach((s) => {
      translateShape(s, x, y);
      syncLegacy(s);
    });
}
