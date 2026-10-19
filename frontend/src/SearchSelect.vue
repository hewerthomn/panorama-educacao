<script setup>
import { computed, nextTick, ref, useId, watch } from "vue";
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
function begin() {
  if (props.disabled) return;
  open.value = true;
  query.value = "";
  active.value = filtered.value.findIndex((o) => o.value === props.modelValue);
}
function close() {
  open.value = false;
  query.value = "";
  active.value = -1;
}
function choose(option) {
  emit("update:modelValue", option.value);
  emit("change", option.value);
  input.value?.focus();
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
  if (!root.value?.contains(event.relatedTarget)) close();
}
watch(
  () => props.options,
  () => {
    active.value = -1;
    query.value = "";
  },
);
watch(() => props.disabled, close);
</script>
<template>
  <div ref="root" class="search-select" @focusout="focusout">
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
          @pointerdown.prevent
          @click="choose(option)"
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
