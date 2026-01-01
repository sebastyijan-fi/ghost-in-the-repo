"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = void 0;
exports.loadConfig = loadConfig;
const zod_1 = require("zod");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
exports.ConfigSchema = zod_1.z.object({
    llm: zod_1.z.object({
        provider: zod_1.z.string().default('openai'),
        apiKey: zod_1.z.string().min(1),
        model: zod_1.z.string(),
        maxOutputTokens: zod_1.z.number().default(4096),
        maxInputBytes: zod_1.z.number().default(100000), // Hard cap to prevent sending too much
        temperature: zod_1.z.number().default(0),
    }),
    repo: zod_1.z.object({
        respectGitignore: zod_1.z.boolean().default(true),
        include: zod_1.z.array(zod_1.z.string()).default(["packages/**", "workers/**", "clients/**", "src/**", "docs/**", "migrations/**"]),
        exclude: zod_1.z.array(zod_1.z.string()).default([".env*", "**/*.pem", "**/*.key", "**/secrets/**", ".repoghost/**", "node_modules/**", "dist/**"]),
        maxFileBytes: zod_1.z.number().default(20000), // 20KB per file cap
        maxTotalBytes: zod_1.z.number().default(100000), // 100KB total cap
    }).default({
        respectGitignore: true,
        include: ["packages/**", "workers/**", "clients/**", "src/**", "docs/**", "migrations/**"],
        exclude: [".env*", "**/*.pem", "**/*.key", "**/secrets/**", ".repoghost/**", "node_modules/**", "dist/**"],
        maxFileBytes: 20000,
        maxTotalBytes: 100000,
    }),
    logs: zod_1.z.object({
        sources: zod_1.z.array(zod_1.z.discriminatedUnion('type', [
            zod_1.z.object({ type: zod_1.z.literal('file'), path: zod_1.z.string(), format: zod_1.z.literal('jsonl').default('jsonl') }),
            zod_1.z.object({ type: zod_1.z.literal('command'), cmd: zod_1.z.string(), format: zod_1.z.literal('jsonl').default('jsonl') }),
            zod_1.z.object({ type: zod_1.z.literal('http'), url: zod_1.z.string(), headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(), format: zod_1.z.literal('json').default('json') }),
        ])).default([]),
        maxLinesPerRun: zod_1.z.number().default(1000),
        windowMinutes: zod_1.z.number().default(1440), // 24 hours
    }).default({
        sources: [],
        maxLinesPerRun: 1000,
        windowMinutes: 1440,
    }),
    report: zod_1.z.object({
        outputDir: zod_1.z.string().default(".repoghost/reports"),
        format: zod_1.z.enum(['markdown', 'json']).default('markdown'),
        sinks: zod_1.z.array(zod_1.z.discriminatedUnion('type', [
            zod_1.z.object({ type: zod_1.z.literal('webhook'), url: zod_1.z.string() }),
            zod_1.z.object({ type: zod_1.z.literal('github'), repo: zod_1.z.string(), token: zod_1.z.string() }),
        ])).default([]),
    }).default({
        outputDir: ".repoghost/reports",
        format: 'markdown',
        sinks: []
    }),
    rules: zod_1.z.object({
        redactKeys: zod_1.z.array(zod_1.z.string()).default([]),
        redactValuePatterns: zod_1.z.array(zod_1.z.string()).default([]),
        tokenLimitPolicy: zod_1.z.number().default(200000),
    }).default({
        redactKeys: [],
        redactValuePatterns: [],
        tokenLimitPolicy: 200000,
    }),
});
async function loadConfig(cwd) {
    const configPath = path_1.default.join(cwd, '.repoghost.local.json');
    if (!await fs_extra_1.default.pathExists(configPath)) {
        throw new Error(`Config file not found: ${configPath}. Run 'repoghost init' first.`);
    }
    try {
        const raw = await fs_extra_1.default.readJson(configPath);
        return exports.ConfigSchema.parse(raw);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            console.error("Config validation failed:", JSON.stringify(error.format(), null, 2));
        }
        throw error;
    }
}
