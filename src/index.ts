/**
 * OpenClaw Browser Queue Plugin
 * Manages browser access across all sessions with task-level locking queue
 */

import type { PluginAPI, PluginConfig, BrowserToolParams, ToolContext, ToolExecutionResult } from './types';
import { browserQueue } from './queue';
import { ProfileEnforcer } from './enforcer';
import { createWatchdog } from './watchdog';

// Store original browser tool for delegation
let originalBrowserTool: any = null;
let enforcer: ProfileEnforcer | null = null;

/**
 * Main plugin registration function
 */
export function register(api: PluginAPI) {
  const config: PluginConfig = api.getConfig?.() || {};

  // Apply defaults
  const finalConfig: PluginConfig = {
    defaultProfile: config.defaultProfile || 'default',
    defaultTarget: config.defaultTarget || 'host',
    inactivityTimeoutMs: config.inactivityTimeoutMs || 300000,
    inactivityCheckIntervalMs: config.inactivityCheckIntervalMs || 30000,
    mainSessionPriority: config.mainSessionPriority !== false,
    autoRelease: config.autoRelease !== false,
    autoReleaseAfterMs: config.autoReleaseAfterMs || 60000,
    enforcedProfile: config.enforcedProfile !== false,
    enforcedTarget: config.enforcedTarget !== false,
    allowedProfiles: config.allowedProfiles || [],
    blockedProfiles: config.blockedProfiles || [],
    blockedTargets: config.blockedTargets || [],
  };

  // Initialize queue with config
  browserQueue.configure(finalConfig);

  // Initialize enforcer
  enforcer = new ProfileEnforcer(finalConfig);

  api.logger.info('[browser-queue] Plugin loaded with config:', finalConfig);

  // Register browser_queue_status tool
  api.registerTool({
    name: 'browser_queue_status',
    description: 'Get current browser queue status (lock holder, queue position, config)',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async execute(_id: string, _params: any, context?: ToolContext) {
      const status = browserQueue.getStatus();
      const currentSession = context?.sessionId || 'unknown';
      
      let message = '**Browser Queue Status**\n\n';
      
      if (status.locked && status.holder) {
        message += `🔒 **Locked** by ${status.holder.sessionName} (${status.holder.sessionId})\n`;
        message += `   Acquired: ${new Date(status.holder.acquiredAt).toISOString()}\n`;
        message += `   Last Activity: ${new Date(status.holder.lastActivity).toISOString()}\n`;
        message += `   Inactive for: ${Math.floor((Date.now() - status.holder.lastActivity) / 1000)}s\n\n`;
        
        if (status.holder.sessionId === currentSession) {
          message += '✅ You currently hold the browser lock.\n\n';
        }
      } else {
        message += '🔓 **Unlocked** - Browser is available\n\n';
      }

      if (status.queue.length > 0) {
        message += `📋 **Queue** (${status.queue.length} waiting):\n`;
        status.queue.forEach((entry) => {
          const waitTime = Math.floor((Date.now() - entry.waitingSince) / 1000);
          message += `   ${entry.position}. ${entry.sessionName} - waiting ${waitTime}s\n`;
          if (entry.sessionId === currentSession) {
            message += `      ← You are here\n`;
          }
        });
        message += '\n';
      }

      message += `**Config:**\n`;
      message += `- Default Profile: ${status.config.defaultProfile || 'none'}\n`;
      message += `- Default Target: ${status.config.defaultTarget || 'none'}\n`;
      message += `- Auto-release after: ${status.config.autoReleaseAfterMs}ms\n`;

      return {
        content: [{ type: 'text', text: message }],
      };
    },
  });

  // Register browser_queue_release tool
  api.registerTool({
    name: 'browser_queue_release',
    description: 'Explicitly release the browser lock (for the calling session)',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async execute(_id: string, _params: any, context?: ToolContext) {
      const sessionId = context?.sessionId || 'unknown';
      const sessionName = context?.sessionName || 'Unknown Session';

      if (!browserQueue.hasLock(sessionId)) {
        return {
          content: [
            {
              type: 'text',
              text: `⚠️ You don't currently hold the browser lock. Nothing to release.`,
            },
          ],
        };
      }

      browserQueue.release(sessionId);
      api.logger.info(`[browser-queue] Lock released by ${sessionName} (${sessionId})`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Browser lock released. Next session in queue (if any) can now proceed.`,
          },
        ],
      };
    },
  });

  // Start watchdog service
  const watchdog = createWatchdog(finalConfig, api.logger);
  api.registerService({
    id: 'browser-queue-watchdog',
    start: () => watchdog.start(),
    stop: () => watchdog.stop(),
  });

  // Hook into browser tool calls (if api.registerHook is available)
  // This intercepts browser calls to enforce queue and profile/target policies
  if (api.registerHook) {
    api.registerHook(
      'tool:before',
      async (toolName: string, params: any, context?: ToolContext) => {
        // Only intercept browser tool
        if (toolName !== 'browser') {
          return { params }; // Pass through
        }

        const sessionId = context?.sessionId || 'unknown';
        const sessionName = context?.sessionName || 'Unknown Session';
        const isMainSession = sessionId.includes('main') || sessionName.toLowerCase().includes('main');

        api.logger.debug(`[browser-queue] Browser call from ${sessionName} (${sessionId})`);

        // Layer 1: Profile/Target Enforcement
        try {
          const enforcedParams = enforcer!.enforce(params as BrowserToolParams);
          params = enforcedParams;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          api.logger.warn(`[browser-queue] Blocked browser call: ${errorMsg}`);
          throw new Error(errorMsg);
        }

        // Layer 2: Queue Management
        const acquired = await browserQueue.acquire(sessionId, sessionName, isMainSession);

        if (!acquired) {
          // This session is now queued - the promise will resolve when it's their turn
          const position = browserQueue.getQueuePosition(sessionId);
          const holder = browserQueue.getLockHolder();
          const queueMsg =
            `🔒 Browser is busy. Current task: ${holder?.sessionName || 'unknown'}. ` +
            `You are #${position} in queue. Your request will execute when the browser is free.`;

          api.logger.info(`[browser-queue] ${sessionName} queued at position ${position}`);
          
          // Return a special response that indicates queuing
          throw new Error(queueMsg);
        }

        // Lock acquired - update activity and pass through
        browserQueue.updateActivity(sessionId);
        return { params };
      },
      {
        name: 'browser-queue:enforce',
        description: 'Enforce browser queue and profile/target policies',
      }
    );
  } else {
    api.logger.warn('[browser-queue] api.registerHook not available - browser interception disabled');
  }

  api.logger.info('[browser-queue] Plugin registered successfully');
}
