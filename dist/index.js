#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const config_js_1 = require("./config.js");
const policy_js_1 = require("./policy.js");
const indexer_js_1 = require("./indexer.js");
const logs_js_1 = require("./logs.js");
const llm_js_1 = require("./llm.js");
const reporter_js_1 = require("./reporter.js");
const program = new commander_1.Command();
const cwd = process.cwd();
program
    .name('repoghost')
    .description('Read-only codebase + logs watcher')
    .version('1.0.0');
program
    .command('init')
    .description('Initialize RepoGhost in the current directory')
    .action(async () => {
    const configPath = path_1.default.join(cwd, '.repoghost.local.json');
    if (await fs_extra_1.default.pathExists(configPath)) {
        console.log('Config file already exists.');
        return;
    }
    const initialConfig = {
        llm: {
            provider: "openai",
            apiKey: "YOUR_API_KEY_HERE",
            model: "gpt-4o",
        },
        repo: {
            include: ["src/**", "package.json"],
            exclude: ["node_modules/**", "dist/**", ".env*", ".repoghost/**"]
        },
        logs: {
            sources: []
        }
    };
    await fs_extra_1.default.writeJson(configPath, initialConfig, { spaces: 2 });
    console.log(`Created ${configPath}`);
    // Update .gitignore
    const gitignorePath = path_1.default.join(cwd, '.gitignore');
    const ignoreEntry = '\n# RepoGhost\n.repoghost.local.json\n.repoghost/\n';
    if (await fs_extra_1.default.pathExists(gitignorePath)) {
        const content = await fs_extra_1.default.readFile(gitignorePath, 'utf-8');
        if (!content.includes('.repoghost.local.json')) {
            await fs_extra_1.default.appendFile(gitignorePath, ignoreEntry);
            console.log('Added .repoghost entries to .gitignore');
        }
        else {
            console.log('.gitignore already contains RepoGhost entries.');
        }
    }
    else {
        await fs_extra_1.default.writeFile(gitignorePath, ignoreEntry);
        console.log('Created .gitignore with RepoGhost entries');
    }
});
program
    .command('scan')
    .description('Run a one-off scan and generate report')
    .action(async () => {
    await runScan();
});
program
    .command('watch')
    .description('Continuous mode: tail logs and periodic file scans')
    .action(async () => {
    console.log('Starting watch mode...');
    const config = await (0, config_js_1.loadConfig)(cwd);
    // Initial scan
    await runScan();
    // Watch for file changes
    const watcher = chokidar_1.default.watch(config.repo.include, {
        cwd,
        ignored: config.repo.exclude,
        persistent: true,
        ignoreInitial: true
    });
    let debounceTimer;
    watcher.on('all', (event, path) => {
        console.log(`File changed: ${path}`);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            console.log('Triggering scan due to file changes...');
            runScan().catch(console.error);
        }, 30000); // 30s debounce to avoid spamming LLM
    });
    // Also could set up interval for log polling
    if (config.logs.sources.length > 0) {
        setInterval(() => {
            console.log('Triggering periodic log scan...');
            runScan().catch(console.error);
        }, 1000 * 60 * 60); // Every hour
    }
});
program.parse();
async function runScan() {
    console.log('Starting scan...');
    try {
        const config = await (0, config_js_1.loadConfig)(cwd);
        const policy = new policy_js_1.PolicyGate(config);
        const indexer = new indexer_js_1.RepoIndexer(cwd, config, policy);
        const logIngest = new logs_js_1.LogIngest(cwd, config, policy);
        const llm = new llm_js_1.LLMClient(config);
        const reporter = new reporter_js_1.Reporter(cwd, config);
        // 1. Index files
        console.log('Indexing files...');
        const files = await indexer.listFiles();
        console.log(`Found ${files.length} files to analyze.`);
        const fileContents = await indexer.readFiles(files);
        console.log(`Read ${fileContents.size} files.`);
        // 2. Ingest logs
        console.log('Ingesting logs...');
        const logs = await logIngest.collectLogs();
        console.log(`Collected ${logs.length} log entries.`);
        // 3. Prepare Context
        let context = "## Codebase Snapshot\n";
        for (const [file, content] of fileContents) {
            context += `### File: ${file}\n\`\`\`\n${content}\n\`\`\`\n\n`;
        }
        context += "## Logs Snapshot\n";
        if (logs.length > 0) {
            context += logs.map(l => `[${l.level || 'INFO'}] ${l.timestamp || ''} (${l.source}): ${l.message}`).join('\n');
        }
        else {
            context += "No logs found.";
        }
        // 4. Generate Report
        console.log('Generating report via LLM...');
        const report = await llm.generateReport(context);
        // 5. Save Report
        await reporter.saveReport(report);
        console.log('Scan complete.');
    }
    catch (e) {
        console.error('Scan failed:', e);
        process.exit(1);
    }
}
