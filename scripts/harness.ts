/**
 * Integration harness: loads the real feature modules headlessly and drives
 * them the way the UI would.
 *
 *   node -e "require('esbuild').build({entryPoints:['scripts/harness.ts'],bundle:true,
 *     platform:'node',format:'esm',outfile:'.harness.mjs',packages:'external',
 *     plugins:[{name:'p',setup(b){b.onResolve({filter:/^paper\/dist\/paper-core$/},
 *     ()=>({path:require.resolve('paper/dist/paper-core'),external:true}))}}]})"
 *   node .harness.mjs
 */
const { doc } = await import("../src/shared/document");
const { seed } = await import("../src/features/drawing/model/seed");
const { apply, changeOp, expandBoolean } = await import("../src/features/booleans/model/actions");
const { undo, redo, beginEdit } = await import("../src/features/drawing/model/history");
const { contoursOf, shapePath, fillRuleOf } = await import("../src/shared/geometry");
const { serialize } = await import("../src/features/export/lib/serialize");
const { translateSelected } = await import("../src/features/layers/model/drag");
const { group } = await import("../src/features/layers/model/actions");
const { evaluate } = await import("../src/features/booleans/model/combine");

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}
function reset() {
  doc.shapes = [];
  doc.selected = [];
}
function rect(id: string, x: number, y: number, w: number, h: number) {
  const n = (px: number, py: number) => ({ x: px, y: py, in: { x: px, y: py }, out: { x: px, y: py } });
  return {
    id,
    name: id,
    nodes: [n(x, y), n(x + w, y), n(x + w, y + h), n(x, y + h)],
    closed: true,
    fill: "#7850d6",
    stroke: "#ffffff",
    width: 2,
    opacity: 1,
  };
}

// 1. Union of two overlapping rects: one contour, 8 anchors, no fragments.
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("union");
const u = doc.shapes[0];
check("union reduces to one shape", doc.shapes.length === 1 && doc.selected[0] === u.id);
check("union has one contour with 8 anchors", contoursOf(u).length === 1 && contoursOf(u)[0].nodes.length === 8,
  `${contoursOf(u).length} contours / ${contoursOf(u)[0]?.nodes.length} nodes`);
check("union keeps origin during combine", doc.shapes[0].fill === "#7850d6");

// tangent circles are not merged and gain no sliver
reset();
doc.shapes = [circle("c1", 100, 100, 50), circle("c2", 200, 100, 50)];
doc.selected = ["c1", "c2"];
apply("union");
check("tangent union keeps both loops, no fragments", contoursOf(doc.shapes[0]).length === 2 &&
  contoursOf(doc.shapes[0]).every((c) => c.nodes.length === 4),
  JSON.stringify(contoursOf(doc.shapes[0]).map((c) => c.nodes.length)));
check("tangent union has no zero-length segments", contoursOf(doc.shapes[0]).every((c) =>
  c.nodes.every((n, i) => {
    const m = c.nodes[(i + 1) % c.nodes.length];
    return Math.hypot(m.x - n.x, m.y - n.y) > 1e-6;
  })));

// shared edge union still yields one clean outline
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 100, 0, 100, 100)];
doc.selected = ["a", "b"];
apply("union");
check("shared-edge union collapses to 4 anchors",
  contoursOf(doc.shapes[0]).length === 1 && contoursOf(doc.shapes[0])[0].nodes.length === 4);

// 2. Hole after subtract survives export with evenodd and no editor objects.
reset();
doc.shapes = [rect("a", 0, 0, 200, 200), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("subtract");
const ring = doc.shapes[0];
check("subtract leaves two contours", contoursOf(ring).length === 2);
check("hole uses evenodd", fillRuleOf(ring) === "evenodd");
const svg = serialize(doc.shapes);
check("export embeds both loops", (svg.match(/M /g) ?? []).length >= 2 && /fill-rule="evenodd"/.test(svg));
const exportedD = /<path d="([^"]+)"/.exec(svg)?.[1] ?? "";
check(
  "exported path contains both loops and no editor references",
  (exportedD.match(/M/g) ?? []).length >= 2 && exportedD.length > 20 && !/data-/.test(svg),
  exportedD.slice(0, 80),
);

// 3. Exclusion and intersection
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("exclude");
check("exclude leaves two loops", contoursOf(doc.shapes[0]).length === 2);
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("intersect");
check("intersect leaves the shared square", contoursOf(doc.shapes[0]).length === 1 &&
  contoursOf(doc.shapes[0])[0].nodes.every((n) => n.x >= 50 && n.y >= 50));

// 4. Actual positions: grouped objects contribute at their own offsets.
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 200, 0, 100, 100)];
doc.selected = ["a", "b"];
group();
doc.selected = doc.shapes.map((s) => s.id);
doc.shapes.push(rect("c", 250, 0, 100, 100));
doc.selected = [...doc.shapes.filter((s) => s.group).map((s) => s.id), "c"];
apply("union");
check("grouped operands use real positions", contoursOf(doc.shapes[0]).length === 2,
  JSON.stringify(contoursOf(doc.shapes[0]).map((c) => c.nodes.map((n) => [n.x, n.y]))));

// 5. Live source can be re-parameterised without changing the visible outline.
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("union");
const live = doc.shapes[0];
const before = shapePath(live);
changeOp(live, "exclude");
check("changing op re-evaluates in place", live.source!.op === "exclude" && contoursOf(live).length === 2);
changeOp(live, "union");
check("round-trip restores exact geometry", shapePath(live) === before);

// 6. Undo restores the original layer stack and styles.
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 50, 50, 100, 100)];
doc.shapes[0].fill = "#ff0000";
doc.selected = ["a", "b"];
apply("union");
check("after op: one shape", doc.shapes.length === 1);
undo();
check("undo restores two shapes", doc.shapes.length === 2 && doc.shapes[0].id === "a" && doc.shapes[1].id === "b");
check("undo restores style", doc.shapes[0].fill === "#ff0000");
redo();
check("redo reapplies boolean", doc.shapes.length === 1 && !!doc.shapes[0].source);

// 7. Expand detaches from source but keeps the exact boundary.
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("union");
const liveShape = doc.shapes[0];
const boundary = shapePath(liveShape);
expandBoolean(liveShape);
const expanded = doc.shapes[0];
check("expand drops source", !expanded.source);
check("expand keeps the boundary pixel-identical", shapePath(expanded) === boundary);
check("expanded result no longer accepts parameters", expanded.source === undefined);
undo();
check("undo after expand restores live source", !!doc.shapes[0].source && shapePath(doc.shapes[0]) === boundary);

// 8. Moving a live boolean moves its operands so re-evaluation stays in place.
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("union");
const moved = doc.shapes[0];
const start = shapePath(moved);
doc.selected = [moved.id];
translateSelected(10, 5);
const shifted = shapePath(moved);
check("move translates the outline", shifted !== start);
changeOp(moved, "union");
check("re-evaluating after a move keeps placement", shapePath(moved) === shifted,
  `\n  was ${shifted.slice(0, 90)}\n  now ${shapePath(moved).slice(0, 90)}`);

// 9. Degenerate: identical shapes and a knife that misses.
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 0, 0, 100, 100)];
doc.selected = ["a", "b"];
apply("subtract");
check("subtracting an identical copy empties cleanly", doc.shapes.length === 0 || contoursOf(doc.shapes[0]).length === 0);
reset();
doc.shapes = [rect("a", 0, 0, 100, 100), rect("b", 300, 300, 100, 100)];
doc.selected = ["a", "b"];
apply("subtract");
check("a missing knife leaves the base intact", contoursOf(doc.shapes[0]).length === 1 &&
  contoursOf(doc.shapes[0])[0].nodes.length === 4);

// 10. Persistence round-trip keeps provenance and holes.
reset();
doc.shapes = [rect("a", 0, 0, 200, 200), rect("b", 50, 50, 100, 100)];
doc.selected = ["a", "b"];
apply("subtract");
const roundTripped = JSON.parse(JSON.stringify(doc.shapes));
reset();
doc.shapes = roundTripped;
check("restored boolean still evaluates", evaluate(doc.shapes[0]));
check("restored boolean keeps both loops", contoursOf(doc.shapes[0]).length === 2);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

function circle(id: string, cx: number, cy: number, r: number) {
  const k = r * 0.5522847498307936;
  return {
    id,
    name: id,
    nodes: [
      { x: cx + r, y: cy, in: { x: cx + r, y: cy - k }, out: { x: cx + r, y: cy + k } },
      { x: cx, y: cy + r, in: { x: cx + k, y: cy + r }, out: { x: cx - k, y: cy + r } },
      { x: cx - r, y: cy, in: { x: cx - r, y: cy + k }, out: { x: cx - r, y: cy - k } },
      { x: cx, y: cy - r, in: { x: cx - k, y: cy - r }, out: { x: cx + k, y: cy - r } },
    ],
    closed: true,
    fill: "#7850d6",
    stroke: "#ffffff",
    width: 2,
    opacity: 1,
  };
}
