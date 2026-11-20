<template>
  <template v-if="activeBoolean">
    <h4>PATHFINDER</h4>
    <p class="source-state" :class="{ stale: activeBoolean.source!.detached }">
      {{
        activeBoolean.source!.detached
          ? "Edited by hand · outline no longer matches its operands"
          : "Live outline · operands kept for adjustment"
      }}
    </p>
    <div class="op-switch" role="group" aria-label="Boolean operation">
      <button
        v-for="o in operations"
        :key="o.op"
        :class="{ active: activeBoolean.source!.op === o.op }"
        :data-testid="'source-op-' + o.op"
        @click="changeOp(activeBoolean!, o.op)"
      >
        {{ o.label }}
      </button>
    </div>
    <ul class="operands">
      <li
        v-for="(operand, index) in activeBoolean.source!.operands"
        :key="index"
      >
        <span>{{ index + 1 }}. {{ operandName(operand, index) }}</span>
        <span class="operand-tools">
          <button
            :disabled="index === 0"
            title="Move earlier"
            :data-testid="'operand-up-' + index"
            @click="moveOperand(activeBoolean!, index, -1)"
          >
            ↑
          </button>
          <button
            :disabled="index === activeBoolean.source!.operands.length - 1"
            title="Move later"
            :data-testid="'operand-down-' + index"
            @click="moveOperand(activeBoolean!, index, 1)"
          >
            ↓
          </button>
          <button
            :disabled="activeBoolean.source!.operands.length < 3"
            title="Remove operand"
            :data-testid="'operand-remove-' + index"
            @click="dropOperand(activeBoolean!, index)"
          >
            ×
          </button>
        </span>
      </li>
    </ul>
    <button
      class="expand"
      data-testid="expand-boolean"
      @click="expandBoolean(activeBoolean!)"
    >
      Expand to outlines
    </button>
    <p class="hint" v-if="activeBoolean.source!.detached">
      Editing, re-ordering or re-applying an operation rebuilds the outline from
      the saved operands and discards hand edits.
    </p>
    <p class="hint" v-else>
      Expand keeps the exact boundary and removes the link to these operands.
    </p>
  </template>
</template>

<script setup lang="ts">
import type { BooleanOp, Shape } from "../../../shared/types";
import { activeBoolean } from "../model/selection";
import {
  changeOp,
  dropOperand,
  expandBoolean,
  moveOperand,
} from "../model/actions";

const operations: { op: BooleanOp; label: string }[] = [
  { op: "union", label: "Union" },
  { op: "intersect", label: "Intersect" },
  { op: "subtract", label: "Subtract" },
  { op: "exclude", label: "Exclude" },
];

function operandName(shape: Shape, index: number) {
  return shape.name && shape.name.trim() ? shape.name : `Object ${index + 1}`;
}
</script>
