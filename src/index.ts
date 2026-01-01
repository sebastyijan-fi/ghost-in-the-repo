#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chokidar from 'chokidar';
import { loadConfig, ConfigSchema } from './config.js';
import { PolicyGate } from './policy.js';
import { RepoIndexer } from './indexer.js';
import { LogIngest } from './logs.js';
import { LLMClient } from './llm.js';
import { Reporter } from './reporter.js';

const program = new Command();
const cwd = process.cwd();

program
    .name('repoghost')
    .description('Read-only codebase + logs watcher')
    .version('1.0.0');

program
    .command('init')
    .description('Initialize RepoGhost in the current directory')
    .action(async () => {
        const configPath = path.join(cwd, '.repoghost.local.json');
        if (await fs.pathExists(configPath)) {
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

        await fs.writeJson(configPath, initialConfig, { spaces: 2 });
        console.log(`Created ${configPath}`);

        // Update .gitignore
        const gitignorePath = path.join(cwd, '.gitignore');
        const ignoreEntry = '\n# RepoGhost\n.repoghost.local.json\n.repoghost/\n';

        if (await fs.pathExists(gitignorePath)) {
            const content = await fs.readFile(gitignorePath, 'utf-8');
            if (!content.includes('.repoghost.local.json')) {
                await fs.appendFile(gitignorePath, ignoreEntry);
                console.log('Added .repoghost entries to .gitignore');
            } else {
                console.log('.gitignore already contains RepoGhost entries.');
            }
        } else {
            await fs.writeFile(gitignorePath, ignoreEntry);
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
        const config = await loadConfig(cwd);

        // Initial scan
        await runScan();

        // Watch for file changes
        const watcher = chokidar.watch(config.repo.include, {
            cwd,
            ignored: config.repo.exclude,
            persistent: true,
            ignoreInitial: true
        });

        let debounceTimer: NodeJS.Timeout;
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
        const config = await loadConfig(cwd);
        const policy = new PolicyGate(config);
        const indexer = new RepoIndexer(cwd, config, policy);
        const logIngest = new LogIngest(cwd, config, policy);
        const llm = new LLMClient(config);
        const reporter = new Reporter(cwd, config);

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
        } else {
            context += "No logs found.";
        }

        // 4. Generate Report
        console.log('Generating report via LLM...');
        const report = await llm.generateReport(context);

        // 5. Save Report
        await reporter.saveReport(report);
        console.log('Scan complete.');

    } catch (e) {
        console.error('Scan failed:', e);
        process.exit(1);
    }
}
