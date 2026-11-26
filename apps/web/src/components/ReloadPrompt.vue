<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { Button } from '@/components/ui/button'

// User-confirmed updates (registerType: 'prompt'): a silent reload could lose diagram edits.
const { needRefresh, updateServiceWorker } = useRegisterSW()

function close() {
  needRefresh.value = false
}
</script>

<template>
  <div
    v-if="needRefresh"
    role="alert"
    class="bg-popover text-popover-foreground flex items-center gap-2 rounded-xl border py-1.5 pr-1.5 pl-3 text-sm shadow-lg"
  >
    <span>New version available</span>
    <Button size="sm" @click="updateServiceWorker(true)">Reload</Button>
    <Button size="sm" variant="ghost" @click="close">Close</Button>
  </div>
</template>
