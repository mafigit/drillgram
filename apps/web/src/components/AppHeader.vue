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
import { Button } from '@/components/ui/button'
import { THEMES, useTheme } from '../composables/useTheme'
import type { Theme } from '../composables/useTheme'

const { theme, set } = useTheme()
</script>

<template>
  <header class="bg-background flex h-12 shrink-0 items-center gap-3 border-b px-3">
    <img src="/logo.svg" alt="" class="size-6 rounded-md" />
    <!-- On a phone the name gives its room to the breadcrumb and the buttons. -->
    <h1 class="text-sm font-semibold tracking-tight whitespace-nowrap max-sm:sr-only">
      Drillgram
    </h1>
    <span class="text-border max-sm:hidden" aria-hidden="true">/</span>
    <div class="min-w-0 flex-1">
      <slot />
    </div>
    <slot name="actions" />
    <!-- The theme: chosen from a menu, in use at once. Each theme shows its ground and an accent. -->
    <DropdownMenuRoot :modal="false">
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
  </header>
</template>
