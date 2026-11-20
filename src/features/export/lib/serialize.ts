import type { Shape } from "../../../shared/types";
import { fillRuleOf, shapePath } from "../../../shared/geometry";

/** Inline SVG for the exported artwork; holes are painted by the same rule as on canvas. */
export function serialize(
  shapes: Shape[],
  paths: string[] = shapes.map(shapePath),
) {
  let content = "",
    group: string | undefined;
  shapes.forEach((s, i) => {
    if (s.group !== group) {
      if (group) content += "</g>";
      group = s.group;
      if (group) content += `<g id="group-${group}-${i}">`;
    }
    content += `<path d="${paths[i]}" fill="${s.fill}" fill-rule="${fillRuleOf(s)}" stroke="${s.stroke}" stroke-width="${s.width}" opacity="${s.opacity}"/>`;
  });
  if (group) content += "</g>";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">${content}</svg>`;
}
