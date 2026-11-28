<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { CheckIcon, RotateCcwIcon, Trash2Icon, XIcon } from '@lucide/vue'
import type { CommentThread } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { initialOf, pinColour } from './author'

// The card of a comment (J17): a new one being written, or a pin that was pressed, with its
// comments, a reply, and the buttons to resolve and delete it. Without a name to post under it
// asks for one first, in the same form.
const props = defineProps<{
  /** None: a new comment. */
  thread?: CommentThread
  /** The name comments go out under; none: asked for here. */
  author?: string
}>()
const emit = defineEmits<{
  post: [text: string, name?: string]
  reply: [text: string, name?: string]
  resolve: []
  reopen: []
  remove: []
  close: []
}>()

const text = ref('')
const name = ref('')
const asking = computed(() => props.author === undefined)
const ready = computed(() => text.value.trim() !== '' && (!asking.value || name.value.trim() !== ''))
const confirming = ref(false)

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function send() {
  if (!ready.value) return
  const given = asking.value ? name.value : undefined
  if (props.thread) emit('reply', text.value, given)
  else emit('post', text.value, given)
  text.value = ''
}

/** Ctrl or Cmd with Enter posts; Enter alone starts a new line. */
function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    send()
  }
}

const first = ref<HTMLElement>()
onMounted(async () => {
  await nextTick()
  // A new comment is to be written: the first field takes the keys. An open one is to be read.
  if (!props.thread) first.value?.querySelector<HTMLElement>('input, textarea')?.focus()
})
</script>

<template>
  <div role="dialog" aria-label="Comment" class="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 text-sm" @keydown.esc.stop="emit('close')">
    <header class="flex items-center gap-1">
      <h3 class="flex-1 px-1 font-semibold">{{ thread ? (thread.resolved ? 'Resolved comment' : 'Comment') : 'New comment' }}</h3>
      <template v-if="thread">
        <Button v-if="thread.resolved" variant="ghost" size="icon-sm" aria-label="Reopen" title="Reopen: back on the canvas" @click="emit('reopen')">
          <RotateCcwIcon aria-hidden="true" />
        </Button>
        <Button v-else variant="ghost" size="icon-sm" aria-label="Resolve" title="Resolve: off the canvas, into the list of resolved comments" @click="emit('resolve')">
          <CheckIcon aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Delete" title="Delete this comment and its replies" :aria-pressed="confirming" @click="confirming = !confirming">
          <Trash2Icon aria-hidden="true" />
        </Button>
      </template>
      <Button variant="ghost" size="icon-sm" aria-label="Close" title="Close (Esc)" @click="emit('close')">
        <XIcon aria-hidden="true" />
      </Button>
    </header>

    <p v-if="confirming" role="alert" class="bg-destructive/10 flex items-center gap-2 rounded-lg px-2.5 py-2">
      <span class="flex-1">Delete this comment and its replies, for everybody?</span>
      <Button variant="destructive" size="sm" @click="emit('remove')">Yes, delete</Button>
      <Button variant="ghost" size="sm" @click="confirming = false">Cancel</Button>
    </p>

    <ol v-if="thread" class="flex max-h-72 flex-col gap-3 overflow-y-auto px-1" aria-label="Comments of this pin">
      <li v-for="comment in thread.comments" :key="comment.id">
        <article class="flex gap-2">
          <span class="comment-avatar grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold" :style="{ '--colour': `var(--line-${pinColour(comment.author)})` }" aria-hidden="true">
            {{ initialOf(comment.author) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-2">
              <strong class="font-semibold">{{ comment.author }}</strong>
              <time class="text-muted-foreground text-xs" :datetime="comment.at">{{ when.format(new Date(comment.at)) }}</time>
            </p>
            <p class="break-words whitespace-pre-wrap">{{ comment.text }}</p>
          </div>
        </article>
      </li>
    </ol>
    <p v-if="thread?.resolved" class="text-muted-foreground px-1 text-xs">Resolved by {{ thread.resolved.by }}, {{ when.format(new Date(thread.resolved.at)) }}</p>

    <form ref="first" class="flex flex-col gap-2" :aria-label="thread ? 'Reply' : 'New comment'" @submit.prevent="send">
      <label v-if="asking" class="flex flex-col gap-1">
        <span class="text-muted-foreground text-xs">What name goes with your comments? It is kept in this browser.</span>
        <Input v-model="name" aria-label="Your name" placeholder="Your name" maxlength="40" autocomplete="nickname" />
      </label>
      <Textarea
        v-model="text"
        :aria-label="thread ? 'Reply' : 'Comment'"
        :placeholder="thread ? 'Reply' : 'Write a comment'"
        class="max-h-40 min-h-16"
        maxlength="4000"
        @keydown="onKey"
      />
      <div class="flex items-center justify-between gap-2">
        <span class="text-muted-foreground text-xs">Ctrl or Cmd with Enter posts</span>
        <Button type="submit" size="sm" :disabled="!ready">{{ thread ? 'Reply' : 'Post' }}</Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.comment-avatar {
  background: var(--colour);
  color: var(--background);
}
</style>
