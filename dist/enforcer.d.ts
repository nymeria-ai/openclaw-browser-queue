/**
 * Profile and target enforcement logic
 * Validates browser calls against configured policies
 */
import type { PluginConfig, BrowserToolParams } from './types';
export declare class ProfileEnforcer {
    private config;
    constructor(config: PluginConfig);
    /**
     * Enforce profile and target policies on browser tool params
     * Returns modified params or throws an error if blocked
     */
    enforce(params: BrowserToolParams): BrowserToolParams;
    /**
     * Check if params would be blocked without modifying them
     */
    wouldBlock(params: BrowserToolParams): {
        blocked: boolean;
        reason?: string;
    };
}
//# sourceMappingURL=enforcer.d.ts.map