"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepoIndexer = void 0;
const execa_1 = require("execa");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
class RepoIndexer {
    config;
    policy;
    rootDir;
    constructor(rootDir, config, policy) {
        this.rootDir = rootDir;
        this.config = config;
        this.policy = policy;
    }
    async listFiles() {
        let files = [];
        // strategy: use git ls-files if .git exists, otherwise walk fs
        const gitDir = path_1.default.join(this.rootDir, '.git');
        if (await fs_extra_1.default.pathExists(gitDir)) {
            try {
                // --cached: tracked files
                // --others: untracked files
                // --exclude-standard: respect .gitignore
                // -z: null terminated (handles spaces)
                // deduping might be needed if a file is both? (unlikely usually)
                const { stdout } = await (0, execa_1.execa)('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: this.rootDir });
                files = Array.from(new Set(stdout.split('\0').filter(Boolean)));
            }
            catch (e) {
                console.warn("git ls-files failed, falling back to glob", e);
                files = await this.globFiles();
            }
        }
        else {
            files = await this.globFiles();
        }
        // Filter by policy
        return files.filter(f => this.policy.isAllowedFile(f));
    }
    async globFiles() {
        // Basic glob that tries to ignore node_modules and .git
        // But we should really respect .gitignore if possible. 
        // Glob has 'ignore' option.
        const allFiles = await (0, glob_1.glob)('**/*', {
            cwd: this.rootDir,
            dot: true,
            ignore: ['.git/**', 'node_modules/**', '.repoghost/**'],
            nodir: true
        });
        return allFiles;
    }
    async readFiles(files) {
        const results = new Map();
        let totalBytes = 0;
        for (const file of files) {
            // Stop if we hit total cap
            if (totalBytes >= this.config.repo.maxTotalBytes) {
                console.warn(`Hit total max bytes limit (${this.config.repo.maxTotalBytes}). Stopping file read.`);
                break;
            }
            const absPath = path_1.default.join(this.rootDir, file);
            try {
                const stat = await fs_extra_1.default.stat(absPath);
                if (!this.policy.checkFileCap(stat.size)) {
                    // Skip file if too large
                    continue;
                }
                if (totalBytes + stat.size > this.config.repo.maxTotalBytes) {
                    continue;
                }
                const content = await fs_extra_1.default.readFile(absPath, 'utf-8');
                // Redact immediately
                const redacted = this.policy.redact(content);
                results.set(file, redacted);
                totalBytes += stat.size; // Count original size or redacted? Using original is safer for limits.
            }
            catch (e) {
                console.error(`Failed to read file ${file}:`, e);
            }
        }
        return results;
    }
}
exports.RepoIndexer = RepoIndexer;
