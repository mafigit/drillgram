<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLinkIcon, FileCodeIcon, FileTextIcon, FileUpIcon, LoaderCircleIcon, StickyNoteIcon, UploadIcon } from '@lucide/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { d2Format, mermaidFormat, miroPastedDiagram, readMiroBoard } from '@drillgram/model'
import { parseDiagramText } from '../lib/pastedKind'
import type { Diagram, DiagramFormat } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// Import: a diagram written as text (Mermaid's C4 diagram, or D2 as the export writes it), pasted
// or opened from a file, goes onto the open diagram. The editor places it (`bring`), which may take
// a moment: the button spins meanwhile (docs/agents/design.md).
const props = defineProps<{
  /** Put the diagram on the open one; throws with a reason in words when it does not fit. */
  bring: (diagram: Diagram) => Promise<void>
  disabled?: boolean
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

// Miro (J67): items copied on a board and pasted here, or a whole board read by the browser through
// Miro's REST API with the user's token. The token is used for this import only: it is kept
// nowhere, not even in this dialog once it closes.
const miro = ref(false)
const pasted = ref<{ diagram: Diagram; summary: string }>()
const board = ref('')
const token = ref('')
const byLink = ref(false)

function startMiro() {
  miro.value = true
  pasted.value = undefined
  board.value = ''
  token.value = ''
  byLink.value = false
  problem.value = undefined
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A paste brings what Miro put on the clipboard as HTML; the field itself stays empty. */
function pasteFromMiro(event: ClipboardEvent) {
  event.preventDefault()
  problem.value = undefined
  pasted.value = undefined
  try {
    const diagram = miroPastedDiagram(event.clipboardData?.getData('text/html') ?? '')
    const boxes = count(diagram.elements.length, 'box', 'boxes')
    pasted.value = { diagram, summary: `${boxes} and ${count(diagram.relationships.length, 'connection', 'connections')} from Miro` }
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
  }
}

const canBringBoard = computed(() => pasted.value !== undefined || (board.value.trim() !== '' && token.value.trim() !== ''))

async function bringBoard() {
  if (working.value || !canBringBoard.value) return
  problem.value = undefined
  working.value = true
  try {
    await props.bring(pasted.value?.diagram ?? (await readMiroBoard(board.value, token.value)))
    miro.value = false
    token.value = ''
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
  } finally {
    working.value = false
  }
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
      <Button variant="ghost" size="icon" aria-label="Import" title="Import a diagram written as text" :disabled="disabled">
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
        <DropdownMenuItem
          class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 outline-none"
          @select="startMiro"
        >
          <StickyNoteIcon class="text-muted-foreground size-4" aria-hidden="true" />
          <span class="font-medium">Miro</span>
          <span class="text-muted-foreground ml-auto text-xs">Copied items, or a board</span>
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

  <Dialog :open="miro" @update:open="(open: boolean) => !open && !working && ((miro = false), (token = ''))">
    <DialogContent v-if="miro" class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Import from Miro</DialogTitle>
        <DialogDescription>
          Frames become boxes with what stands in them inside, sticky notes, shapes, texts and cards become boxes, connectors
          connections. It is added to the open diagram; Undo takes it back.
        </DialogDescription>
      </DialogHeader>
      <form class="grid gap-3" @submit.prevent="bringBoard">
        <Textarea
          aria-label="Miro items"
          :model-value="pasted?.summary ?? ''"
          readonly
          rows="3"
          placeholder="Select items on a Miro board, copy them (Cmd or Ctrl and C) and paste them here."
          class="resize-none"
          :aria-invalid="problem !== undefined && !byLink"
          @paste="pasteFromMiro"
        />
        <details class="text-sm" :open="byLink" @toggle="byLink = ($event.target as HTMLDetailsElement).open">
          <summary class="text-muted-foreground hover:text-foreground cursor-pointer">Or read a whole board, with an access token</summary>
          <div class="mt-3 grid gap-3">
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Board link
              <Input
                v-model="board"
                inputmode="url"
                placeholder="https://miro.com/app/board/…"
                autocomplete="off"
                class="h-9"
                :aria-invalid="problem !== undefined && byLink"
                @input="(problem = undefined), (pasted = undefined)"
              />
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Access token
              <Input
                v-model="token"
                type="password"
                autocomplete="off"
                class="h-9"
                :aria-invalid="problem !== undefined && byLink"
                @input="(problem = undefined), (pasted = undefined)"
              />
            </label>
            <div class="text-muted-foreground">
              <p>A token is made in Miro once, where Miro lets you make apps:</p>
              <ol class="mt-1 ml-5 list-decimal space-y-1">
                <li>
                  Open
                  <a class="text-foreground underline" href="https://miro.com/app/settings/user-profile/apps" target="_blank" rel="noopener noreferrer">
                    Your apps</a
                  >
                  and create a new app.
                </li>
                <li>Allow it <code>boards:read</code> only.</li>
                <li>Install it to the team of the board and copy the access token it shows.</li>
              </ol>
              <p class="mt-1">
                The browser asks Miro itself; Drillgram keeps the token nowhere.
                <a
                  class="text-foreground inline-flex items-center gap-1 underline"
                  href="https://developers.miro.com/docs/rest-api-build-your-first-hello-world-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Miro's guide<ExternalLinkIcon class="size-3" aria-hidden="true"
                /></a>
              </p>
            </div>
          </div>
        </details>
        <p v-if="problem" role="alert" class="text-destructive text-sm">{{ problem }}</p>
        <DialogFooter>
          <Button
            type="submit"
            :disabled="!canBringBoard || working"
            :class="{ 'disabled:opacity-100': working }"
            :aria-busy="working"
          >
            <LoaderCircleIcon v-if="working" class="animate-spin" aria-hidden="true" />
            Import from Miro
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
