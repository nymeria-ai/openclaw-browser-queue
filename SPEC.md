# OpenClaw Browser Queue Plugin — Full Specification

## Overview
An OpenClaw plugin that manages browser access across all sessions with a task-level locking queue. Prevents race conditions where multiple sessions fight over the same browser.

## Key Design Decisions
1. **Task-level locking** — not per-command. When a session starts using the browser, it holds the lock for the entire task duration (many browser calls in sequence)
2. **Global scope** — the lock is across ALL sessions (main, sub-agents, cron jobs, everything)
3. **Main session priority** — main session gets inserted at the front of the queue, but doesn't preempt a running task
4. **Smart timeout** — activity-based, not fixed duration (long browser tasks are legitimate)
5. **Agent-agnostic** — browser type and profile name come from config, no hardcoded values

## Plugin Config Schema
```json
{
  "defaultProfile": "nymeria",
  "defaultTarget": "host",
  "inactivityTimeoutMs": 300000,
  "inactivityCheckIntervalMs": 30000,
  "mainSessionPriority": true,
  "autoRelease": true,
  "autoReleaseAfterMs": 60000,
  "enforcedProfile": true,
  "enforcedTarget": true,
  "allowedProfiles": ["nymeria"],
  "blockedProfiles": ["openclaw"],
  "blockedTargets": ["sandbox"]
}
```

- `defaultProfile`: Default browser profile to enforce (string)
- `defaultTarget`: Default browser target - "host" | "sandbox" | "node" (string)
- `inactivityTimeoutMs`: How long without browser activity before asking session if still active (default: 5 min)
- `inactivityCheckIntervalMs`: How often to check for inactivity (default: 30s)
- `mainSessionPriority`: Whether main session gets priority in queue (default: true)
- `autoRelease`: Auto-release lock after inactivity (default: true)
- `autoReleaseAfterMs`: Auto-release after this many ms of no browser calls (default: 60s)
- `enforcedProfile`: Whether to enforce the default profile on all browser calls (default: true)
- `enforcedTarget`: Whether to enforce the default target on all browser calls (default: true)
- `allowedProfiles`: List of allowed browser profiles (empty = all allowed)
- `blockedProfiles`: Profiles that are blocked unless explicitly overridden
- `blockedTargets`: Targets that are blocked unless explicitly overridden

## Architecture

### Layer 1: Profile/Target Enforcement
- Intercepts all browser tool calls before execution
- If `enforcedProfile` is true and no explicit profile was specified → inject `defaultProfile`
- If a blocked profile is used without explicit override → reject with clear error message
- If a blocked target is used without explicit override → reject with clear error message
- The "explicit override" is detected when the agent prompt contains specific instruction to use a different profile

### Layer 2: Task-Level Queue Manager
- Global singleton queue (shared across all sessions)
- When a session makes a browser call:
  1. If no lock held → acquire lock, execute immediately
  2. If lock held by same session → execute immediately (same task continues)
  3. If lock held by different session → enter queue, return status message:
     `"Browser is busy. Current task: [session info]. You are #N in queue. Your request will execute when the browser is free."`
- When a session finishes (no browser calls for `autoReleaseAfterMs`):
  1. Release lock
  2. Pop next from queue
  3. Signal waiting session that it can proceed
- Main session priority: if `mainSessionPriority` is true, main session requests are inserted at position 0 in the queue (but don't preempt current task)

### Layer 3: Watchdog Monitor
- Runs every `inactivityCheckIntervalMs`
- Tracks last browser call timestamp per lock holder
- If `inactivityTimeoutMs` exceeded:
  1. Log warning
  2. Check if the holding session is still alive
  3. If session is dead → force release + notify queue
  4. If session is alive but inactive → auto-release if `autoRelease` is true
- Provides status via a registered tool `browser_queue_status`

## Tools to Register

### `browser_queue_status`
Returns current queue state:
```json
{
  "locked": true,
  "holder": { "sessionId": "xxx", "sessionName": "Agentic Marketing", "acquiredAt": "...", "lastActivity": "..." },
  "queue": [
    { "sessionId": "yyy", "sessionName": "Sub-agent: Clay", "waitingSince": "...", "position": 1 }
  ],
  "config": { "defaultProfile": "nymeria", "autoReleaseAfterMs": 60000 }
}
```

### `browser_queue_release`
Explicitly release the browser lock (for the calling session).

## Implementation Details

### How to intercept browser calls
The plugin should wrap/intercept the browser tool. When a browser tool call comes in:
1. Check profile/target enforcement (Layer 1)
2. Check queue/lock (Layer 2)
3. If allowed → pass through to actual browser tool
4. If queued → return queued status message instead of executing

### Session identification
Use whatever session identifier OpenClaw provides via the tool execution context (session key, run ID, etc.)

### Concurrency
Use a simple in-memory mutex/lock. No need for external state since the plugin runs in-process with the Gateway.

### Queue data structure
Simple array with push/unshift (for priority) and shift (for dequeue).

## File Structure
```
openclaw-browser-queue/
├── openclaw.plugin.json     # Plugin manifest
├── package.json             # npm package
├── tsconfig.json            # TypeScript config
├── src/
│   ├── index.ts             # Plugin entry - register hooks, tools, services
│   ├── queue.ts             # Queue manager singleton
│   ├── enforcer.ts          # Profile/target enforcement logic
│   ├── watchdog.ts          # Inactivity monitor
│   └── types.ts             # TypeScript interfaces
├── README.md                # Documentation
└── LICENSE                  # MIT
```

## Notes
- This plugin is agent-agnostic. No hardcoded profile names, browser types, or agent-specific logic.
- All configuration is via the plugin config schema.
- The plugin should be distributable via npm.
- Use TypeScript with strict mode.
- Target: Node.js 22+, ESM compatible.

## Reference: OpenClaw Plugin API
The plugin registers via:
```ts
export function register(api: any) {
  // api.registerTool(...) — register tools
  // api.registerService(...) — register background service (watchdog)
  // api.on('...', handler) — listen to events
  // api.getConfig() — get plugin config
  // api.logger — logging
}
```

## Reference: Existing plugin example
See /Users/diegomalamute/development/openclaw-wa-archive/ for structure reference.
See /opt/homebrew/lib/node_modules/openclaw/docs/tools/plugin.md for full API docs.
See /opt/homebrew/lib/node_modules/openclaw/docs/plugins/agent-tools.md for tool registration.
See /opt/homebrew/lib/node_modules/openclaw/docs/plugins/manifest.md for manifest format.
