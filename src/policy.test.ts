import { describe, it, expect } from 'vitest';
import { PolicyGate } from './policy.js';
import { ConfigSchema } from './config.js';

describe('PolicyGate Redaction', () => {
    const config = ConfigSchema.parse({ llm: { apiKey: 'dummy', model: 'dummy' } });
    const policy = new PolicyGate(config);

    it('should redact common keys', () => {
        const input = '{ "apiKey": "123456", "token": "abcdef" }';
        const expected = '{ "apiKey": "[REDACTED]", "token": "[REDACTED]" }';
        // Regex replacement might produce different whitespace or format, let's allow flexibility or check presence
        const output = policy.redact(input);

        expect(output).toContain('"apiKey": "[REDACTED]"');
        expect(output).toContain('"token": "[REDACTED]"');
        expect(output).not.toContain('123456');
        expect(output).not.toContain('abcdef');
    });

    it('should redact PEM keys', () => {
        const input = `
-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
        `;
        const output = policy.redact(input);
        expect(output).toContain('[REDACTED PEM BLOCK]');
        expect(output).not.toContain('MIIEpQIBAAKCAQEA');
    });

    it('should redact assignment', () => {
        const input = 'API_KEY = "12345"';
        const output = policy.redact(input);
        expect(output).toContain('API_KEY = [REDACTED]');
        expect(output).not.toContain('12345');
    });
});
