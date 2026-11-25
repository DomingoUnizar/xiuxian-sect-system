<script setup lang="ts">
import { computed, inject, type Ref } from 'vue';
import { tokenizeRichText } from '../visuals/richText';

const props = withDefaults(
  defineProps<{
    text: string;
    theme?: 'light' | 'dark';
    names?: readonly string[];
  }>(),
  {
    theme: 'light',
  },
);

const injectedNames = inject<Ref<readonly string[]> | null>('richTextNames', null);

const resolvedNames = computed<readonly string[]>(() => {
  if (props.names && props.names.length > 0) return props.names;
  return injectedNames?.value ?? [];
});

const segments = computed(() => tokenizeRichText(props.text, resolvedNames.value));
</script>

<template><span class="rich-text" :class="`rt-theme-${theme}`"><span v-for="(seg, idx) in segments" :key="idx" :class="seg.cls">{{ seg.text }}</span></span></template>
