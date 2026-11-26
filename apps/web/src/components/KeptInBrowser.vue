<script setup lang="ts">
import { HardDriveIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

// Where the account is when the app has a server. Without one nobody signs in: this says where
// the diagrams are, and what that means for whoever wants to keep them.
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="Kept in this browser" title="Kept in this browser">
        <HardDriveIcon aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" aria-label="Kept in this browser">
      <PopoverHeader>
        <PopoverTitle>Kept in this browser</PopoverTitle>
        <PopoverDescription class="leading-snug">
          Your diagrams are in this browser, on this device, and nowhere else. Clearing the browser's data for this site deletes them. Export what you want to keep.
        </PopoverDescription>
      </PopoverHeader>
    </PopoverContent>
  </Popover>
</template>
