import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';

export const ConfigSchema = z.object({
    llm: z.object({
        provider: z.string().default('openai'),
        apiKey: z.string().min(1),
        model: z.string(),
        maxOutputTokens: z.number().default(4096),
        maxInputBytes: z.number().default(100000), // Hard cap to prevent sending too much
        temperature: z.number().default(0),
    }),
    repo: z.object({
        respectGitignore: z.boolean().default(true),
        include: z.array(z.string()).default(["packages/**", "workers/**", "clients/**", "src/**", "docs/**", "migrations/**"]),
        exclude: z.array(z.string()).default([".env*", "**/*.pem", "**/*.key", "**/secrets/**", ".repoghost/**", "node_modules/**", "dist/**"]),
        maxFileBytes: z.number().default(20000), // 20KB per file cap
        maxTotalBytes: z.number().default(100000), // 100KB total cap
    }).default({
        respectGitignore: true,
        include: ["packages/**", "workers/**", "clients/**", "src/**", "docs/**", "migrations/**"],
        exclude: [".env*", "**/*.pem", "**/*.key", "**/secrets/**", ".repoghost/**", "node_modules/**", "dist/**"],
        maxFileBytes: 20000,
        maxTotalBytes: 100000,
    }),
    logs: z.object({
        sources: z.array(z.discriminatedUnion('type', [
            z.object({ type: z.literal('file'), path: z.string(), format: z.literal('jsonl').default('jsonl') }),
            z.object({ type: z.literal('command'), cmd: z.string(), format: z.literal('jsonl').default('jsonl') }),
            z.object({ type: z.literal('http'), url: z.string(), headers: z.record(z.string(), z.string()).optional(), format: z.literal('json').default('json') }),
        ])).default([]),
        maxLinesPerRun: z.number().default(1000),
        windowMinutes: z.number().default(1440), // 24 hours
    }).default({
        sources: [],
        maxLinesPerRun: 1000,
        windowMinutes: 1440,
    }),
    report: z.object({
        outputDir: z.string().default(".repoghost/reports"),
        format: z.enum(['markdown', 'json']).default('markdown'),
        sinks: z.array(z.discriminatedUnion('type', [
            z.object({ type: z.literal('webhook'), url: z.string() }),
            z.object({ type: z.literal('github'), repo: z.string(), token: z.string() }),
        ])).default([]),
    }).default({
        outputDir: ".repoghost/reports",
        format: 'markdown',
        sinks: []
    }),
    rules: z.object({
        redactKeys: z.array(z.string()).default([]),
        redactValuePatterns: z.array(z.string()).default([]),
        tokenLimitPolicy: z.number().default(200000),
    }).default({
        redactKeys: [],
        redactValuePatterns: [],
        tokenLimitPolicy: 200000,
    }),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(cwd: string): Promise<Config> {
    const configPath = path.join(cwd, '.repoghost.local.json');
    if (!await fs.pathExists(configPath)) {
        throw new Error(`Config file not found: ${configPath}. Run 'repoghost init' first.`);
    }

    try {
        const raw = await fs.readJson(configPath);
        return ConfigSchema.parse(raw);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error("Config validation failed:", JSON.stringify(error.format(), null, 2));
        }
        throw error;
    }
}
