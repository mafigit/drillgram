<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { agentActive, agentCalls, leaving } from '../lib/agentSharing'

// While an MCP client is connected to the open workspace (J7), the whole window says so: a
// glow around its edge, stronger while the agent is at work. And before that workspace is
// left, which ends the agent's connection, a question: leave, or stay.
</script>

<template>
  <template v-if="agentActive">
    <!-- Over the app, under its menus and dialogs. It takes no click. -->
    <div data-testid="agent-glow" class="agent-glow pointer-events-none fixed inset-0 z-40" :class="{ 'is-working': agentCalls > 0 }" aria-hidden="true" />
    <p role="status" class="sr-only">An agent is connected to this workspace and can change it.</p>
  </template>

  <Dialog :open="leaving !== undefined" @update:open="(shown: boolean) => shown || leaving?.answer(false)">
    <!-- Over whatever else is open: the way out of the workspace waits for this answer. -->
    <DialogContent class="z-60 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Leave this workspace?</DialogTitle>
        <DialogDescription>
          An agent is connected to this workspace. Leaving it ends the agent's connection: its token stops working, and you start
          sharing again to connect it anew.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" @click="leaving?.answer(false)">Stay</Button>
        <Button @click="leaving?.answer(true)">Leave and stop sharing</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/* Where the colours begin on their way around the window. */
@property --agent-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

/* A ring at the window's edge and, behind it, the same ring blurred: the glow. Both are a
   gradient of which only the frame shows. */
.agent-glow::before,
.agent-glow::after {
  content: '';
  position: absolute;
  inset: 0;
  padding: 3px;
  background: conic-gradient(from var(--agent-angle), var(--line-purple), var(--line-blue), var(--line-teal), var(--line-pink), var(--line-purple));
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box exclude,
    linear-gradient(#000 0 0);
  animation: agent-turn 8s linear infinite;
}

.agent-glow::after {
  padding: 12px;
  filter: blur(12px);
  opacity: 0.5;
  transition:
    opacity 300ms ease,
    padding 300ms ease;
}

/* The agent is at work: the glow reaches further in. */
.agent-glow.is-working::after {
  padding: 20px;
  opacity: 0.85;
}

@keyframes agent-turn {
  to {
    --agent-angle: 360deg;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-glow::before,
  .agent-glow::after {
    animation: none;
    transition: none;
  }
}
</style>
