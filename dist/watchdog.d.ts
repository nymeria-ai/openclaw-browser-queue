/**
 * Watchdog monitor for browser lock inactivity
 * Automatically releases stale locks
 */
import type { PluginConfig, PluginAPI } from './types';
export declare class BrowserWatchdog {
    private intervalHandle;
    private config;
    private logger;
    constructor(config: PluginConfig, logger: PluginAPI['logger']);
    start(): void;
    stop(): void;
    private checkInactivity;
}
export declare function createWatchdog(config: PluginConfig, logger: PluginAPI['logger']): BrowserWatchdog;
//# sourceMappingURL=watchdog.d.ts.map