import { ref } from "vue";
import { doc } from "../../../shared/document";
interface Snapshot {
  shapes: string;
  selected: string[];
}
const past: Snapshot[] = [];
const future: Snapshot[] = [];
export const revision = ref(0);

function take(): Snapshot {
  return { shapes: JSON.stringify(doc.shapes), selected: doc.selected.slice() };
}
export function beginEdit() {
  past.push(take());
  if (past.length > 100) past.shift();
  future.length = 0;
}
function install(snapshot: Snapshot) {
  doc.shapes = JSON.parse(snapshot.shapes);
  // Selections that outlive their objects are pruned; survivors keep the
  // selection the user had, so an undone operation can be re-adjusted at once.
  doc.selected = (snapshot.selected ?? []).filter((id) =>
    doc.shapes.some((s) => s.id === id),
  );
  revision.value++;
}
export function undo() {
  const state = past.pop();
  if (state) {
    future.push(take());
    install(state);
  }
}
export function redo() {
  const state = future.pop();
  if (state) {
    past.push(take());
    install(state);
  }
}
