<script setup lang="ts">
import { ref } from 'vue'
import { EraserIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Start over: everything this browser holds of the workspace goes, the change log too. It
// cannot be taken back, so it asks first and says what goes.
defineProps<{
  /** Nothing to clear: no object, no diagram of its own and no change in the log. */
  disabled?: boolean
}>()
const emit = defineEmits<{ clear: [] }>()

const asking = ref(false)

function clear() {
  asking.value = false
  emit('clear')
}
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    aria-label="Clear workspace"
    title="Clear the workspace: start over"
    :disabled="disabled"
    @click="asking = true"
  >
    <EraserIcon aria-hidden="true" />
  </Button>
  <Dialog v-model:open="asking">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Clear the workspace?</DialogTitle>
        <DialogDescription>
          Every diagram, object and connection kept in this browser is deleted, and the change log with
          them. This cannot be undone. Export first what you want to keep.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" @click="asking = false">Cancel</Button>
        <Button variant="destructive" @click="clear">Clear everything</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
