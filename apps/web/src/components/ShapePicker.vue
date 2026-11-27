<script setup lang="ts">
import { computed, ref } from 'vue'
import { ShapesIcon } from '@lucide/vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import type { BoxShape, ElementKind } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { iconUrl } from '../composables/useTechIcons'
import { Input } from '@/components/ui/input'
import { KIND_ICON, SHAPE_LIBRARIES, searchShapes } from './canvas/kinds'
import type { FoundShape } from './canvas/kinds'
import { rememberShape } from './canvas/recentShapes'
import ShapeGlyph from './canvas/ShapeGlyph.vue'
import { useTouch } from '../composables/useTouch'
import { startToolDrag } from '../composables/useToolDrag'

// "Add shape": the shapes of every library, one tab per library, and a search over all of them.
// Every shape goes on every diagram.
const props = defineProps<{
  /** The shapes the open diagram can hold. */
  kinds: ElementKind[]
}>()
const emit = defineEmits<{ pick: [kind: ElementKind, technology?: string, shape?: BoxShape] }>()

const open = ref(false)
// With a finger the search waits for a tap: a keyboard that came by itself would cover the shapes.
const touch = useTouch()
const libraries = computed(() =>
  SHAPE_LIBRARIES.map((library) => ({ ...library, shapes: library.shapes.filter((shape) => props.kinds.includes(shape.kind)) })).filter(
    (library) => library.shapes.length > 0,
  ),
)
/** The tab shown first: the library last picked from, kept in the browser. */
const TAB_KEY = 'drillgram.shapeLibrary'
function storedTab(): string | undefined {
  try {
    return window.localStorage.getItem(TAB_KEY) ?? undefined
  } catch {
    return undefined
  }
}
const chosen = ref(storedTab())
const tab = computed({
  get: () => libraries.value.find((library) => library.name === chosen.value)?.name ?? libraries.value[0]?.name ?? '',
  set: (name: string) => {
    chosen.value = name
    try {
      window.localStorage.setItem(TAB_KEY, name)
    } catch {
      // Private windows may refuse: the first tab is then shown next time.
    }
  },
})

// Searching: with something typed, the tabs give way to what was found, in every library.
const query = ref('')
const found = computed(() => searchShapes(libraries.value, query.value))
const searching = computed(() => query.value.trim() !== '')

function pick(shape: FoundShape) {
  open.value = false
  query.value = ''
  rememberShape(shape)
  emit('pick', shape.kind, shape.technology, shape.shape)
}

/** Enter in the search takes the first shape found. */
function pickFirst() {
  if (found.value[0]) pick(found.value[0])
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <!-- Dragged onto the canvas instead, it puts a plain box where it is let go. -->
      <Button variant="ghost" size="lg" title="Add a shape, or drag a box where it goes" @pointerdown="(event: PointerEvent) => startToolDrag('box', event)">
        <ShapesIcon aria-hidden="true" />
        Add shape
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" class="w-80 p-0" aria-label="Shapes" @open-auto-focus="(event: Event) => touch && event.preventDefault()">
      <div class="border-b p-1.5">
        <Input v-model="query" type="search" aria-label="Search shapes" placeholder="Search shapes" class="h-8" @keydown.enter.prevent="pickFirst" />
      </div>
      <div v-if="searching" role="list" aria-label="Shapes found" class="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1.5">
        <p v-if="found.length === 0" role="status" class="text-muted-foreground px-2 py-3 text-center text-sm">No shape found.</p>
        <button
          v-for="shape in found"
          :key="`${shape.library} ${shape.label}`"
          type="button"
          role="listitem"
          :aria-label="`Add ${shape.label}`"
          class="hover:bg-accent focus-visible:bg-accent flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none"
          @click="pick(shape)"
        >
          <span class="kind-chip grid size-7 shrink-0 place-items-center rounded-md" :style="{ '--kind': `var(--kind-${shape.kind})` }">
            <img v-if="shape.icon" :src="iconUrl(shape.icon)" alt="" class="size-5 rounded-sm bg-white object-contain p-px" />
            <ShapeGlyph v-else-if="shape.shape" :shape="shape.shape" />
            <component :is="KIND_ICON[shape.kind]" v-else class="size-4" aria-hidden="true" />
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="text-sm font-medium">{{ shape.label }}</span>
            <span class="text-muted-foreground truncate text-xs">{{ shape.about }}</span>
          </span>
          <span class="text-muted-foreground ml-auto shrink-0 text-xs">{{ shape.library }}</span>
        </button>
      </div>
      <TabsRoot v-else v-model="tab" class="flex flex-col">
        <TabsList aria-label="Shape libraries" class="flex gap-1 border-b p-1.5">
          <TabsTrigger
            v-for="library in libraries"
            :key="library.name"
            :value="library.name"
            class="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-foreground rounded-md px-2.5 py-1 text-sm font-medium"
          >
            {{ library.name }}
          </TabsTrigger>
        </TabsList>
        <TabsContent v-for="library in libraries" :key="library.name" :value="library.name" class="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1.5">
          <p class="text-muted-foreground px-2 pb-1 text-xs">{{ library.about }}</p>
          <button
            v-for="shape in library.shapes"
            :key="shape.label"
            type="button"
            :aria-label="`Add ${shape.label}`"
            class="hover:bg-accent focus-visible:bg-accent flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none"
            @click="pick({ ...shape, library: library.name })"
          >
            <span class="kind-chip grid size-7 shrink-0 place-items-center rounded-md" :style="{ '--kind': `var(--kind-${shape.kind})` }">
              <!-- A shape with an icon of the library (a language's): shown as it is, on white. -->
              <img v-if="shape.icon" :src="iconUrl(shape.icon)" alt="" class="size-5 rounded-sm bg-white object-contain p-px" />
              <ShapeGlyph v-else-if="shape.shape" :shape="shape.shape" />
              <component :is="KIND_ICON[shape.kind]" v-else class="size-4" aria-hidden="true" />
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="text-sm font-medium">{{ shape.label }}</span>
              <span class="text-muted-foreground truncate text-xs">{{ shape.about }}</span>
            </span>
          </button>
        </TabsContent>
      </TabsRoot>
    </PopoverContent>
  </Popover>
</template>
