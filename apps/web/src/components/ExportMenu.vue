<script setup lang="ts">
import { ref } from 'vue'
import { DownloadIcon, FileCodeIcon, FileTextIcon, ImageIcon, LoaderCircleIcon } from '@lucide/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { showError } from '../composables/useErrors'
import { exportDiagram } from '../export/download'
import type { ExportFormat } from '../export/download'
import type { Diagram } from '@drillgram/model'
import type { Scene } from '../export/svg'

// Export: the open diagram as a picture (PNG, SVG) or as text (Mermaid, D2). The press shows at once
// (docs/agents/design.md): the button spins and takes no second press until the file is saved.
const props = defineProps<{
  /** The diagram as it is drawn now; asked for when a format is picked. */
  scene: () => Scene
  /** The diagram as a text format writes it. */
  diagram: () => Diagram
  disabled?: boolean
}>()

const working = ref(false)

async function run(format: ExportFormat) {
  if (working.value) return
  working.value = true
  try {
    await exportDiagram({ scene: props.scene(), diagram: props.diagram() }, format)
  } catch (error) {
    console.warn('The diagram could not be exported:', error)
    const reason = error instanceof Error && error.name === 'DiagramFormatError' ? ` ${error.message}.` : ' Try again.'
    showError(`The ${LABEL[format]} file could not be made.${reason}`)
  } finally {
    working.value = false
  }
}

const FORMATS: { format: ExportFormat; label: string; hint: string; icon: typeof ImageIcon }[] = [
  { format: 'png', label: 'PNG', hint: 'Picture, twice the size', icon: ImageIcon },
  { format: 'svg', label: 'SVG', hint: 'Drawing, sharp at any size', icon: ImageIcon },
  { format: 'mermaid', label: 'Mermaid', hint: 'C4 as text, for Markdown', icon: FileCodeIcon },
  { format: 'd2', label: 'D2', hint: 'Diagram as code', icon: FileTextIcon },
]
const LABEL = Object.fromEntries(FORMATS.map((item) => [item.format, item.label])) as Record<ExportFormat, string>
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Export"
        title="Export the diagram as a picture"
        :disabled="disabled || working"
        :class="{ 'disabled:opacity-100': working }"
        :aria-busy="working"
      >
        <LoaderCircleIcon v-if="working" class="animate-spin" aria-hidden="true" />
        <DownloadIcon v-else aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="4"
        class="bg-popover text-popover-foreground ring-foreground/10 z-50 min-w-56 rounded-lg p-1 text-sm shadow-md ring-1"
      >
        <DropdownMenuItem
          v-for="item in FORMATS"
          :key="item.format"
          class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 outline-none"
          @select="run(item.format)"
        >
          <component :is="item.icon" class="text-muted-foreground size-4" aria-hidden="true" />
          <span class="font-medium">{{ item.label }}</span>
          <span class="text-muted-foreground ml-auto text-xs">{{ item.hint }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
