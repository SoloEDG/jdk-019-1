import { beginEdit } from "../../drawing/model/history";
import { doc } from "../../../shared/document";
import type { Shape } from "../../../shared/types";
import { syncLegacy } from "../../../shared/geometry";
export function style<K extends keyof Shape>(k: K, v: Shape[K]) {
  beginEdit();
  doc.shapes
    .filter((s) => doc.selected.includes(s.id))
    .forEach((s) => {
      s[k] = v;
      if (k === "closed") syncLegacy(s);
    });
}
