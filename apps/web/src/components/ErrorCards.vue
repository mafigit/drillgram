<script setup lang="ts">
import { CircleAlertIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useErrors } from '../composables/useErrors'

// What went wrong, on cards in the top right corner (App.vue places them): each says it in
// words, goes by itself after a while and has a button to close it sooner. `role="alert"` reads
// it out at once.
const { errors, dismiss } = useErrors()
</script>

<template>
  <TransitionGroup name="error-card" tag="ul" aria-label="Errors" class="flex flex-col items-end gap-2">
    <li
      v-for="error in errors"
      :key="error.id"
      role="alert"
      data-testid="error-card"
      class="error-card bg-popover text-popover-foreground flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-xl border py-2.5 pr-1.5 pl-3 text-sm shadow-lg"
    >
      <CircleAlertIcon class="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p class="min-w-0 flex-1 leading-snug">{{ error.text }}</p>
      <Button variant="ghost" size="icon-xs" class="text-muted-foreground -mt-0.5 shrink-0" aria-label="Close" title="Close" @click="dismiss(error.id)">
        <XIcon aria-hidden="true" />
      </Button>
    </li>
  </TransitionGroup>
</template>

<style scoped>
/* A red edge on the left says "error" before the words are read. */
.error-card {
  border-left: 3px solid var(--destructive);
}

/* It slides in from the right and fades out; without motion it only appears and goes. */
.error-card-enter-active,
.error-card-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.error-card-enter-from,
.error-card-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (prefers-reduced-motion: reduce) {
  .error-card-enter-active,
  .error-card-leave-active {
    transition: none;
  }
}
</style>
