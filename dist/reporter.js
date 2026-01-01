"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reporter = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
class Reporter {
    config;
    rootDir;
    constructor(rootDir, config) {
        this.rootDir = rootDir;
        this.config = config;
    }
    async saveReport(content) {
        const reportDir = path_1.default.resolve(this.rootDir, this.config.report.outputDir);
        await fs_extra_1.default.ensureDir(reportDir);
        const date = new Date().toISOString().split('T')[0];
        const filename = `report-${date}.md`;
        const filePath = path_1.default.join(reportDir, filename);
        await fs_extra_1.default.writeFile(filePath, content, 'utf-8');
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
    async postWebhook(url, content) {
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: content })
            });
            console.log(`Posted report to webhook: ${url}`);
        }
        catch (e) {
            console.error(`Failed to post to webhook ${url}:`, e);
        }
    }
}
exports.Reporter = Reporter;
