<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { LoaderCircleIcon, PlugIcon } from '@lucide/vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'
import { connectAgent } from '../lib/agentConnection'
import type { AgentConnection } from '../lib/agentConnection'
import type { AgentTool } from '../lib/agentProtocol'

const props = defineProps<{ runTool: (tool: AgentTool, signal: AbortSignal) => Promise<Record<string, unknown>> }>()
const open = ref(false)
const connection = shallowRef<AgentConnection>()
const { busy, run } = useBusy()
let sharing: AbortController | undefined

const clients = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'claudeCode', label: 'Claude Code' },
] as const

const tokenPrompt = [
  "printf 'Drillgram bearer token: '",
  'IFS= read -rs DRILLGRAM_MCP_TOKEN',
  "printf '\\n'",
  'export DRILLGRAM_MCP_TOKEN',
].join('\n')

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

const commands = computed(() => {
  const url = connection.value?.url ?? ''
  const claudeConfig = JSON.stringify({
    type: 'http',
    url,
    headers: { Authorization: 'Bearer ${DRILLGRAM_MCP_TOKEN}' },
  })
  return [
    { client: 'codex', add: 'codex mcp add drillgram --url ' + shellQuote(url) + ' --bearer-token-env-var DRILLGRAM_MCP_TOKEN', run: 'codex' },
    { client: 'claudeCode', add: 'claude mcp add-json --scope local drillgram ' + shellQuote(claudeConfig), run: 'claude' },
  ]
})

function start() {
  void run(async () => {
    const attempt = new AbortController()
    sharing = attempt
    try {
      connection.value = await connectAgent(props.runTool, (reason) => {
        if (sharing !== attempt) return
        stop()
        if (reason !== 'Sharing expired') showError('Agent sharing disconnected. Start sharing again to reconnect.')
      }, attempt.signal)
    } catch {
      if (sharing !== attempt) return
      stop()
      showError('Could not start agent sharing. Check your connection and try again.')
    }
  })
}

function stop() {
  const current = sharing
  sharing = undefined
  current?.abort()
  connection.value = undefined
}

onBeforeUnmount(stop)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="connection ? 'Agent sharing active' : 'Connect agent'"
        :title="connection ? 'Agent sharing active' : 'Connect agent'"
        :class="{ 'bg-accent': connection }"
      >
        <PlugIcon aria-hidden="true" />
      </Button>
    </DialogTrigger>
    <DialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" :aria-busy="busy">
      <DialogHeader>
        <DialogTitle>Connect agent</DialogTitle>
        <DialogDescription>
          Let your MCP client read and edit this workspace through Cloudflare. It can delete boxes and
          move through the undo history. Sharing lasts up to one hour or until this workspace closes.
        </DialogDescription>
      </DialogHeader>
      <template v-if="connection">
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          MCP URL
          <Input :model-value="connection.url" readonly spellcheck="false" @focus="(event: FocusEvent) => (event.target as HTMLInputElement).select()" />
        </label>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Bearer token
          <Input :model-value="connection.token" readonly spellcheck="false" autocomplete="off" @focus="(event: FocusEvent) => (event.target as HTMLInputElement).select()" />
        </label>
        <section class="min-w-0 space-y-2 border-t pt-3">
          <h3 class="font-semibold">How to connect</h3>
          <TabsRoot default-value="claude">
            <TabsList aria-label="MCP clients" class="flex gap-1 border-b pb-1">
              <TabsTrigger
                v-for="client in clients"
                :key="client.id"
                :value="client.id"
                class="text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground focus-visible:ring-ring rounded-md px-2.5 py-1 font-medium focus-visible:ring-2"
              >
                {{ client.label }}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="claude" class="space-y-2 pt-3">
              <p>Use the deployed HTTPS URL for Claude on the web or desktop.</p>
              <ol class="list-decimal space-y-1 pl-5">
                <li>In <strong>Customize → Connectors</strong>, select <strong>Add custom connector</strong>.</li>
                <li>Name it Drillgram and paste the MCP URL above.</li>
                <li>Choose <strong>No sign-in</strong> and open <strong>Request headers</strong>.</li>
                <li>Add <code>Authorization</code> with <code>Bearer</code>, a space, and the token above.</li>
                <li>Save the connector and turn it on in your chat.</li>
              </ol>
              <p class="text-muted-foreground">If Request headers is missing, use the Claude Code tab.</p>
            </TabsContent>
            <TabsContent v-for="command in commands" :key="command.client" :value="command.client" class="space-y-2 pt-3">
              <p>In Bash or Zsh, run this block and paste the token when prompted. Use the same terminal for the next block.</p>
              <pre class="bg-muted whitespace-pre-wrap wrap-anywhere rounded-md p-2.5 text-xs"><code>{{ tokenPrompt }}</code></pre>
              <p>Add Drillgram once. Run the last line to start the client with the current token.</p>
              <pre class="bg-muted whitespace-pre-wrap wrap-anywhere rounded-md p-2.5 text-xs"><code>{{ command.add + '\n' + command.run }}</code></pre>
              <p>Type <code>/mcp</code> in the client to check the connection.</p>
            </TabsContent>
          </TabsRoot>
        </section>
      </template>
      <DialogFooter>
        <Button v-if="connection" variant="outline" @click="stop">Stop sharing</Button>
        <Button v-else :disabled="busy" :aria-busy="busy" @click="start">
          <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
          Start sharing
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
