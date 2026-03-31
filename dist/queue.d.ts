/**
 * Global browser queue manager (singleton)
 * Handles task-level locking across all sessions
 */
import type { LockHolder, QueueStatus, PluginConfig } from './types';
declare class BrowserQueue {
    private lock;
    private queue;
    private config;
    configure(config: PluginConfig): void;
    /**
     * Try to acquire the browser lock
     * Returns true if acquired immediately, false if queued
     */
    acquire(sessionId: string, sessionName: string, isMainSession: boolean): Promise<boolean>;
    /**
     * Update activity timestamp for the current lock holder
     */
    updateActivity(sessionId: string): void;
    /**
     * Check if a session holds the lock
     */
    hasLock(sessionId: string): boolean;
    /**
     * Release the lock for a specific session
     */
    release(sessionId: string): void;
    /**
     * Force release the lock (for watchdog)
     */
    forceRelease(): void;
    /**
     * Process the queue and notify the next waiting session
     */
    private processQueue;
    /**
     * Get current queue status
     */
    getStatus(): QueueStatus;
    /**
     * Get the current lock holder info
     */
    getLockHolder(): LockHolder | null;
    /**
     * Get queue position for a session (0 if not queued)
     */
    getQueuePosition(sessionId: string): number;
    /**
     * Get inactivity duration in milliseconds
     */
    getInactivityMs(): number;
}
export declare const browserQueue: BrowserQueue;
export {};
//# sourceMappingURL=queue.d.ts.map