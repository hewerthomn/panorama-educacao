<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  useId,
  watch,
} from "vue";
const props = defineProps({
  modelValue: String,
  options: { type: Array, default: () => [] },
  label: String,
  placeholder: { type: String, default: "Digite para pesquisar" },
  disabled: Boolean,
  clearValue: String,
});
const emit = defineEmits(["update:modelValue", "change"]);
const id = useId(),
  root = ref(null),
  input = ref(null),
  open = ref(false),
  query = ref(""),
  active = ref(-1);
const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
const selected = computed(() =>
  props.options.find((o) => o.value === props.modelValue),
);
const filtered = computed(() =>
  props.options.filter((o) =>
    normalize(o.label).includes(normalize(query.value)),
  ),
);
// Touch selection is completed on pointerup, independently of compatibility clicks.
// Keep native scrolling enabled and remember the whole gesture, not just its end.
let gesture = null;
let handledTouch = null;
let lastPointerType = "mouse";
const movementTolerance = 10;
function optionPointerDown(event, option) {
  if (props.disabled || event.isPrimary === false || event.button !== 0) return;
  lastPointerType = event.pointerType || "mouse";
  if (lastPointerType === "mouse") {
    event.preventDefault(); // Preserve the input's focus for desktop clicking.
    return;
  }
  gesture = {
    pointerId: event.pointerId,
    value: option.value,
    x: event.clientX,
    y: event.clientY,
    moved: false,
  };
}
function pointerMove(event) {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  if (
    Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >
    movementTolerance
  ) {
    gesture.moved = true;
  }
}
function scrollDuringGesture(event) {
  const target = event.target;
  if (
    gesture &&
    target instanceof Element &&
    (root.value?.contains(target) || target.contains(root.value))
  ) {
    gesture.moved = true;
  }
}
function pointerEnd(event) {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  pointerMove(event);
  const finished = gesture;
  gesture = null;
  if (event.type === "pointercancel" || finished.moved || !open.value) return;
  // Touch pointers may be implicitly captured: verify the actual release position.
  const releasedOption = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest('[role="option"]');
  if (
    !root.value?.contains(releasedOption) ||
    releasedOption?.dataset.value !== finished.value
  )
    return;
  const option = filtered.value.find(
    (option) => option.value === finished.value,
  );
  if (option) {
    handledTouch = { x: event.clientX, y: event.clientY };
    choose(option, true);
  }
}
function optionClick(event, option) {
  if (!open.value) return;
  // Mouse retains click; touch/pen already handled pointerup (or canceled a scroll).
  // Zero-detail clicks also support activation by assistive technology.
  if (lastPointerType !== "mouse" && event.detail > 0) return;
  choose(option);
}
function compatibilityMouseEvent(event) {
  // Safari can target the field underneath after pointerup removes the menu.
  // Cancel only the residual mouse sequence at this touch position; the next
  // real pointerdown clears the guard, so subsequent mouse/touch actions work.
  if (
    !handledTouch ||
    (event.type === "click" && event.detail === 0 && !event.pointerType)
  )
    return;
  if (
    Math.hypot(event.clientX - handledTouch.x, event.clientY - handledTouch.y) >
    movementTolerance
  )
    return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === "click") handledTouch = null;
}
function outsidePointerDown(event) {
  handledTouch = null;
  if (!root.value?.contains(event.target)) close();
}
onMounted(() => {
  document.addEventListener("pointerdown", outsidePointerDown, true);
  for (const type of ["mousedown", "mouseup", "click"]) {
    document.addEventListener(type, compatibilityMouseEvent, true);
  }
  document.addEventListener("pointermove", pointerMove, { passive: true });
  document.addEventListener("pointerup", pointerEnd);
  document.addEventListener("pointercancel", pointerEnd);
  document.addEventListener("scroll", scrollDuringGesture, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outsidePointerDown, true);
  for (const type of ["mousedown", "mouseup", "click"]) {
    document.removeEventListener(type, compatibilityMouseEvent, true);
  }
  document.removeEventListener("pointermove", pointerMove);
  document.removeEventListener("pointerup", pointerEnd);
  document.removeEventListener("pointercancel", pointerEnd);
  document.removeEventListener("scroll", scrollDuringGesture, true);
});
function begin() {
  if (props.disabled) return;
  lastPointerType = "mouse";
  open.value = true;
  query.value = "";
  active.value = filtered.value.findIndex((o) => o.value === props.modelValue);
}
function close() {
  gesture = null;
  open.value = false;
  query.value = "";
  active.value = -1;
}
function choose(option, touch = false) {
  if (props.disabled) return;
  emit("update:modelValue", option.value);
  emit("change", option.value);
  // End touch interaction without reopening the virtual keyboard or scrolling
  // the drawer. Keep keyboard/mouse focus on the combobox as before.
  if (touch) root.value?.focus({ preventScroll: true });
  else input.value?.focus({ preventScroll: true });
  close();
}
function search(event) {
  query.value = event.target.value;
  open.value = true;
  active.value = filtered.value.length ? 0 : -1;
}
async function move(direction) {
  if (!open.value) begin();
  if (!filtered.value.length) {
    active.value = -1;
    return;
  }
  active.value = Math.max(
    0,
    Math.min(filtered.value.length - 1, active.value + direction),
  );
  await nextTick();
  document
    .getElementById(`${id}-option-${active.value}`)
    ?.scrollIntoView({ block: "nearest" });
}
function keydown(event) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    move(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter" && open.value) {
    event.preventDefault();
    if (filtered.value[active.value]) choose(filtered.value[active.value]);
  } else if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}
function focusout(event) {
  // Safari can blur the input before delivering pointerup to a touched option.
  if (!gesture && !root.value?.contains(event.relatedTarget)) close();
}
watch(
  () => props.options,
  () => {
    gesture = null;
    active.value = -1;
    query.value = "";
  },
);
watch(() => props.disabled, close);
</script>
<template>
  <div
    ref="root"
    class="search-select"
    :class="{ 'is-open': open }"
    tabindex="-1"
    @focusout="focusout"
  >
    <label :for="id">{{ label }}</label>
    <div class="search-select-control">
      <input
        ref="input"
        :id="id"
        role="combobox"
        type="text"
        autocomplete="off"
        :disabled="disabled"
        :value="open ? query : selected?.label || ''"
        :placeholder="placeholder"
        :aria-expanded="open"
        :aria-controls="`${id}-list`"
        aria-autocomplete="list"
        :aria-activedescendant="
          open && active >= 0 ? `${id}-option-${active}` : undefined
        "
        @focus="begin"
        @click="!open && begin()"
        @input="search"
        @keydown="keydown"
      />
      <button
        v-if="clearValue !== undefined && modelValue !== clearValue"
        class="select-clear"
        :aria-label="`Limpar ${label.toLowerCase()}`"
        :disabled="disabled"
        @click="choose({ value: clearValue })"
      >
        ×
      </button>
      <span v-else class="select-chevron" aria-hidden="true">⌄</span>
    </div>
    <div v-if="open" class="search-select-menu">
      <p class="search-hint">{{ placeholder }}</p>
      <ul :id="`${id}-list`" role="listbox" :aria-label="label">
        <li
          v-for="(option, index) in filtered"
          :id="`${id}-option-${index}`"
          :key="option.value"
          role="option"
          :aria-selected="modelValue === option.value"
          :class="{ 'is-active': active === index }"
          :data-value="option.value"
          @pointerdown="optionPointerDown($event, option)"
          @click="optionClick($event, option)"
        >
          {{ option.label
          }}<span v-if="modelValue === option.value" aria-hidden="true">✓</span>
        </li>
      </ul>
      <p v-if="!filtered.length" class="search-empty" role="status">
        Nenhum resultado encontrado.
      </p>
    </div>
  </div>
</template>
