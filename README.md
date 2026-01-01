# RepoGhost

Read-Only Codebase + Logs Watcher.

## Installation

```bash
npm install
npm run build
```

## Usage

1. Initialize in a repo:

   ```bash
   node dist/index.js init
   ```

   This creates `.repoghost.local.json` and updates `.gitignore`.

2. Edit `.repoghost.local.json` and add your OpenAI API Key.

3. Run scan:

   ```bash
   node dist/index.js scan
   ```

4. Watch mode:

   ```bash
   node dist/index.js watch
   ```

## Authorization & Security

- This tool is **READ-ONLY**. It does not modify your code (except adding itself to `.gitignore` during init).
- It uses `.gitignore` to avoid reading ignored files.
- It attempts to redact secrets using pattern matching before sending context to the LLM.
- Always review your `.repoghost.local.json` to configure what is sent.

## Testing

Run unit tests:

```bash
npm test
```
