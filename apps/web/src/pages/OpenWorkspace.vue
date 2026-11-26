<script setup lang="ts">
import DiagramEditor from '../components/DiagramEditor.vue'
import { provideWorkspaceStore } from '../composables/useWorkspaceStore'
import type { WorkspaceStore } from '../composables/useWorkspaceStore'

// The editor on a workspace that is open: everything below changes it through this store.
const props = defineProps<{ store: WorkspaceStore; viewId?: string }>()
provideWorkspaceStore(props.store)
</script>

<template>
  <DiagramEditor :view-id="viewId" />
</template>
