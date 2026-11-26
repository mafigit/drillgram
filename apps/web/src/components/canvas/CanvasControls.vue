<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { Panel, storeToRefs, useVueFlow, useVueFlowStore } from '@xyflow/vue'
import { KeyboardIcon, MaximizeIcon, MinusIcon, PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SHORTCUTS } from './shortcuts'
import { CARD } from './geometry'

const props = defineProps<{
  /** The card that was just added. If it is not fully on screen, the view zooms out to show all. */
  reveal?: { id: string }
  /** The card to bring to the middle of the canvas: the one the search went to. */
  centre?: { id: string }
  /** The diagram that is open. When another one opens with cards out of sight, it is fitted. */
  diagram?: string
  /** Room the minimap takes in the top right corner, when it is shown: a card under it is out of sight. */
  corner?: { width: number; height: number }
}>()

/** Room the floating toolbar takes at the bottom of the canvas. */
const TOOLBAR_HEIGHT = 80

const { zoomIn, zoomOut, fitView, getNode, getNodes, setCenter } = useVueFlow()
const { transform, dimensions } = storeToRefs(useVueFlowStore())

const fit = () => fitView({ padding: 0.15, maxZoom: 1 })

/** Whether a box of the screen is in sight: on the canvas, clear of the toolbar and of the minimap. */
function inSight(left: number, top: number, width: number, height: number): boolean {
  const { width: canvasWidth, height: canvasHeight } = dimensions.value
  if (left < 0 || top < 0 || left + width > canvasWidth || top + height > canvasHeight - TOOLBAR_HEIGHT) return false
  const corner = props.corner
  return !corner || left + width <= canvasWidth - corner.width || top >= corner.height
}

watch(
  () => props.reveal,
  async (card) => {
    if (!card) return
    await nextTick()
    const node = getNode(card.id)
    if (!node) return
    const [x, y, zoom] = transform.value
    const left = node.position.x * zoom + x
    const top = node.position.y * zoom + y
    const width = (typeof node.width === 'number' ? node.width : CARD.width) * zoom
    const height = (typeof node.height === 'number' ? node.height : CARD.height) * zoom
    if (!inSight(left, top, width, height)) fit()
  },
)

// Another diagram opens: if a card of it is out of sight (above or left of the screen too, as the
// neighbours of a framed object can be), show the whole of it. Not when a search is on its way
// to one card.
watch(
  () => props.diagram,
  async () => {
    await nextTick()
    await nextTick()
    if (toCentre !== undefined) return
    const [x, y, zoom] = transform.value
    const hidden = getNodes.value.some((node) => {
      const left = node.position.x * zoom + x
      const top = node.position.y * zoom + y
      const width = (typeof node.width === 'number' ? node.width : CARD.width) * zoom
      const height = (typeof node.height === 'number' ? node.height : CARD.height) * zoom
      return !inSight(left, top, width, height)
    })
    if (hidden) fit()
  },
)

// The card may not be drawn yet (the search opened another diagram): wait until it is.
let toCentre: string | undefined
watch(
  () => props.centre,
  (card) => (toCentre = card?.id),
)
watch(
  () => [props.centre, props.centre && getNode(props.centre.id)] as const,
  async ([, node]) => {
    if (!node || toCentre !== node.id) return
    toCentre = undefined
    await nextTick()
    const width = node.width ?? CARD.width
    const height = node.height ?? CARD.height
    // The zoom stays as it is: only the place changes.
    setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: transform.value[2], duration: 300 })
  },
)
</script>

<template>
  <Panel position="bottom-right">
    <div class="bg-popover/90 flex items-center gap-0.5 rounded-xl border p-1 shadow-lg backdrop-blur">
      <Button variant="ghost" size="icon" aria-label="Zoom out" @click="zoomOut()">
        <MinusIcon aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Zoom in" @click="zoomIn()">
        <PlusIcon aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Fit to screen" @click="fit()">
        <MaximizeIcon aria-hidden="true" />
      </Button>
      <span class="bg-border mx-0.5 h-5 w-px" aria-hidden="true" />
      <!-- The legend of the keys. -->
      <Popover>
        <PopoverTrigger as-child>
          <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
            <KeyboardIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" class="w-72 p-3">
          <p class="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">Keyboard shortcuts</p>
          <ul aria-label="Keyboard shortcuts" class="flex flex-col gap-1.5 text-sm">
            <li v-for="shortcut in SHORTCUTS" :key="shortcut.what" class="flex items-center justify-between gap-3">
              <span>{{ shortcut.what }}</span>
              <span class="flex shrink-0 items-center gap-1">
                <kbd
                  v-for="key in shortcut.keys"
                  :key="key"
                  class="bg-muted text-muted-foreground rounded-md border px-1.5 py-0.5 font-sans text-[11px] font-medium"
                >
                  {{ key }}
                </kbd>
              </span>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  </Panel>
</template>
