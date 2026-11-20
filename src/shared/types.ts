export interface Point {
  x: number;
  y: number;
}
export interface Node extends Point {
  in: Point;
  out: Point;
}
/** One closed loop of a compound outline. Holes are loops with the opposite winding. */
export interface Contour {
  nodes: Node[];
}
export type BooleanOp = "union" | "intersect" | "subtract" | "exclude";
/** A live boolean keeps its operand shapes so the result can be re-parameterised. */
export interface BooleanSource {
  op: BooleanOp;
  /** Shape ids, in stacking order. The first operand is the base for subtract. */
  shapes: string[];
  /** Geometry of every operand, captured with the operands' own transforms. */
  operands: Shape[];
  /** Result of the last evaluation. */
  evaluated: Contour[];
  /** Once true the node geometry was edited by hand and operands are stale. */
  detached: boolean;
}
export interface Shape {
  id: string;
  name: string;
  /** Legacy single loop, kept for shapes that were never compound. */
  nodes: Node[];
  closed: boolean;
  /** Every loop of a compound path. Empty for legacy shapes (use `nodes`). */
  contours?: Contour[];
  fill: string;
  stroke: string;
  width: number;
  opacity: number;
  group?: string;
  source?: BooleanSource;
}
export interface Document {
  shapes: Shape[];
  selected: string[];
  tool: string;
  zoom: number;
}
