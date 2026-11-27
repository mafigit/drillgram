<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FolderOpenIcon, InfoIcon, LoaderCircleIcon, MonitorIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'
import { useWorkspaces } from '../composables/useWorkspaces'
import { canKeepInFolder, chooseFolder, keepInBrowser, keptIn } from '../lib/folder'

// Where the account is when the app has a server. Without one nobody signs in: this says where
// the diagrams are (the browser, or a folder: J71), and leads to who runs the site and what
// happens to data (imprint.html, privacy.html beside index.html).
const route = useRoute()
const router = useRouter()
const { opened } = useWorkspaces()
const { busy, run } = useBusy()
const offerFolder = canKeepInFolder()
const open = computed(() => (route.params.workspace === undefined ? undefined : String(route.params.workspace)))

const keepInFolder = () =>
  run(async () => {
    try {
      const there = await chooseFolder(open.value)
      if (there) opened(there)
      // Another place, other workspaces: the app opens them anew.
      await router.replace('/')
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return
      showError('Drillgram could not keep your diagrams in that folder. Choose another one, or try again.')
    }
  })

const backToBrowser = () =>
  run(async () => {
    try {
      await keepInBrowser()
      await router.replace('/')
    } catch {
      showError('This browser could not open its own storage. Reload the app and try again.')
    }
  })
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="About this site" title="About this site">
        <InfoIcon aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" aria-label="About this site" :aria-busy="busy">
      <PopoverHeader v-if="keptIn">
        <PopoverTitle>Kept in the folder {{ keptIn.name }}</PopoverTitle>
        <PopoverDescription class="leading-snug">
          Each workspace is a file in this folder on your device. Changes made to the files elsewhere, by git or a sync tool, show here within seconds.
        </PopoverDescription>
      </PopoverHeader>
      <PopoverHeader v-else>
        <PopoverTitle>Kept in this browser</PopoverTitle>
        <PopoverDescription class="leading-snug">
          This browser stores your diagrams on this device. Clearing the browser's data for this site deletes them. Export what you want to keep: the workspace menu saves a workspace as a file, which another browser opens.
        </PopoverDescription>
      </PopoverHeader>
      <Button v-if="keptIn" variant="outline" size="sm" class="self-start" :disabled="busy" :aria-busy="busy" @click="backToBrowser">
        <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
        <MonitorIcon v-else aria-hidden="true" />
        Keep in this browser instead
      </Button>
      <Button
        v-else-if="offerFolder"
        variant="outline"
        size="sm"
        class="self-start"
        title="Keep every workspace as a file in a folder you choose, also for git or a sync tool"
        :disabled="busy"
        :aria-busy="busy"
        @click="keepInFolder"
      >
        <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
        <FolderOpenIcon v-else aria-hidden="true" />
        Keep in a folder
      </Button>
      <!-- Pages of their own, not the app's: plain links. -->
      <nav aria-label="About this site" class="text-muted-foreground flex gap-3 border-t pt-2.5 text-xs">
        <a href="/imprint.html" class="hover:text-foreground underline underline-offset-2">Imprint</a>
        <a href="/privacy.html" class="hover:text-foreground underline underline-offset-2">Privacy</a>
      </nav>
    </PopoverContent>
  </Popover>
</template>
