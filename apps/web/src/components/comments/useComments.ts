import { computed, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { threadPlace } from '@drillgram/model'
import type { CommentThread, Point, View, Workspace } from '@drillgram/model'
import type { Sharing } from '../../collab/sharing'
import { keepName, keptName } from '../../collab/name'
import type { WorkspaceStore } from '../../composables/useWorkspaceStore'
import { useSession } from '../../composables/useSession'
import { browserOnly } from '../../lib/api'
import { commentAuthor } from './author'

// Comments on the open diagram (J17): pins placed with "Comment", a card for the one that is
// open, and the list in "Comments". They go to the workspace's log through the store, also while
// the workspace is locked: the diagram is looked at, and talked about.

/** A comment being written where it was placed, before it is posted. */
export type Draft = { at: Point; card?: { object: string; offset: Point } }

/** What is open: a pin's thread, or a new one; `screen`: where its pin is, for the card beside it. */
export type Opened = { screen: Point } & ({ thread: string } | { draft: Draft })

export interface Comments {
  /** The name comments go out under; none: it is asked for with the first one. */
  author: ComputedRef<string | undefined>
  /** "Comment" was pressed: the next click on the canvas places one. */
  placing: { value: boolean }
  opened: { value: Opened | undefined }
  /** The diagram's open threads, each where its pin is now. */
  pins: ComputedRef<(CommentThread & { place: Point })[]>
  resolved: ComputedRef<CommentThread[]>
  openThread: ComputedRef<CommentThread | undefined>
  /** Places a new comment there, on a card or not, and opens it to be written. */
  place(at: Point, screen: Point, card?: string): void
  /** Posts the open draft; `name`: the one asked for, kept for the next time. */
  post(text: string, name?: string): void
  reply(thread: string, text: string, name?: string): void
  resolve(thread: string): void
  reopen(thread: string): void
  remove(thread: string): void
}

export function useComments(store: WorkspaceStore, workspace: ComputedRef<Workspace>, view: ComputedRef<View>, sharing?: Sharing): Comments {
  const kept = ref(keptName())
  const { user } = useSession()
  const author = computed(() =>
    commentAuthor({
      session: sharing?.state.value === 'on' ? sharing.people.value.find((person) => person.id === sharing.you.value)?.name : undefined,
      user: browserOnly ? undefined : (user.value?.name ?? undefined),
      kept: kept.value,
    }),
  )
  const placing = ref(false)
  const opened = ref<Opened>()
  // "Share" may have kept a name since: read it again for every comment that is opened.
  watch(opened, (now) => {
    if (now) kept.value = keptName()
  })

  const here = computed(() => store.comments.value.filter((thread) => thread.view === view.value.id))
  const pins = computed(() => here.value.filter((thread) => !thread.resolved).map((thread) => ({ ...thread, place: threadPlace(thread, workspace.value) })))
  const resolved = computed(() => here.value.filter((thread) => thread.resolved))
  const openThread = computed(() => {
    const now = opened.value
    return now && 'thread' in now ? here.value.find((thread) => thread.id === now.thread) : undefined
  })

  /** The name to post under: the one just given is kept for good. */
  const who = (name?: string) => {
    if (name !== undefined && name.trim() !== '') kept.value = keepName(name)
    return author.value ?? 'Guest'
  }

  return {
    author,
    placing,
    opened,
    pins,
    resolved,
    openThread,
    place(at, screen, card) {
      placing.value = false
      const position = card === undefined ? undefined : view.value.positions[card]
      const on = card !== undefined && position ? { object: card, offset: { x: at.x - position.x, y: at.y - position.y } } : undefined
      opened.value = { screen, draft: { at, ...(on && { card: on }) } }
    },
    post(text, name) {
      const now = opened.value
      if (!now || !('draft' in now) || text.trim() === '') return
      const { at, card } = now.draft
      store.comment({ type: 'started', thread: crypto.randomUUID(), comment: crypto.randomUUID(), view: view.value.id, at, ...(card && { card }), author: who(name), text })
      opened.value = undefined
    },
    reply(thread, text, name) {
      if (text.trim() === '') return
      store.comment({ type: 'replied', thread, comment: crypto.randomUUID(), author: who(name), text })
    },
    resolve(thread) {
      store.comment({ type: 'resolved', thread, author: who() })
      opened.value = undefined
    },
    reopen(thread) {
      store.comment({ type: 'reopened', thread })
    },
    remove(thread) {
      store.comment({ type: 'deleted', thread })
      opened.value = undefined
    },
  }
}
