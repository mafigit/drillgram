<script setup lang="ts">
import { ref } from 'vue'
import { FileCodeIcon, FileTextIcon, FileUpIcon, LoaderCircleIcon, UploadIcon } from '@lucide/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { d2Format, mermaidFormat } from '@drillgram/model'
import { parseDiagramText } from '../lib/pastedKind'
import type { Diagram, DiagramFormat } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

// Import: a diagram written as text (Mermaid's C4 diagram, or D2 as the export writes it), pasted
// or opened from a file, goes onto the open diagram. The editor places it (`bring`), which may take
// a moment: the button spins meanwhile (docs/agents/design.md).
const props = defineProps<{
  /** Put the diagram on the open one; throws with a reason in words when it does not fit. */
  bring: (diagram: Diagram) => Promise<void>
}>()

const FORMATS: { format: DiagramFormat; hint: string; accept: string; icon: typeof FileCodeIcon; example: string }[] = [
  {
    format: mermaidFormat,
    hint: 'A C4 diagram or a flowchart',
    accept: '.mmd,.mermaid,.md,.txt',
    icon: FileCodeIcon,
    example: 'C4Context\n  Person(customer, "Customer")\n  System(shop, "Online Shop")\n  Rel(customer, shop, "Places orders in")',
  },
  {
    format: d2Format,
    hint: 'As the D2 export writes it',
    accept: '.d2,.txt',
    icon: FileTextIcon,
    example: 'vars: {\n  c4-level: context\n}\n"customer": "Customer\\n[Person]" {\n}',
  },
]

const chosen = ref<(typeof FORMATS)[number]>()
const text = ref('')
const problem = ref<string>()
const working = ref(false)

function start(item: (typeof FORMATS)[number]) {
  chosen.value = item
  text.value = ''
  problem.value = undefined
}

async function openFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) text.value = await file.text()
}

async function bring() {
  const item = chosen.value
  if (!item || working.value) return
  problem.value = undefined
  let diagram: Diagram
  try {
    diagram = parseDiagramText(item.format.id, text.value)
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
    return
  }
  working.value = true
  try {
    await props.bring(diagram)
    chosen.value = undefined
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
  } finally {
    working.value = false
  }
}
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="Import" title="Import a diagram written as text">
        <UploadIcon aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="4"
        class="bg-popover text-popover-foreground ring-foreground/10 z-50 min-w-64 rounded-lg p-1 text-sm shadow-md ring-1"
      >
        <DropdownMenuItem
          v-for="item in FORMATS"
          :key="item.format.id"
          class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 outline-none"
          @select="start(item)"
        >
          <component :is="item.icon" class="text-muted-foreground size-4" aria-hidden="true" />
          <span class="font-medium">{{ item.format.name }}</span>
          <span class="text-muted-foreground ml-auto text-xs">{{ item.hint }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>

  <Dialog :open="chosen !== undefined" @update:open="(open: boolean) => !open && !working && (chosen = undefined)">
    <DialogContent v-if="chosen" class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Import {{ chosen.format.name }}</DialogTitle>
        <DialogDescription>
          Paste the diagram or open a file. It is added to the open diagram, beside what is there; Undo takes it back.
        </DialogDescription>
      </DialogHeader>
      <!-- The box grows with its text up to half the window, then the text scrolls in it: the
           button under it stays on screen however long the diagram is. -->
      <form class="grid gap-3" @submit.prevent="bring">
        <Textarea
          v-model="text"
          :aria-label="chosen.format.name"
          :placeholder="chosen.example"
          rows="12"
          class="max-h-[50vh] overflow-y-auto font-mono text-xs"
          :aria-invalid="problem !== undefined"
          @input="problem = undefined"
        />
        <p v-if="problem" role="alert" class="text-destructive text-sm">{{ problem }}</p>
        <DialogFooter class="items-center sm:justify-between">
          <label class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-sm">
            <FileUpIcon class="size-4" aria-hidden="true" />
            Open a file
            <input type="file" class="sr-only" :accept="chosen.accept" @change="openFile" />
          </label>
          <Button
            type="submit"
            :disabled="text.trim() === '' || working"
            :class="{ 'disabled:opacity-100': working }"
            :aria-busy="working"
          >
            <LoaderCircleIcon v-if="working" class="animate-spin" aria-hidden="true" />
            Import diagram
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
