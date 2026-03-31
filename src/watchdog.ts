/**
 * Watchdog monitor for browser lock inactivity
 * Automatically releases stale locks
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
    const inactivityTimeoutMs = this.config.inactivityTimeoutMs || 300000;
    const autoReleaseAfterMs = this.config.autoReleaseAfterMs || 60000;

    // Check if we should auto-release
    if (this.config.autoRelease !== false && inactivityMs >= autoReleaseAfterMs) {
      this.logger.warn(
        `[browser-queue] Auto-releasing lock due to inactivity (${inactivityMs}ms). ` +
        `Holder: ${holder.sessionName} (${holder.sessionId})`
      );
      browserQueue.forceRelease();
      return;
    }

    // Check if inactivity exceeds warning threshold
    if (inactivityMs >= inactivityTimeoutMs) {
      this.logger.warn(
        `[browser-queue] Lock holder inactive for ${inactivityMs}ms. ` +
        `Holder: ${holder.sessionName} (${holder.sessionId}). ` +
        `Will auto-release at ${autoReleaseAfterMs}ms if auto-release is enabled.`
      );
    }
  }
}

export function createWatchdog(config: PluginConfig, logger: PluginAPI['logger']): BrowserWatchdog {
  return new BrowserWatchdog(config, logger);
}
