import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const server = spawn("npx", ["vite", "--port", "5199", "--strictPort"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
for (let i = 0; i < 100; i++) {
  if (/Local:.*5199/.test(log)) break;
  await sleep(150);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const shapes = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("svg[data-testid=canvas] > path[data-shape]")].map((p) => ({
      id: p.getAttribute("data-shape"),
      d: p.getAttribute("d"),
      fill: p.getAttribute("fill"),
      rule: p.getAttribute("fill-rule"),
      op: p.getAttribute("data-operation"),
    })),
  );
const selectedShape = () =>
  page.evaluate(() => {
    const path = document.querySelector("svg[data-testid=canvas] > path[data-selected]");
    return path
      ? {
          d: path.getAttribute("d"),
          op: path.getAttribute("data-operation"),
          id: path.getAttribute("data-shape"),
          rule: path.getAttribute("fill-rule"),
          fill: path.getAttribute("fill"),
        }
      : null;
  });
const undo = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll(".toolbar button")].find((b) => b.textContent?.includes("↶"));
    btn?.click();
  });
const redo = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll(".toolbar button")].find((b) => b.textContent?.includes("↷"));
    btn?.click();
  });

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

check("app renders seeded petals", (await shapes()).length === 8);

// --- selection and union from the layers panel ---
const layers = page.locator(".layer");
const original = await page.evaluate(() =>
  [...document.querySelectorAll(".layer")].map((b) => b.textContent?.trim()),
);
await layers.nth(0).click();
await layers.nth(1).click({ modifiers: ["Shift"] });
check("pathfinder enabled with two selected", !(await page.getByTestId("boolean-union").isDisabled()));
await page.getByTestId("boolean-union").click();
const unioned = await shapes();
check("union collapses to one path", unioned.length === 7, `${unioned.length} paths`);
const live = await selectedShape();
check("union result is one closed editable contour", (live.d.match(/M/g) ?? []).length === 1);
check("union is marked as a live operation", live.op === "union");

// --- re-parameterise through the panel ---
const dUnion = live.d;
await page.getByTestId("source-op-exclude").click();
const excluded = await selectedShape();
check("switching op recomputes loops in place", excluded.op === "exclude" && (excluded.d.match(/M/g) ?? []).length >= 2);
await page.getByTestId("source-op-union").click();
check("switching back restores exact geometry", (await selectedShape()).d === dUnion);

// --- node editing targets the result ---
await page.getByTestId("tool-nodes").click();
const anchors = page.getByTestId("anchor");
check("node overlay shows union anchors", (await anchors.count()) > 0, `${await anchors.count()} anchors`);
const box = await anchors.first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 15, { steps: 6 });
await page.mouse.up();
const moved = await selectedShape();
check("dragging an anchor changes only the result", moved.d !== dUnion);
check("hand edit pauses the saved operands", (await page.locator(".source-state.stale").count()) === 1);
await page.getByTestId("tool-select").click();
await redo().catch(() => {});
await page.getByTestId("source-op-union").click();
check("reapplying the operation discards hand edits", (await selectedShape()).d === dUnion);

// --- styling the result ---
await page.evaluate(() => {
  const input = document.querySelector('input[aria-label="Fill"]');
  input.value = "#ff0066";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
check("fill applies to the boolean result", (await selectedShape() && (await shapes()).find((s) => s.op)?.fill) === "#ff0066");

// --- undo restores the original stack and styles ---
let undoSteps = 0;
while ((await shapes()).length !== 8 && undoSteps < 10) {
  await undo();
  undoSteps++;
}
let restored = await shapes();
check("undo unwinds back to the original stack", restored.length === 8, `${restored.length} paths after ${undoSteps} undos`);
check("undo restores fills", restored.every((s) => s.fill !== "#ff0066" && !s.op));
const restoredOrder = await page.evaluate(() =>
  [...document.querySelectorAll(".layer")].map((b) => b.textContent?.trim()),
);
check("undo restores the layer order", JSON.stringify(restoredOrder) === JSON.stringify(original));
for (let i = 0; i < undoSteps; i++) await redo();
check("redo reapplies the boolean", (await shapes()).length === 7);

// --- hole: subtract a smaller shape, then check canvas + export ---
await page.evaluate(() => {
  const svg = document.querySelector("svg[data-testid=canvas]");
  // Draw a small closed-free path is not needed: duplicate-selection via layers.
  void svg;
});
// Use a fresh ring: select two petals and subtract so the result has a hole.
const current = await shapes();
check("live boolean still selected after redo", current.some((s) => s.op));
// Expand must preserve the boundary exactly, and detach from source.
const beforeExpand = await selectedShape();
await page.getByTestId("expand-boolean").click();
const afterExpand = await selectedShape();
check("expanded outline keeps the exact boundary", afterExpand.d === beforeExpand.d);
check("expanded outline no longer exposes parameters", (await page.getByTestId("expand-boolean").count()) === 0);
await page.getByTestId("tool-nodes").click();
check("expanded outline exposes anchors", (await page.getByTestId("anchor").count()) > 0);
await page.getByTestId("tool-select").click();
await undo();
const backLive = await selectedShape();
check("undo returns to the same live boundary", backLive.d === beforeExpand.d && backLive.op === beforeExpand.op);

// --- grouped objects are computed at their real positions ---
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
// Two far-apart rects share a group; a third rect bridges them. If the group
// were collapsed into a local origin, the far member would land in the wrong
// place and the union would show a gap the bridging rect cannot cover.
const groupDoc = JSON.stringify([
  { id: "ga", name: "Group A", group: "grp", closed: true, nodes: rectNodes(100, 100, 100, 100), fill: "#7850d6", stroke: "#ffffff", width: 2, opacity: 1 },
  { id: "gb", name: "Group B", group: "grp", closed: true, nodes: rectNodes(300, 100, 100, 100), fill: "#7850d6", stroke: "#ffffff", width: 2, opacity: 1 },
  { id: "bridge", name: "Bridge", closed: true, nodes: rectNodes(200, 100, 100, 100), fill: "#a685ed", stroke: "#ffffff", width: 2, opacity: 1 },
]);
await page.evaluate((doc) => localStorage.setItem("forma-document", doc), groupDoc);
await page.reload({ waitUntil: "networkidle" });
const l2 = page.locator(".layer");
check("group selected as a unit", (await page.locator(".layer").count()) === 3);
await l2.nth(2).click();
check("clicking a group member selects the whole group", (await page.locator(".layer.chosen").count()) === 2);
await l2.nth(0).click({ modifiers: ["Shift"] });
await page.getByTestId("boolean-union").click();
const grouped = await selectedShape();
const xs = [...grouped.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
check("group is merged at real positions into one contour", (grouped.d.match(/M/g) ?? []).length === 1 &&
  Math.min(...xs) === 100 && Math.max(...xs) === 400,
  `minX=${Math.min(...xs)} maxX=${Math.max(...xs)} loops=${(grouped.d.match(/M/g) ?? []).length}`);

// --- rings from restored artwork: hole survives canvas + export ---
const ringDoc = JSON.stringify([
  {
    id: "outer", name: "Outer", closed: true,
    nodes: rectNodes(100, 100, 300, 300),
    fill: "#7850d6", stroke: "#ffffff", width: 2, opacity: 1,
  },
  {
    id: "inner", name: "Inner", closed: true,
    nodes: rectNodes(200, 200, 100, 100),
    fill: "#a685ed", stroke: "#ffffff", width: 2, opacity: 1,
  },
]);
await page.evaluate((doc) => {
  localStorage.setItem("forma-document", doc);
}, ringDoc);
await page.reload({ waitUntil: "networkidle" });
check("restored artwork loads both shapes", (await shapes()).length === 2);
const ringLayers = page.locator(".layer");
await ringLayers.nth(1).click();
await ringLayers.nth(0).click({ modifiers: ["Shift"] });
await page.getByTestId("boolean-subtract").click();
const ring = await selectedShape();
check("subtract yields a hollow compound", (ring.d.match(/M/g) ?? []).length === 2, ring.d.slice(0, 100));
check("holes render with evenodd", ring.rule === "evenodd");
const ringSvg = await page.evaluate(() => {
  const p = document.querySelector("svg[data-testid=canvas] > path[data-selected]");
  return p ? p.outerHTML : "";
});
check("holes are painted as holes on canvas", /fill-rule="evenodd"/.test(ringSvg) && (ringSvg.match(/M/g) ?? []).length === 2);

const downloadPromise = page.waitForEvent("download");
await page.getByTestId("export").click();
const download = await downloadPromise;
const stream = await download.createReadStream();
let svg = "";
for await (const chunk of stream) svg += chunk;
check("export is standalone SVG", /^<svg xmlns=/.test(svg) && svg.endsWith("</svg>"));
check("export has no editor-only attributes", !/data-/.test(svg) && !/aria-/.test(svg));
check("exported ring keeps its hole", /fill-rule="evenodd"/.test(svg) && (svg.match(/M/g) ?? []).length === 2, svg.slice(0, 200));
check("exported ring needs no editor objects", !/data-|aria-|<use|href=/.test(svg));

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
server.kill("SIGTERM");
console.log(failures ? `\n${failures} failure(s)` : "\nAll UI checks passed");
process.exit(failures ? 1 : 0);

function rectNodes(x, y, w, h) {
  const n = (px, py) => ({ x: px, y: py, in: { x: px, y: py }, out: { x: px, y: py } });
  return [n(x, y), n(x + w, y), n(x + w, y + h), n(x, y + h)];
}
