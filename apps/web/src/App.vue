<script setup lang="ts">
import { RouterView } from 'vue-router'
import ErrorCards from './components/ErrorCards.vue'
import ReloadPrompt from './components/ReloadPrompt.vue'
</script>

<template>
  <RouterView />
  <!-- The top right corner, under the bar: what the app has to say by itself, over the page. -->
  <div class="pointer-events-none fixed top-14 right-4 z-50 flex flex-col items-end gap-2 *:pointer-events-auto">
    <ReloadPrompt />
    <ErrorCards />
  </div>
</template>
