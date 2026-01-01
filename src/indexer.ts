import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { PolicyGate } from './policy.js';
import { Config } from './config.js';
import { glob } from 'glob';

export class RepoIndexer {
    private config: Config;
    private policy: PolicyGate;
    private rootDir: string;

    constructor(rootDir: string, config: Config, policy: PolicyGate) {
        this.rootDir = rootDir;
        this.config = config;
        this.policy = policy;
    }

    async listFiles(): Promise<string[]> {
        let files: string[] = [];

        // strategy: use git ls-files if .git exists, otherwise walk fs
        const gitDir = path.join(this.rootDir, '.git');
        if (await fs.pathExists(gitDir)) {
            try {
                // --cached: tracked files
                // --others: untracked files
                // --exclude-standard: respect .gitignore
                // -z: null terminated (handles spaces)
                // deduping might be needed if a file is both? (unlikely usually)
                const { stdout } = await execa('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: this.rootDir });
                files = Array.from(new Set(stdout.split('\0').filter(Boolean)));
            } catch (e) {
                console.warn("git ls-files failed, falling back to glob", e);
                files = await this.globFiles();
            }
        } else {
            files = await this.globFiles();
        }

        // Filter by policy
        return files.filter(f => this.policy.isAllowedFile(f));
    }

    private async globFiles(): Promise<string[]> {
        // Basic glob that tries to ignore node_modules and .git
        // But we should really respect .gitignore if possible. 
        // Glob has 'ignore' option.
        const allFiles = await glob('**/*', {
            cwd: this.rootDir,
            dot: true,
            ignore: ['.git/**', 'node_modules/**', '.repoghost/**'],
            nodir: true
        });
        return allFiles;
    }

    async readFiles(files: string[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        let totalBytes = 0;

        for (const file of files) {
            // Stop if we hit total cap
            if (totalBytes >= this.config.repo.maxTotalBytes) {
                console.warn(`Hit total max bytes limit (${this.config.repo.maxTotalBytes}). Stopping file read.`);
                break;
            }

            const absPath = path.join(this.rootDir, file);
            try {
                const stat = await fs.stat(absPath);
                if (!this.policy.checkFileCap(stat.size)) {
                    // Skip file if too large
                    continue;
                }

                if (totalBytes + stat.size > this.config.repo.maxTotalBytes) {
                    continue;
                }

                const content = await fs.readFile(absPath, 'utf-8');
                // Redact immediately
                const redacted = this.policy.redact(content);

                results.set(file, redacted);
                totalBytes += stat.size; // Count original size or redacted? Using original is safer for limits.
            } catch (e) {
                console.error(`Failed to read file ${file}:`, e);
            }
        }

        return results;
    }
}
