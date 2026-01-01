import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { execa } from 'execa'; // Use execa instead of child_process since we already have it
import { Config } from './config.js';
import { PolicyGate } from './policy.js';

export interface LogEntry {
    source: string;
    timestamp?: string;
    level?: string;
    message: string;
    original: any;
}

export class LogIngest {
    private config: Config;
    private policy: PolicyGate;
    private rootDir: string;

    constructor(rootDir: string, config: Config, policy: PolicyGate) {
        this.rootDir = rootDir;
        this.config = config;
        this.policy = policy;
    }

    async collectLogs(): Promise<LogEntry[]> {
        let allLogs: LogEntry[] = [];

        for (const source of this.config.logs.sources) {
            try {
                if (source.type === 'file') {
                    const logs = await this.collectFileLogs(source);
                    allLogs = allLogs.concat(logs);
                } else if (source.type === 'command') {
                    const logs = await this.collectCommandLogs(source);
                    allLogs = allLogs.concat(logs);
                }
                // HTTP source can be added later
            } catch (e) {
                console.error(`Failed to collect logs from source ${JSON.stringify(source)}:`, e);
            }
        }

        // Sort by timestamp if possible? Or just return mixed.
        // Cap total lines
        return allLogs.slice(0, this.config.logs.maxLinesPerRun);
    }

    private async collectFileLogs(source: { path: string, format: string }): Promise<LogEntry[]> {
        // resolve glob
        const matches = await glob(source.path, { cwd: this.rootDir, absolute: true });
        let entries: LogEntry[] = [];

        for (const file of matches) {
            const content = await fs.readFile(file, 'utf-8');
            const lines = content.split('\n').filter(Boolean).slice(-100); // Take last 100 lines per file approx

            for (const line of lines) {
                try {
                    if (source.format === 'jsonl') {
                        const parsed = JSON.parse(line);
                        entries.push({
                            source: `file:${path.relative(this.rootDir, file)}`,
                            timestamp: parsed.timestamp || parsed.time || parsed.date,
                            level: parsed.level || parsed.severity,
                            message: this.policy.redact(parsed.message || line),
                            original: parsed
                        });
                    } else {
                        entries.push({
                            source: `file:${path.relative(this.rootDir, file)}`,
                            message: this.policy.redact(line),
                            original: line
                        });
                    }
                } catch {
                    entries.push({
                        source: `file:${path.relative(this.rootDir, file)}`,
                        message: this.policy.redact(line),
                        original: line
                    });
                }
            }
        }
        return entries;
    }

    private async collectCommandLogs(source: { cmd: string, format: string }): Promise<LogEntry[]> {
        // Run command
        // Be careful with timeouts
        try {
            const { stdout } = await execa(source.cmd, { shell: true, timeout: 10000, cwd: this.rootDir });
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
                    } catch {
                        return { source: `cmd:${source.cmd}`, message: this.policy.redact(line), original: line };
                    }
                }
                return { source: `cmd:${source.cmd}`, message: this.policy.redact(line), original: line };
            });
        } catch (e) {
            console.error(`Command log source failed: ${source.cmd}`, e);
            return [];
        }
    }
}
