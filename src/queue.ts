/**
 * Global browser queue manager (singleton)
 * Handles task-level locking across all sessions
 */

import type { LockHolder, QueueEntry, QueueStatus, PluginConfig } from './types';

interface QueueItem {
  sessionId: string;
  sessionName: string;
  waitingSince: number;
}

class BrowserQueue {
  private lock: LockHolder | null = null;
  private queue: QueueItem[] = [];
  private config: PluginConfig = {};

  configure(config: PluginConfig) {
    this.config = config;
  }

  /**
   * Try to acquire the browser lock.
   * Returns true if acquired immediately, false if queued.
   * Does NOT block — queued sessions get false and should retry on next browser call.
   */
  acquire(sessionId: string, sessionName: string, isMainSession: boolean): boolean {
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

    // If this session was queued and is now being promoted (lock just freed for them),
    // check if they're the next in line and the lock was assigned to them by processQueue
    if (this.lock.sessionId === sessionId) {
      this.lock.lastActivity = Date.now();
      return true;
    }

    // Already in queue? Don't add again — just return false
    if (this.isQueued(sessionId)) {
      return false;
    }

    // Lock held by different session - add to queue and return false immediately
    const queueItem: QueueItem = {
      sessionId,
      sessionName,
      waitingSince: Date.now(),
    };

    // Main session gets priority (inserted at position 0)
    if (isMainSession && this.config.mainSessionPriority) {
      this.queue.unshift(queueItem);
    } else {
      this.queue.push(queueItem);
    }

    return false;
  }

  /**
   * Check if a session is already in the queue
   */
  isQueued(sessionId: string): boolean {
    return this.queue.some((item) => item.sessionId === sessionId);
  }

  /**
   * Update activity timestamp for the current lock holder
   */
  updateActivity(sessionId: string): void {
    if (this.lock && this.lock.sessionId === sessionId) {
      this.lock.lastActivity = Date.now();
    }
  }

  /**
   * Check if a session holds the lock
   */
  hasLock(sessionId: string): boolean {
    return this.lock?.sessionId === sessionId;
  }

  /**
   * Release the lock for a specific session
   */
  release(sessionId: string): void {
    if (!this.lock || this.lock.sessionId !== sessionId) {
      return;
    }

    this.lock = null;
    this.processQueue();
  }

  /**
   * Force release the lock (for watchdog)
   */
  forceRelease(): void {
    if (!this.lock) {
      return;
    }

    this.lock = null;
    this.processQueue();
  }

  /**
   * Remove a session from the queue (for zombie cleanup)
   */
  removeFromQueue(sessionId: string): boolean {
    const index = this.queue.findIndex((item) => item.sessionId === sessionId);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }

  /**
   * Get all queued session IDs (for watchdog to check liveness)
   */
  getQueuedSessionIds(): string[] {
    return this.queue.map((item) => item.sessionId);
  }

  /**
   * Process the queue and promote the next waiting session to lock holder
   */
  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }

    // Acquire lock for the next session.
    // The next time this session makes a browser call, acquire() will see
    // it already holds the lock and return true.
    this.lock = {
      sessionId: next.sessionId,
      sessionName: next.sessionName,
      acquiredAt: Date.now(),
      lastActivity: Date.now(),
    };
  }

  /**
   * Get current queue status
   */
  getStatus(): QueueStatus {
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
  getLockHolder(): LockHolder | null {
    return this.lock;
  }

  /**
   * Get queue position for a session (0 if not queued)
   */
  getQueuePosition(sessionId: string): number {
    const index = this.queue.findIndex((item) => item.sessionId === sessionId);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * Get inactivity duration in milliseconds
   */
  getInactivityMs(): number {
    if (!this.lock) {
      return 0;
    }
    return Date.now() - this.lock.lastActivity;
  }
}

// Export singleton instance
export const browserQueue = new BrowserQueue();
