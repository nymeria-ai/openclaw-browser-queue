"use strict";
/**
 * Global browser queue manager (singleton)
 * Handles task-level locking across all sessions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserQueue = void 0;
class BrowserQueue {
    lock = null;
    queue = [];
    config = {};
    configure(config) {
        this.config = config;
    }
    /**
     * Try to acquire the browser lock
     * Returns true if acquired immediately, false if queued
     */
    async acquire(sessionId, sessionName, isMainSession) {
        // If lock is not held, acquire immediately
        if (!this.lock) {
            this.lock = {
                sessionId,
                sessionName,
                acquiredAt: Date.now(),
                lastActivity: Date.now(),
            };
            return true;
        }
        // If same session holds the lock, just update activity and continue
        if (this.lock.sessionId === sessionId) {
            this.lock.lastActivity = Date.now();
            return true;
        }
        // Lock held by different session - queue this request
        return new Promise((resolve) => {
            const queueItem = {
                sessionId,
                sessionName,
                waitingSince: Date.now(),
                resolve: () => resolve(true),
            };
            // Main session gets priority (inserted at position 0)
            if (isMainSession && this.config.mainSessionPriority) {
                this.queue.unshift(queueItem);
            }
            else {
                this.queue.push(queueItem);
            }
        });
    }
    /**
     * Update activity timestamp for the current lock holder
     */
    updateActivity(sessionId) {
        if (this.lock && this.lock.sessionId === sessionId) {
            this.lock.lastActivity = Date.now();
        }
    }
    /**
     * Check if a session holds the lock
     */
    hasLock(sessionId) {
        return this.lock?.sessionId === sessionId;
    }
    /**
     * Release the lock for a specific session
     */
    release(sessionId) {
        if (!this.lock || this.lock.sessionId !== sessionId) {
            return;
        }
        this.lock = null;
        this.processQueue();
    }
    /**
     * Force release the lock (for watchdog)
     */
    forceRelease() {
        if (!this.lock) {
            return;
        }
        this.lock = null;
        this.processQueue();
    }
    /**
     * Process the queue and notify the next waiting session
     */
    processQueue() {
        if (this.queue.length === 0) {
            return;
        }
        const next = this.queue.shift();
        if (!next) {
            return;
        }
        // Acquire lock for the next session
        this.lock = {
            sessionId: next.sessionId,
            sessionName: next.sessionName,
            acquiredAt: Date.now(),
            lastActivity: Date.now(),
        };
        // Notify the waiting session
        next.resolve();
    }
    /**
     * Get current queue status
     */
    getStatus() {
        return {
            locked: this.lock !== null,
            holder: this.lock || undefined,
            queue: this.queue.map((item, index) => ({
                sessionId: item.sessionId,
                sessionName: item.sessionName,
                waitingSince: item.waitingSince,
                position: index + 1,
            })),
            config: {
                defaultProfile: this.config.defaultProfile,
                defaultTarget: this.config.defaultTarget,
                autoReleaseAfterMs: this.config.autoReleaseAfterMs,
            },
        };
    }
    /**
     * Get the current lock holder info
     */
    getLockHolder() {
        return this.lock;
    }
    /**
     * Get queue position for a session (0 if not queued)
     */
    getQueuePosition(sessionId) {
        const index = this.queue.findIndex((item) => item.sessionId === sessionId);
        return index === -1 ? 0 : index + 1;
    }
    /**
     * Get inactivity duration in milliseconds
     */
    getInactivityMs() {
        if (!this.lock) {
            return 0;
        }
        return Date.now() - this.lock.lastActivity;
    }
}
// Export singleton instance
exports.browserQueue = new BrowserQueue();
//# sourceMappingURL=queue.js.map