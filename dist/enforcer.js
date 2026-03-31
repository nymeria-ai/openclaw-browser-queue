"use strict";
/**
 * Profile and target enforcement logic
 * Validates browser calls against configured policies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileEnforcer = void 0;
class ProfileEnforcer {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Enforce profile and target policies on browser tool params
     * Returns modified params or throws an error if blocked
     */
    enforce(params) {
        const modifiedParams = { ...params };
        // Enforce profile
        if (this.config.enforcedProfile && this.config.defaultProfile) {
            if (!modifiedParams.profile) {
                // No profile specified - inject default
                modifiedParams.profile = this.config.defaultProfile;
            }
        }
        // Check blocked profiles
        if (modifiedParams.profile && this.config.blockedProfiles?.length) {
            if (this.config.blockedProfiles.includes(modifiedParams.profile)) {
                throw new Error(`Browser profile "${modifiedParams.profile}" is blocked by policy. ` +
                    `Blocked profiles: ${this.config.blockedProfiles.join(', ')}`);
            }
        }
        // Check allowed profiles
        if (modifiedParams.profile && this.config.allowedProfiles?.length) {
            if (!this.config.allowedProfiles.includes(modifiedParams.profile)) {
                throw new Error(`Browser profile "${modifiedParams.profile}" is not in the allowed list. ` +
                    `Allowed profiles: ${this.config.allowedProfiles.join(', ')}`);
            }
        }
        // Enforce target
        if (this.config.enforcedTarget && this.config.defaultTarget) {
            if (!modifiedParams.target) {
                // No target specified - inject default
                modifiedParams.target = this.config.defaultTarget;
            }
        }
        // Check blocked targets
        if (modifiedParams.target && this.config.blockedTargets?.length) {
            if (this.config.blockedTargets.includes(modifiedParams.target)) {
                throw new Error(`Browser target "${modifiedParams.target}" is blocked by policy. ` +
                    `Blocked targets: ${this.config.blockedTargets.join(', ')}`);
            }
        }
        return modifiedParams;
    }
    /**
     * Check if params would be blocked without modifying them
     */
    wouldBlock(params) {
        try {
            this.enforce(params);
            return { blocked: false };
        }
        catch (err) {
            return {
                blocked: true,
                reason: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
exports.ProfileEnforcer = ProfileEnforcer;
//# sourceMappingURL=enforcer.js.map