"use strict";
/**
 * Watchdog monitor for browser lock inactivity
 * Automatically releases stale locks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserWatchdog = void 0;
exports.createWatchdog = createWatchdog;
const queue_1 = require("./queue");
class BrowserWatchdog {
    intervalHandle = null;
    config;
    logger;
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    start() {
        const checkIntervalMs = this.config.inactivityCheckIntervalMs || 30000;
        this.logger.info(`[browser-queue] Watchdog starting (check interval: ${checkIntervalMs}ms)`);
        this.intervalHandle = setInterval(() => {
            this.checkInactivity();
        }, checkIntervalMs);
    }
    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            this.logger.info('[browser-queue] Watchdog stopped');
        }
    }
    checkInactivity() {
        const holder = queue_1.browserQueue.getLockHolder();
        if (!holder) {
            return;
        }
        const inactivityMs = queue_1.browserQueue.getInactivityMs();
        const inactivityTimeoutMs = this.config.inactivityTimeoutMs || 300000;
        const autoReleaseAfterMs = this.config.autoReleaseAfterMs || 60000;
        // Check if we should auto-release
        if (this.config.autoRelease !== false && inactivityMs >= autoReleaseAfterMs) {
            this.logger.warn(`[browser-queue] Auto-releasing lock due to inactivity (${inactivityMs}ms). ` +
                `Holder: ${holder.sessionName} (${holder.sessionId})`);
            queue_1.browserQueue.forceRelease();
            return;
        }
        // Check if inactivity exceeds warning threshold
        if (inactivityMs >= inactivityTimeoutMs) {
            this.logger.warn(`[browser-queue] Lock holder inactive for ${inactivityMs}ms. ` +
                `Holder: ${holder.sessionName} (${holder.sessionId}). ` +
                `Will auto-release at ${autoReleaseAfterMs}ms if auto-release is enabled.`);
        }
    }
}
exports.BrowserWatchdog = BrowserWatchdog;
function createWatchdog(config, logger) {
    return new BrowserWatchdog(config, logger);
}
//# sourceMappingURL=watchdog.js.map