<script setup lang="ts">
import { RouterView } from 'vue-router'
import AgentPresence from './components/AgentPresence.vue'
import ErrorCards from './components/ErrorCards.vue'
import ReloadPrompt from './components/ReloadPrompt.vue'
</script>

<template>
  <!-- Another workspace is another page: nothing of the one before stays. A view of the same
       workspace is the same page. -->
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="String(route.params.workspace ?? route.params.room ?? route.name)" />
  </RouterView>
  <!-- An agent is connected to the open workspace: the window glows, and leaving asks first. -->
  <AgentPresence />
  <!-- The top right corner, under the bar: what the app has to say by itself, over the page. -->
  <div class="pointer-events-none fixed top-14 right-4 z-50 flex flex-col items-end gap-2 *:pointer-events-auto">
    <ReloadPrompt />
    <ErrorCards />
  </div>
</template>
