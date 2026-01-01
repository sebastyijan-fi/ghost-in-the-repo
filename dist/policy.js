"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyGate = void 0;
const minimatch_1 = require("minimatch");
const SENSITIVE_KEYS = [
    'token', 'secret', 'password', 'cookie', 'authorization', 'apiKey', 'api_key', 'privateKey', 'private_key', 'phrase', 'mnemonic', 'session', 'refreshToken', 'refresh_token', 'accessToken', 'access_token', 'idToken', 'id_token', 'signature', 'mmk', 'mailboxMasterKey'
];
const SENSITIVE_VALUE_PATTERNS = [
    /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, // JWT-like
    /[-]{5}BEGIN[ A-Z0-9]+PRIVATE KEY[-]{5}[\s\S]*?[-]{5}END[ A-Z0-9]+PRIVATE KEY[-]{5}/, // PEM Block
];
class PolicyGate {
    config;
    constructor(config) {
        this.config = config;
    }
    isAllowedFile(filePath) {
        // 1. Check strict exclude patterns (deny list)
        for (const pattern of this.config.repo.exclude) {
            if ((0, minimatch_1.minimatch)(filePath, pattern, { dot: true })) {
                return false;
            }
        }
        // 2. Check include patterns (allow list)
        // If include is empty, assume everything except excluded is allowed? No, usually explicit include is safer.
        // Spec says default include is ["packages/**", ...].
        let matchedInclude = false;
        for (const pattern of this.config.repo.include) {
            if ((0, minimatch_1.minimatch)(filePath, pattern, { dot: true })) {
                matchedInclude = true;
                break;
            }
        }
        return matchedInclude;
    }
    redact(content) {
        // Simple naive redaction for now.
        // 1. Redact by key presence in JSON/YAML (if applicable) - hard to do robustly on raw strings without parsing.
        // So we'll do regex based redaction for key-value pairs like `key: value` or `"key": "value"`.
        // Combine built-in keys with user defined keys
        const keysToRedact = [...SENSITIVE_KEYS, ...this.config.rules.redactKeys];
        let redacted = content;
        // Regex for "key": "value" or key: value
        // This is best-effort.
        for (const key of keysToRedact) {
            // Catch "key": "..."
            const jsonRegex = new RegExp(`("${key}"\\s*:\\s*")([^"]+)(")`, 'gi');
            redacted = redacted.replace(jsonRegex, '$1[REDACTED]$3');
            // Catch key = ... (env vars, properties)
            // Be careful not to match too broadly.
            const assignRegex = new RegExp(`(\\b${key}\\s*=\\s*)([^\\s;]+)`, 'gi');
            redacted = redacted.replace(assignRegex, '$1[REDACTED]');
        }
        // Redact by value shape
        const valuePatterns = [
            ...SENSITIVE_VALUE_PATTERNS,
            ...this.config.rules.redactValuePatterns.map(p => new RegExp(p))
        ];
        for (const pattern of valuePatterns) {
            // Redact matches
            // pattern for PEM is multiline, so we need to ensure replacement works
            // The PEM pattern above includes flags? No, we use 'g' below.
            // But '.' dot does not match newlines in JS regex default.
            // [\s\S] matches everything.
            // But if I pass a regex object to new RegExp(pattern, 'g'), flags might conflict.
            let flags = 'g';
            // If it's the PEM pattern, it doesn't need global if we assume one per match loop, 
            // but 'g' is safer to catch multiples.
            if (pattern instanceof RegExp) {
                // We can't easily re-flag a regex to 'g' if it's not.
                // But SENSITIVE_VALUE_PATTERNS has regex literals.
                // We can use replace(pattern, ...) directly if it has global flag?
                // Or use split/join.
                // The simple way: regex with 'g' flag.
                // My PEM regex doesn't have flags in the array.
                // So I must create new RegExp source.
                const re = new RegExp(pattern.source, 'g');
                redacted = redacted.replace(re, (match) => {
                    if (match.includes('BEGIN'))
                        return '[REDACTED PEM BLOCK]';
                    return '[REDACTED]';
                });
            }
        }
        return redacted;
    }
    checkFileCap(size) {
        return size <= this.config.repo.maxFileBytes;
    }
}
exports.PolicyGate = PolicyGate;
