/**
 * TypeScript interfaces for the browser queue plugin
 */
export interface PluginConfig {
    defaultProfile?: string;
    defaultTarget?: 'host' | 'sandbox' | 'node';
    inactivityTimeoutMs?: number;
    inactivityCheckIntervalMs?: number;
    mainSessionPriority?: boolean;
    autoRelease?: boolean;
    autoReleaseAfterMs?: number;
    enforcedProfile?: boolean;
    enforcedTarget?: boolean;
    allowedProfiles?: string[];
    blockedProfiles?: string[];
    blockedTargets?: string[];
}
export interface BrowserToolParams {
    action: string;
    profile?: string;
    target?: string;
    [key: string]: any;
}
export interface QueueEntry {
    sessionId: string;
    sessionName: string;
    waitingSince: number;
    position: number;
}
export interface LockHolder {
    sessionId: string;
    sessionName: string;
    acquiredAt: number;
    lastActivity: number;
}
export interface QueueStatus {
    locked: boolean;
    holder?: LockHolder;
    queue: QueueEntry[];
    config: {
        defaultProfile?: string;
        defaultTarget?: string;
        autoReleaseAfterMs?: number;
    };
}
export interface PluginAPI {
    getConfig(): PluginConfig;
    logger: {
        info(msg: string, ...args: any[]): void;
        warn(msg: string, ...args: any[]): void;
        error(msg: string, ...args: any[]): void;
        debug(msg: string, ...args: any[]): void;
    };
    registerTool(tool: any, options?: any): void;
    registerService(service: any): void;
    registerHook?(event: string, handler: Function, options?: any): void;
    on?(event: string, handler: Function): void;
}
export interface ToolContext {
    sessionId?: string;
    sessionName?: string;
    channel?: string;
    senderId?: string;
}
export interface ToolExecutionResult {
    content: Array<{
        type: string;
        text: string;
    }>;
}
//# sourceMappingURL=types.d.ts.map