<script setup lang="ts">
import { FolderOpenIcon, LoaderCircleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'
import { allowFolder, askingFor, keepInBrowser } from '../lib/folder'

// The workspaces are in a folder (J71), and the browser wants its user's word again before the
// app opens it: a press, which a page cannot make by itself. Nothing is read until then.
const { busy, run } = useBusy()

const allow = () =>
  run(async () => {
    try {
      if (!(await allowFolder())) showError('The browser did not open the folder. Press "Open the folder" and allow it.')
    } catch {
      showError('The browser could not open the folder. It may have been moved or deleted.')
    }
  })
const instead = () => run(() => keepInBrowser())
</script>

<template>
  <Dialog :open="askingFor !== undefined">
    <DialogContent :show-close-button="false" @escape-key-down.prevent @pointer-down-outside.prevent @interact-outside.prevent>
      <DialogHeader>
        <DialogTitle>Open your folder</DialogTitle>
        <DialogDescription class="leading-snug">
          Your diagrams are in the folder {{ askingFor?.name }}. This browser asks once more before Drillgram may open it.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter :aria-busy="busy">
        <Button variant="ghost" :disabled="busy" @click="instead">Keep in this browser instead</Button>
        <Button :disabled="busy" :aria-busy="busy" @click="allow">
          <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
          <FolderOpenIcon v-else aria-hidden="true" />
          Open the folder
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
