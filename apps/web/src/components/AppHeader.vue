<script setup lang="ts">
import { CheckIcon, MoonIcon, SunIcon } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import AccountMenu from './AccountMenu.vue'
import AboutSite from './AboutSite.vue'
import WorkspaceMenu from './WorkspaceMenu.vue'
import { useSession } from '../composables/useSession'
import { browserOnly } from '../lib/api'
import { THEMES, useTheme } from '../composables/useTheme'
import type { Theme } from '../composables/useTheme'

defineProps<{
  /**
   * The name alone, no menus: for a page that is about to give way to another one (a workspace
   * that is being opened). A menu opened there would close under the hand a moment later.
   */
  plain?: boolean
}>()

const { theme, set } = useTheme()
// The workspaces and the account are for somebody who is signed in.
const { user } = useSession()
const route = useRoute()
</script>

<template>
  <!-- On a phone the buttons of the page take a second row: in one they would run off the screen. -->
  <header class="bg-background flex h-12 shrink-0 items-center gap-3 border-b px-3 max-sm:h-auto max-sm:flex-wrap max-sm:gap-y-1 max-sm:py-1.5">
    <img src="/logo.svg" alt="" class="size-6 rounded-md" />
    <!-- On a phone the name gives its room to the breadcrumb and the buttons. -->
    <h1 class="text-sm font-semibold tracking-tight whitespace-nowrap max-sm:sr-only">
      Drillgram
    </h1>
    <!-- Which workspace is open, where one is. -->
    <template v-if="user && !plain && route.params.workspace">
      <span class="text-border max-lg:hidden" aria-hidden="true">/</span>
      <WorkspaceMenu />
    </template>
    <span v-if="$slots.default" class="text-border max-sm:hidden" aria-hidden="true">/</span>
    <div class="min-w-0 flex-1">
      <slot />
    </div>
    <div v-if="$slots.actions" class="contents max-sm:order-last max-sm:flex max-sm:w-full max-sm:items-center max-sm:justify-between">
      <slot name="actions" />
    </div>
    <!-- The theme: chosen from a menu, in use at once. Each theme shows its ground and an accent. -->
    <DropdownMenuRoot v-if="!plain" :modal="false">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon" aria-label="Theme" title="Theme">
          <SunIcon v-if="THEMES.find((known) => known.id === theme)?.dark" aria-hidden="true" />
          <MoonIcon v-else aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          :side-offset="4"
          class="bg-popover text-popover-foreground ring-foreground/10 z-50 min-w-48 rounded-lg p-1 text-sm shadow-md ring-1"
        >
          <DropdownMenuRadioGroup :model-value="theme" @update:model-value="(chosen) => set(chosen as Theme)">
            <DropdownMenuRadioItem
              v-for="known in THEMES"
              :key="known.id"
              :value="known.id"
              class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 outline-none"
            >
              <span
                class="ring-foreground/20 grid size-4 place-items-center rounded-full ring-1"
                :style="{ background: known.colours[0] }"
                aria-hidden="true"
              >
                <span class="size-1.5 rounded-full" :style="{ background: known.colours[1] }" />
              </span>
              <span class="font-medium">{{ known.name }}</span>
              <DropdownMenuItemIndicator class="ml-auto">
                <CheckIcon class="size-4" aria-hidden="true" />
              </DropdownMenuItemIndicator>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    <template v-if="!plain">
      <!-- Without a server there is no account: where the diagrams are, and who runs the site. -->
      <AboutSite v-if="browserOnly" />
      <AccountMenu v-else />
    </template>
  </header>
</template>
