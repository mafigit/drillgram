<script setup lang="ts">
import { computed } from 'vue'
import { RotateCcwIcon } from '@lucide/vue'
import type { CommentThread } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { initialOf, pinColour } from './author'
import type { Comments } from './useComments'

// "Comments" in the top bar (J17): the comments of the open diagram. The open ones lead to their
// pin; the resolved ones are only here, and can be reopened.
const props = defineProps<{ comments: Comments }>()

const open = computed(() => props.comments.pins.value)
const resolved = computed(() => props.comments.resolved.value)

const replies = (thread: CommentThread) => {
  const count = thread.comments.length - 1
  return count === 0 ? '' : count === 1 ? '1 reply' : `${count} replies`
}

/** Opens a thread beside its pin, or in the middle of the screen when the pin is out of sight. */
function show(thread: CommentThread) {
  const pin = document.querySelector(`[data-thread="${CSS.escape(thread.id)}"]`)?.getBoundingClientRect()
  const inSight = pin && pin.right > 0 && pin.bottom > 0 && pin.left < window.innerWidth && pin.top < window.innerHeight
  const screen = inSight ? { x: pin.right, y: pin.top } : { x: window.innerWidth / 2 - 180, y: window.innerHeight / 3 }
  props.comments.opened.value = { thread: thread.id, screen }
}
</script>

<template>
  <aside aria-label="Comments" class="bg-popover/90 flex w-72 flex-col gap-3 rounded-2xl border p-3 text-sm shadow-lg backdrop-blur">
    <h2 class="font-semibold">Comments</h2>
    <p v-if="open.length === 0 && resolved.length === 0" class="text-muted-foreground">
      None on this diagram yet. Press "Comment" below, then click where it goes.
    </p>
    <section v-if="open.length > 0" class="flex flex-col gap-1">
      <h3 class="text-muted-foreground text-xs font-medium">Open</h3>
      <ul aria-label="Open comments" class="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        <li v-for="thread in open" :key="thread.id">
          <button type="button" class="hover:bg-accent flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left" @click="show(thread)">
            <span class="comment-avatar mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold" :style="{ '--colour': `var(--line-${pinColour(thread.comments[0]!.author)})` }" aria-hidden="true">
              {{ initialOf(thread.comments[0]!.author) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="line-clamp-2 break-words">{{ thread.comments[0]!.text }}</span>
              <span class="text-muted-foreground text-xs">{{ thread.comments[0]!.author }}<template v-if="replies(thread)"> · {{ replies(thread) }}</template></span>
            </span>
          </button>
        </li>
      </ul>
    </section>
    <section v-if="resolved.length > 0" class="flex flex-col gap-1">
      <h3 class="text-muted-foreground text-xs font-medium">Resolved</h3>
      <ul aria-label="Resolved comments" class="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        <li v-for="thread in resolved" :key="thread.id" class="flex items-start gap-2 rounded-lg px-1.5 py-1">
          <span class="min-w-0 flex-1">
            <span class="text-muted-foreground line-clamp-2 break-words line-through decoration-1">{{ thread.comments[0]!.text }}</span>
            <span class="text-muted-foreground text-xs">Resolved by {{ thread.resolved!.by }}</span>
          </span>
          <Button variant="ghost" size="sm" title="Back on the canvas" @click="comments.reopen(thread.id)">
            <RotateCcwIcon aria-hidden="true" />
            Reopen
          </Button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.comment-avatar {
  background: var(--colour);
  color: var(--background);
}
</style>
