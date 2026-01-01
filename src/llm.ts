import OpenAI from 'openai';
import { Config } from './config.js';

export class LLMClient {
    private openai: OpenAI;
    private config: Config;

    constructor(config: Config) {
        this.config = config;
        this.openai = new OpenAI({
            apiKey: config.llm.apiKey,
            baseURL: config.llm.provider === 'openai' ? undefined : process.env.LLM_BASE_URL,
        });
    }

    async generateReport(context: string): Promise<string> {
        const prompt = `
You are RepoGhost, an automated code and log analysis tool.
Refuse to output any secrets if you see them (though they should be redacted).
Analyze the following code context and logs.

Produce a report in Markdown format with:
1. Code Health (issues, ghost code, violations)
2. Runtime Health (error analysis from logs)
3. Actionable Recommendations (files/lines to fix)

Context:
${context}
    `.trim();

        // Enforce input hard cap
        if (prompt.length > this.config.llm.maxInputBytes) {
            throw new Error(`Input context too large (${prompt.length} bytes) for configured limit (${this.config.llm.maxInputBytes})`);
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: this.config.llm.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: this.config.llm.maxOutputTokens,
                temperature: this.config.llm.temperature,
            });

            return response.choices[0]?.message?.content || "No report generated.";
        } catch (e) {
            console.error("LLM generation failed:", e);
            throw e;
        }
    }
}
