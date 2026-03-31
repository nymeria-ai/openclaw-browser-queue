# OpenClaw Browser Queue Plugin

Manages browser access across all OpenClaw sessions with task-level locking queue. Prevents race conditions where multiple sessions (main, sub-agents, cron jobs) fight over the same browser.

## Features

- **Task-level locking** — When a session starts using the browser, it holds the lock for the entire task duration
- **Global scope** — Lock is across ALL sessions (main, sub-agents, cron jobs, everything)
- **Main session priority** — Main session gets inserted at the front of the queue (configurable)
- **Smart timeout** — Activity-based, not fixed duration (long browser tasks are legitimate)
- **Profile/target enforcement** — Enforce specific browser profiles and targets across all sessions
- **Auto-release** — Automatically releases stale locks after inactivity
- **Queue visibility** — See who's using the browser and your position in queue

## Installation

### From npm (when published)

```bash
openclaw plugins install @openclaw/browser-queue
openclaw gateway restart
```

### From local directory (development)

```bash
cd ~/development/openclaw-browser-queue
npm install
npm run build
openclaw plugins install -l ~/development/openclaw-browser-queue
openclaw gateway restart
```

## Configuration

Add to your OpenClaw config (`~/.openclaw/config.json` or via Control UI):

```json
{
  "plugins": {
    "entries": {
      "browser-queue": {
        "enabled": true,
        "config": {
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
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultProfile` | string | `"nymeria"` | Default browser profile to enforce |
| `defaultTarget` | string | `"host"` | Default browser target (`host`, `sandbox`, or `node`) |
| `inactivityTimeoutMs` | number | `300000` | How long without browser activity before checking if session is still active (5 min) |
| `inactivityCheckIntervalMs` | number | `30000` | How often to check for inactivity (30s) |
| `mainSessionPriority` | boolean | `true` | Whether main session gets priority in queue |
| `autoRelease` | boolean | `true` | Auto-release lock after inactivity |
| `autoReleaseAfterMs` | number | `60000` | Auto-release after this many ms of no browser calls (60s) |
| `enforcedProfile` | boolean | `true` | Whether to enforce the default profile on all browser calls |
| `enforcedTarget` | boolean | `true` | Whether to enforce the default target on all browser calls |
| `allowedProfiles` | string[] | `[]` | List of allowed browser profiles (empty = all allowed) |
| `blockedProfiles` | string[] | `[]` | Profiles that are blocked unless explicitly overridden |
| `blockedTargets` | string[] | `[]` | Targets that are blocked unless explicitly overridden |

## Usage

Once installed and configured, the plugin automatically:

1. **Intercepts all browser tool calls** across all sessions
2. **Enforces profile/target policies** — injects defaults, blocks disallowed profiles/targets
3. **Manages queue access** — only one session can use the browser at a time
4. **Auto-releases stale locks** — prevents deadlocks from crashed/stuck sessions

### Agent Tools

The plugin registers two agent tools:

#### `browser_queue_status`

Get current browser queue status:

```
/browser_queue_status
```

Returns:
- Current lock holder (if any)
- Your position in queue (if queued)
- Queue length and waiting sessions
- Config settings

#### `browser_queue_release`

Explicitly release the browser lock:

```
/browser_queue_release
```

Use this when:
- You're done with the browser but haven't timed out yet
- You want to let the next session proceed immediately
- You're debugging queue issues

## How It Works

### Layer 1: Profile/Target Enforcement

Before any browser call executes, the plugin:

1. Checks if a profile is specified
2. If not, injects `defaultProfile` (if `enforcedProfile` is true)
3. Validates against `allowedProfiles` and `blockedProfiles`
4. Same for target (`defaultTarget`, `blockedTargets`)
5. Rejects calls that violate policy with clear error messages

### Layer 2: Task-Level Queue

When a session makes a browser call:

1. **No lock held** → Acquire lock, execute immediately
2. **Lock held by same session** → Execute immediately (same task continues)
3. **Lock held by different session** → Enter queue, return status message:
   ```
   Browser is busy. Current task: [session info]. 
   You are #N in queue. Your request will execute when the browser is free.
   ```

When a session finishes (no browser calls for `autoReleaseAfterMs`):

1. Release lock
2. Pop next from queue
3. Signal waiting session that it can proceed

**Main session priority:** If `mainSessionPriority` is true, main session requests are inserted at position 0 in the queue (but don't preempt the current task).

### Layer 3: Watchdog Monitor

Runs every `inactivityCheckIntervalMs` and:

1. Tracks last browser call timestamp per lock holder
2. If `inactivityTimeoutMs` exceeded → logs warning
3. If `autoRelease` is true and `autoReleaseAfterMs` exceeded → force release + notify queue

## Example Scenarios

### Scenario 1: Main session needs browser while sub-agent is using it

1. Sub-agent acquires lock at 10:00:00
2. Main session tries to use browser at 10:00:30
3. Main session is queued at position #1 (front of queue, due to priority)
4. Sub-agent finishes at 10:01:00
5. Main session automatically proceeds

### Scenario 2: Sub-agent crashes while holding lock

1. Sub-agent acquires lock at 10:00:00
2. Sub-agent crashes at 10:00:15
3. Watchdog checks at 10:00:30, 10:01:00, etc.
4. At 10:01:00 (60s of inactivity), watchdog auto-releases
5. Next session in queue proceeds

### Scenario 3: Profile enforcement blocks a call

1. Session tries to use `profile="openclaw"` 
2. Plugin checks `blockedProfiles` (includes `"openclaw"`)
3. Call is rejected with error:
   ```
   Browser profile "openclaw" is blocked by policy. 
   Blocked profiles: openclaw
   ```

## Development

### Build

```bash
npm install
npm run build
```

### Watch mode

```bash
npm run dev
```

### Testing

After building, test locally:

```bash
openclaw plugins install -l ~/development/openclaw-browser-queue
openclaw gateway restart
openclaw plugins list
```

## Architecture

```
openclaw-browser-queue/
├── src/
│   ├── index.ts       # Plugin entry - registers hooks, tools, services
│   ├── queue.ts       # Queue manager singleton (global lock state)
│   ├── enforcer.ts    # Profile/target enforcement logic
│   ├── watchdog.ts    # Inactivity monitor
│   └── types.ts       # TypeScript interfaces
├── openclaw.plugin.json  # Plugin manifest
├── package.json          # npm package
├── tsconfig.json         # TypeScript config
└── README.md             # This file
```

## Troubleshooting

### Browser calls are blocked unexpectedly

Check your `allowedProfiles` and `blockedProfiles` settings. If `allowedProfiles` is set, only those profiles are allowed.

### Sessions are stuck in queue

Use `browser_queue_status` to see current lock holder. If a session is inactive, wait for auto-release or manually restart the gateway.

### Watchdog not releasing stale locks

Check `autoRelease` is `true` and `autoReleaseAfterMs` is set appropriately. Logs will show watchdog activity.

### Profile enforcement not working

Make sure `enforcedProfile` is `true` and `defaultProfile` is set. Check logs for enforcement messages.

## License

MIT

## Credits

Built for OpenClaw — the AI assistant that lives in your terminal.
