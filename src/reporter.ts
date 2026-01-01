import fs from 'fs-extra';
import path from 'path';
import { Config } from './config.js';

export class Reporter {
    private config: Config;
    private rootDir: string;

    constructor(rootDir: string, config: Config) {
        this.rootDir = rootDir;
        this.config = config;
    }

    async saveReport(content: string): Promise<string> {
        const reportDir = path.resolve(this.rootDir, this.config.report.outputDir);
        await fs.ensureDir(reportDir);

        const date = new Date().toISOString().split('T')[0];
        const filename = `report-${date}.md`;
        const filePath = path.join(reportDir, filename);

        await fs.writeFile(filePath, content, 'utf-8');
        console.log(`Report saved to ${filePath}`);

        // Handle sinks
        for (const sink of this.config.report.sinks) {
            if (sink.type === 'webhook') {
                await this.postWebhook(sink.url, content);
            }
            // GitHub sink implementation omitted for brevity/scope, can add if requested
        }

        return filePath;
    }

    private async postWebhook(url: string, content: string) {
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: content })
            });
            console.log(`Posted report to webhook: ${url}`);
        } catch (e) {
            console.error(`Failed to post to webhook ${url}:`, e);
        }
    }
}
