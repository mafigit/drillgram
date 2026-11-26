<script setup lang="ts">
import { InfoIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

// Where the account is when the app has a server. Without one nobody signs in: this says where
// the diagrams are, and leads to who runs the site and what happens to data (imprint.html,
// privacy.html beside index.html).
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="About this site" title="About this site">
        <InfoIcon aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" aria-label="About this site">
      <PopoverHeader>
        <PopoverTitle>Kept in this browser</PopoverTitle>
        <PopoverDescription class="leading-snug">
          Your diagrams are in this browser, on this device, and nowhere else. Clearing the browser's data for this site deletes them. Export what you want to keep.
        </PopoverDescription>
      </PopoverHeader>
      <!-- Pages of their own, not the app's: plain links. -->
      <nav aria-label="About this site" class="text-muted-foreground flex gap-3 border-t pt-2.5 text-xs">
        <a href="/imprint.html" class="hover:text-foreground underline underline-offset-2">Imprint</a>
        <a href="/privacy.html" class="hover:text-foreground underline underline-offset-2">Privacy</a>
      </nav>
    </PopoverContent>
  </Popover>
</template>
