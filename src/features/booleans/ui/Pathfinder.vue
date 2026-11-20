<script setup lang="ts">
import { doc } from "../../../shared/document";
import type { BooleanOp } from "../../../shared/types";
import { apply } from "../model/actions";
import { canCombine } from "../model/selection";

const operations: {
  op: BooleanOp;
  label: string;
  sign: string;
  hint: string;
}[] = [
  { op: "union", label: "Union", sign: "∪", hint: "Merge into one outline" },
  {
    op: "intersect",
    label: "Intersect",
    sign: "∩",
    hint: "Keep the shared area",
  },
  {
    op: "subtract",
    label: "Subtract",
    sign: "−",
    hint: "Bottom object minus the shapes above",
  },
  {
    op: "exclude",
    label: "Exclude",
    sign: "⊕",
    hint: "Keep what does not overlap",
  },
];
</script>

<template>
  <section class="layers booleans">
    <h3>
      Pathfinder <span>{{ doc.selected.length }}</span>
    </h3>
    <div class="pathfinder">
      <button
        v-for="o in operations"
        :key="o.op"
        :disabled="!canCombine"
        :title="o.hint"
        :aria-label="o.label"
        :data-testid="'boolean-' + o.op"
        @click="apply(o.op)"
      >
        <b>{{ o.sign }}</b><small>{{ o.label }}</small>
      </button>
    </div>
    <p class="hint" v-if="!canCombine">
      Select two or more closed shapes to combine.
    </p>
  </section>
</template>
