<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { Panel, storeToRefs, useVueFlow, useVueFlowStore } from '@xyflow/vue'
import { KeyboardIcon, MaximizeIcon, MinusIcon, PlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SHORTCUTS } from './shortcuts'
import { FRAME } from '@drillgram/model'
import { CARD } from './geometry'
import { fitPadding, toolbarRoom } from './fit'

const props = defineProps<{
  /**
   * The card that was just added. If it is not fully on screen, the view zooms out to show all,
   * and when even that cannot show it (a phone), the card is brought to the middle. `whole`: many
   * came at once (an example, an import), the last of them asks for all of them to be shown.
   */
  reveal?: { id: string; whole?: boolean }
  /** The card to bring to the middle of the canvas: the one the search went to. */
  centre?: { id: string }
  /** The diagram that is open. When another one opens with cards out of sight, it is fitted. */
  diagram?: string
  /** Room the minimap takes in the top right corner, when it is shown: a card under it is out of sight. */
  corner?: { width: number; height: number }
  /** The open diagram draws a frame around its cards (an opened box): a fit leaves room for it. */
  framed?: boolean
  /** Cards to show big enough to work on, clear of `room` px at the bottom of the canvas (the tour's card on a phone). */
  near?: { ids: string[]; room: number }
}>()

const { zoomIn, zoomOut, fitView, getNode, getNodes, setCenter } = useVueFlow()
const { transform, dimensions, vueFlowRef } = storeToRefs(useVueFlowStore())

/** The whole diagram on the canvas, clear of the title, the toolbar and the minimap (fit.ts). */
function fit() {
  const cards = getNodes.value.map((node) => ({
    x: node.position.x,
    y: node.position.y,
    width: typeof node.width === 'number' ? node.width : CARD.width,
    height: typeof node.height === 'number' ? node.height : CARD.height,
  }))
  return fitView({ padding: fitPadding(cards, dimensions.value, { framed: props.framed, corner: props.corner }), maxZoom: 1 })
}

/**
 * Whether a card is in sight: on the canvas, clear of the toolbar and of the minimap. On a
 * diagram with a frame around its cards, with the room the frame takes beyond them: the frame
 * is no card, and a card at the edge of the screen has its frame cut off.
 */
function inSight(node: { position: { x: number; y: number }; width?: unknown; height?: unknown }): boolean {
  const [x, y, zoom] = transform.value
  const left = node.position.x * zoom + x
  const top = node.position.y * zoom + y
  const right = left + (typeof node.width === 'number' ? node.width : CARD.width) * zoom
  const bottom = top + (typeof node.height === 'number' ? node.height : CARD.height) * zoom
  const room = props.framed ? { side: FRAME.side * zoom, top: FRAME.top * zoom, bottom: FRAME.bottom * zoom } : { side: 0, top: 0, bottom: 0 }
  const { width: canvasWidth, height: canvasHeight } = dimensions.value
  if (left - room.side < 0 || top - room.top < 0 || right + room.side > canvasWidth || bottom + room.bottom > canvasHeight - toolbarRoom(canvasWidth)) return false
  const corner = props.corner
  return !corner || right <= canvasWidth - corner.width || top >= corner.height
}

// The zoom, for what keeps its size on the screen however the diagram is shown (ObjectNode.vue).
watch(
  () => [vueFlowRef.value, transform.value[2]] as const,
  ([root, zoom]) => root?.style.setProperty('--zoom', String(zoom)),
  { immediate: true },
)

/** Brings a card to the middle of the canvas, at the zoom there is. */
function centreOn(node: { position: { x: number; y: number }; width?: unknown; height?: unknown }, duration = 300) {
  const width = typeof node.width === 'number' ? node.width : CARD.width
  const height = typeof node.height === 'number' ? node.height : CARD.height
  return setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: transform.value[2], duration })
}

// What the view is asked to show, one after the other in the order asked: the tour brings cards
// near on the example it has just loaded, after the example was shown whole.
let moves = Promise.resolve()
const then = (move: () => Promise<unknown>) => (moves = moves.then(move, move).then(() => undefined))

watch(
  () => props.reveal,
  (card) => {
    if (!card) return
    void then(async () => {
      await nextTick()
      const node = getNode(card.id)
      if (!node || inSight(node)) return
      await fit()
      // Too big to show whole at the smallest zoom (on a phone): the new card is what is shown.
      if (!card.whole && !inSight(node)) await centreOn(node, 0)
    })
  },
)

watch(
  () => props.near,
  (near) => {
    if (!near) return
    void then(() => fitView({ nodes: near.ids.map((id) => ({ id })), padding: { top: 56, bottom: near.room, left: 24, right: 24 }, maxZoom: 1 }))
  },
)

// The app opens, or comes back after a reload, on a diagram none of whose cards is in sight: a
// phone shows only the top left corner of a diagram at full size. Then all of it is shown.
let opened = false
watch(
  () => getNodes.value.length > 0 && dimensions.value.width > 0,
  async (ready) => {
    if (!ready || opened) return
    opened = true
    await then(async () => {
      await nextTick()
      if (!getNodes.value.some(inSight)) await fit()
    })
  },
  { immediate: true },
)

// Another diagram opens: if a card of it is out of sight (above or left of the screen too, as the
// neighbours of a framed object can be), show the whole of it. Not when a search is on its way
// to one card.
watch(
  () => props.diagram,
  () =>
    void then(async () => {
      await nextTick()
      await nextTick()
      if (toCentre !== undefined) return
      if (getNodes.value.some((node) => !inSight(node))) await fit()
    }),
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
    // The zoom stays as it is: only the place changes.
    await centreOn(node)
  },
)
</script>

<template>
  <!-- On a phone above the toolbar of the canvas, which takes the whole width there. -->
  <Panel position="bottom-right" class="max-sm:mb-20!">
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
