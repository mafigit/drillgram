<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckIcon, ChevronsUpDownIcon, FileDownIcon, FileUpIcon, LayersIcon, LoaderCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { WorkspaceFileError } from '@drillgram/model'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'
import { useWorkspaces } from '../composables/useWorkspaces'
import { save } from '../export/download'
import { failureText } from '../lib/api'

// The workspaces of the user: which one is open, the way to another, and what an owner does
// with the open one (a new one, another name, away with it).
const route = useRoute()
const router = useRouter()
const { workspaces, load, create, rename, remove, fileOf, fromFile } = useWorkspaces()
const { busy, run } = useBusy()

const openId = computed(() => String(route.params.workspace ?? ''))
const open = computed(() => workspaces.value.find((known) => known.id === openId.value))

onMounted(async () => {
  try {
    await load()
  } catch {
    // The page under the menu says that the server does not answer.
  }
})

/** The dialog that is asking, if one is. */
const asking = ref<'new' | 'rename' | 'delete'>()
const name = ref('')

function ask(what: 'new' | 'rename' | 'delete') {
  name.value = what === 'rename' ? (open.value?.name ?? '') : ''
  asking.value = what
}

/** One piece of work of a dialog: the dialog closes when it is done, and stays with the reason when not. */
const act = (work: () => Promise<void>) =>
  run(async () => {
    try {
      await work()
      asking.value = undefined
    } catch (failure) {
      showError(failureText(failure))
    }
  })

const make = () =>
  act(async () => {
    const made = await create(name.value)
    // Made: the dialog has done its work. The way there may ask a question of its own (an
    // agent is connected to the workspace that is left, J7), and asks it alone.
    asking.value = undefined
    await router.push(`/w/${made.id}`)
  })
const giveName = () => act(() => rename(openId.value, name.value))
const takeAway = () =>
  act(async () => {
    await remove(openId.value)
    // On to another one, or to the page that offers to make one.
    await router.replace('/')
  })

// A workspace as a file (J64): to keep a copy, and to have it in another browser. The open
// one is saved; a file becomes a workspace of its own, beside those that are there.
const exportFile = () =>
  run(async () => {
    try {
      const file = await fileOf(openId.value)
      save(new Blob([file.text], { type: 'application/json' }), file.name)
    } catch (failure) {
      showError(failureText(failure))
    }
  })

/** A file larger than any workspace: not read at all. */
const MAX_FILE = 200_000_000
const picker = ref<HTMLInputElement>()
function importFile() {
  const file = picker.value?.files?.[0]
  // The same file can be chosen again: the field forgets it.
  if (picker.value) picker.value.value = ''
  if (!file) return
  void run(async () => {
    try {
      if (file.size > MAX_FILE) throw new WorkspaceFileError('This file is too large to be a workspace of Drillgram.')
      const made = await fromFile(await file.text())
      await router.push(`/w/${made.id}`)
    } catch (failure) {
      showError(failure instanceof WorkspaceFileError ? failure.message : failureText(failure))
    }
  })
}
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger as-child>
      <!-- The bar is short of room on a tablet and a phone: there the button is its sign alone,
           and the name is for those who do not see the sign. -->
      <!-- Busy while a file is written or read: a press on a menu entry ends in something seen. -->
      <Button
        variant="ghost"
        size="sm"
        class="max-w-48 min-w-0 shrink max-lg:px-1.5"
        :aria-label="`Workspace: ${open?.name ?? 'none'}`"
        :title="`Workspace: ${open?.name ?? 'none'}`"
        :aria-busy="busy && asking === undefined"
      >
        <LoaderCircleIcon v-if="busy && asking === undefined" class="animate-spin" aria-hidden="true" />
        <LayersIcon v-else class="lg:hidden" aria-hidden="true" />
        <span class="truncate max-lg:sr-only">{{ open?.name ?? 'Workspace' }}</span>
        <ChevronsUpDownIcon class="text-muted-foreground max-lg:hidden" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="start"
        :side-offset="4"
        class="bg-popover text-popover-foreground ring-foreground/10 z-50 max-h-[70vh] min-w-56 overflow-auto rounded-lg p-1 text-sm shadow-md ring-1"
      >
        <DropdownMenuRadioGroup :model-value="openId" @update:model-value="(id) => router.push(`/w/${id}`)">
          <DropdownMenuRadioItem
            v-for="known in workspaces"
            :key="known.id"
            :value="known.id"
            class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none"
          >
            <span class="min-w-0 flex-1 truncate font-medium">{{ known.name }}</span>
            <DropdownMenuItemIndicator>
              <CheckIcon class="size-4" aria-hidden="true" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator class="bg-border -mx-1 my-1 h-px" />
        <DropdownMenuItem class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none" @select="ask('new')">
          <PlusIcon class="size-4" aria-hidden="true" />
          New workspace
        </DropdownMenuItem>
        <DropdownMenuItem
          class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none"
          title="Open a workspace that was saved as a file, as a workspace of its own"
          @select="picker?.click()"
        >
          <FileUpIcon class="size-4" aria-hidden="true" />
          Import workspace
        </DropdownMenuItem>
        <DropdownMenuItem
          v-if="open"
          class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none"
          title="Save this workspace as a file, with its history: to keep it, or to open it in another browser"
          @select="exportFile"
        >
          <FileDownIcon class="size-4" aria-hidden="true" />
          Export workspace
        </DropdownMenuItem>
        <!-- Only its owner changes a workspace. -->
        <template v-if="open?.role === 'owner'">
          <DropdownMenuItem class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none" @select="ask('rename')">
            <PencilIcon class="size-4" aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem class="data-highlighted:bg-accent text-destructive flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none" @select="ask('delete')">
            <Trash2Icon class="size-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>

  <!-- The file a workspace is made from: the menu's entry opens it, the menu itself is gone by then. -->
  <input ref="picker" type="file" accept=".json,application/json" aria-label="Workspace file" class="sr-only" tabindex="-1" @change="importFile" />

  <Dialog :open="asking === 'new' || asking === 'rename'" @update:open="(shown) => shown || (asking = undefined)">
    <DialogContent class="sm:max-w-md">
      <form class="contents" :aria-busy="busy" @submit.prevent="asking === 'new' ? make() : giveName()">
        <DialogHeader>
          <DialogTitle>{{ asking === 'rename' ? 'Rename the workspace' : 'New workspace' }}</DialogTitle>
          <DialogDescription>{{ asking === 'rename' ? 'Its diagrams stay as they are.' : 'It starts empty, with diagrams of its own.' }}</DialogDescription>
        </DialogHeader>
        <Input v-model="name" aria-label="Title" placeholder="Title" autocomplete="off" required maxlength="200" autofocus class="h-9" />
        <DialogFooter>
          <Button type="button" variant="ghost" @click="asking = undefined">Cancel</Button>
          <Button type="submit" :disabled="busy || name.trim() === ''" :aria-busy="busy">
            <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
            {{ asking === 'rename' ? 'Rename' : 'Create' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <Dialog :open="asking === 'delete'" @update:open="(shown) => shown || (asking = undefined)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Delete the workspace?</DialogTitle>
        <DialogDescription>
          "{{ open?.name }}" goes with every diagram, object and connection in it, and its change log, for everybody it is shared
          with. This cannot be undone. Export first what you want to keep.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" @click="asking = undefined">Cancel</Button>
        <Button variant="destructive" :disabled="busy" :aria-busy="busy" @click="takeAway">
          <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
          Delete workspace
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
