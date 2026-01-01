import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { RepoIndexer } from './indexer.js';
import { PolicyGate } from './policy.js';
import { ConfigSchema } from './config.js';

describe('RepoIndexer', () => {
    const cwd = process.cwd();
    const config = ConfigSchema.parse({
        llm: { apiKey: 'dummy', model: 'dummy' },
        repo: {
            include: ["src/**", "test_allowed.txt"]
        }
    });
    const policy = new PolicyGate(config);
    const indexer = new RepoIndexer(cwd, config, policy);

    beforeAll(async () => {
        await fs.ensureDir(path.join(cwd, 'secrets'));
        await fs.writeFile(path.join(cwd, 'secrets/api.key'), 'super_secret');
        await fs.writeFile(path.join(cwd, 'test_allowed.txt'), 'hello');
    });

    afterAll(async () => {
        await fs.remove(path.join(cwd, 'secrets'));
        await fs.remove(path.join(cwd, 'test_allowed.txt'));
    });

    it('should list allowed files and exclude secrets', async () => {
        const files = await indexer.listFiles();
        // test_allowed.txt should be there (untracked)
        // secrets/api.key should NOT be there (excluded)

        const foundAllowed = files.some(f => f.includes('test_allowed.txt'));
        const foundSecret = files.some(f => f.includes('secrets/api.key'));

        expect(foundAllowed).toBe(true);
        expect(foundSecret).toBe(false);
    });

    it('should respect manual exclude', async () => {
        const customConfig = ConfigSchema.parse({
            llm: { apiKey: 'dummy', model: 'dummy' },
            repo: {
                include: ["**/*"],
                exclude: ["**/*.txt"]
            }
        });
        const customPolicy = new PolicyGate(customConfig);
        const customIndexer = new RepoIndexer(cwd, customConfig, customPolicy);

        const files = await customIndexer.listFiles();
        expect(files.some(f => f.includes('test_allowed.txt'))).toBe(false);
    });
});
