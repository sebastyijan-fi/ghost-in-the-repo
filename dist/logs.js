"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogIngest = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
const execa_1 = require("execa"); // Use execa instead of child_process since we already have it
class LogIngest {
    config;
    policy;
    rootDir;
    constructor(rootDir, config, policy) {
        this.rootDir = rootDir;
        this.config = config;
        this.policy = policy;
    }
    async collectLogs() {
        let allLogs = [];
        for (const source of this.config.logs.sources) {
            try {
                if (source.type === 'file') {
                    const logs = await this.collectFileLogs(source);
                    allLogs = allLogs.concat(logs);
                }
                else if (source.type === 'command') {
                    const logs = await this.collectCommandLogs(source);
                    allLogs = allLogs.concat(logs);
                }
                // HTTP source can be added later
            }
            catch (e) {
                console.error(`Failed to collect logs from source ${JSON.stringify(source)}:`, e);
            }
        }
        // Sort by timestamp if possible? Or just return mixed.
        // Cap total lines
        return allLogs.slice(0, this.config.logs.maxLinesPerRun);
    }
    async collectFileLogs(source) {
        // resolve glob
        const matches = await (0, glob_1.glob)(source.path, { cwd: this.rootDir, absolute: true });
        let entries = [];
        for (const file of matches) {
            const content = await fs_extra_1.default.readFile(file, 'utf-8');
            const lines = content.split('\n').filter(Boolean).slice(-100); // Take last 100 lines per file approx
            for (const line of lines) {
                try {
                    if (source.format === 'jsonl') {
                        const parsed = JSON.parse(line);
                        entries.push({
                            source: `file:${path_1.default.relative(this.rootDir, file)}`,
                            timestamp: parsed.timestamp || parsed.time || parsed.date,
                            level: parsed.level || parsed.severity,
                            message: this.policy.redact(parsed.message || line),
                            original: parsed
                        });
                    }
                    else {
                        entries.push({
                            source: `file:${path_1.default.relative(this.rootDir, file)}`,
                            message: this.policy.redact(line),
                            original: line
                        });
                    }
                }
                catch {
                    entries.push({
                        source: `file:${path_1.default.relative(this.rootDir, file)}`,
                        message: this.policy.redact(line),
                        original: line
                    });
                }
            }
        }
        return entries;
    }
    async collectCommandLogs(source) {
        // Run command
        // Be careful with timeouts
        try {
            const { stdout } = await (0, execa_1.execa)(source.cmd, { shell: true, timeout: 10000, cwd: this.rootDir });
            const lines = stdout.split('\n').filter(Boolean);
            return lines.map(line => {
                if (source.format === 'jsonl') {
                    try {
                        const parsed = JSON.parse(line);
                        return {
                            source: `cmd:${source.cmd}`,
                            timestamp: parsed.timestamp || parsed.time,
                            level: parsed.level,
                            message: this.policy.redact(parsed.message || line),
                            original: parsed
                        };
                    }
                    catch {
                        return { source: `cmd:${source.cmd}`, message: this.policy.redact(line), original: line };
                    }
                }
                return { source: `cmd:${source.cmd}`, message: this.policy.redact(line), original: line };
            });
        }
        catch (e) {
            console.error(`Command log source failed: ${source.cmd}`, e);
            return [];
        }
    }
}
exports.LogIngest = LogIngest;
