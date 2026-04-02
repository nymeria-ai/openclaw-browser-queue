/**
 * Watchdog monitor for browser lock inactivity
 * Automatically releases stale locks and cleans zombie queue entries
 */

import type { PluginConfig, PluginAPI } from './types';
import { browserQueue } from './queue';

export class BrowserWatchdog {
  private intervalHandle: NodeJS.Timeout | null = null;
  private config: PluginConfig;
  private logger: PluginAPI['logger'];

  constructor(config: PluginConfig, logger: PluginAPI['logger']) {
    this.config = config;
    this.logger = logger;
  }

  start(): void {
    const checkIntervalMs = this.config.inactivityCheckIntervalMs || 30000;

    this.logger.info(`[browser-queue] Watchdog starting (check interval: ${checkIntervalMs}ms)`);

    this.intervalHandle = setInterval(() => {
      this.checkInactivity();
      this.cleanZombieQueueEntries();
    }, checkIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info('[browser-queue] Watchdog stopped');
    }
  }

  private checkInactivity(): void {
    const holder = browserQueue.getLockHolder();
    if (!holder) {
      return;
    }

    const inactivityMs = browserQueue.getInactivityMs();
    const autoReleaseAfterMs = this.config.autoReleaseAfterMs || 60000;

    // Log a warning at 75% of auto-release threshold
    const warningThresholdMs = Math.floor(autoReleaseAfterMs * 0.75);
    if (inactivityMs >= warningThresholdMs && inactivityMs < autoReleaseAfterMs) {
      this.logger.warn(
        `[browser-queue] Lock holder approaching auto-release threshold ` +
        `(${Math.floor(inactivityMs / 1000)}s / ${Math.floor(autoReleaseAfterMs / 1000)}s). ` +
        `Holder: ${holder.sessionName} (${holder.sessionId})`
      );
    }

    // Auto-release if enabled and threshold exceeded
    if (this.config.autoRelease !== false && inactivityMs >= autoReleaseAfterMs) {
      this.logger.warn(
        `[browser-queue] Auto-releasing lock due to inactivity (${Math.floor(inactivityMs / 1000)}s). ` +
        `Holder: ${holder.sessionName} (${holder.sessionId})`
      );
      browserQueue.forceRelease();
    }
  }

  /**
   * Clean up queue entries for sessions that have been waiting too long
   * without making any browser calls. These are likely dead/crashed sessions.
   */
  private cleanZombieQueueEntries(): void {
    const maxQueueWaitMs = this.config.inactivityTimeoutMs || 300000;
    const queuedIds = browserQueue.getQueuedSessionIds();
    const now = Date.now();

    for (const sessionId of queuedIds) {
      const status = browserQueue.getStatus();
      const entry = status.queue.find((q) => q.sessionId === sessionId);
      if (!entry) continue;

      const waitingMs = now - entry.waitingSince;
      if (waitingMs >= maxQueueWaitMs) {
        this.logger.warn(
          `[browser-queue] Removing zombie queue entry: ${entry.sessionName} ` +
          `(${sessionId}), waiting for ${Math.floor(waitingMs / 1000)}s`
        );
        browserQueue.removeFromQueue(sessionId);
      }
    }
  }
}

export function createWatchdog(config: PluginConfig, logger: PluginAPI['logger']): BrowserWatchdog {
  return new BrowserWatchdog(config, logger);
}
