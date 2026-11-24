#!/usr/bin/env node

const readline = require("readline");
const path = require("path");
const WhatsAppTransport = require("./transport");
const { executeCommand, readFile, writeFile, listDirectory } = require("./tools");

// ANSI Styling
const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    bgBlue: "\x1b[44m"
};

const BANNER = `
${C.cyan}${C.bright}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                      W A H A R N E S S                           ┃
┃       Zero-Rated AI Agent Terminal • OpenCode CLI Engine        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${C.reset}
${C.gray}Model: ${C.green}Hermes (DeepSeek) / AGY (Gemini)${C.gray} | Transport: ${C.blue}WhatsApp Web (Telcel Zero-Rate)${C.reset}
${C.gray}Workspace: ${C.yellow}${process.cwd()}${C.reset}
${C.dim}Type your request in plain text or /help for available commands.${C.reset}
`;

class WaHarnessCLI {
    constructor() {
        this.cwd = process.cwd();
        this.activeModel = "deepseek-v4-pro";
        this.transport = new WhatsAppTransport();
        this.rl = null;
        this.inFlight = false;
        this.pendingResolvers = new Map();
    }

    async start() {
        console.clear();
        console.log(BANNER);
        process.stdout.write(`${C.yellow}⟳ Connecting to WhatsApp Zero-Rate Tunnel...${C.reset}\r`);

        this.transport.on("ready", () => {
            console.log(`\r${C.green}✓ WhatsApp Zero-Rated Transport Connected & Online!${C.reset}       \n`);
            this.promptUser();
        });

        this.transport.on("disconnected", (data) => {
            if (data.shouldReconnect) {
                console.log(`\n${C.yellow}⚠ Transport connection dropped. Reconnecting in background...${C.reset}`);
            } else {
                console.log(`\n${C.red}✗ WhatsApp session logged out. Run initial scan again.${C.reset}`);
            }
        });

        this.transport.on("message", (msg) => this.handleInbound(msg));

        await this.transport.init();
        this.setupReadline();
    }

    setupReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `${C.cyan}${C.bright}waharness${C.reset} ${C.dim}❯${C.reset} `
        });

        this.rl.on("line", async (line) => {
            const input = line.trim();
            if (!input) {
                this.rl.prompt();
                return;
            }

            if (input.startsWith("/")) {
                this.handleSlashCommand(input);
                this.rl.prompt();
                return;
            }

            await this.dispatchPrompt(input);
        });

        this.rl.on("close", () => {
            console.log(`\n${C.cyan}Exiting WaHarness. Keep hacking!${C.reset}`);
            process.exit(0);
        });
    }

    promptUser() {
        if (this.rl && !this.inFlight) {
            this.rl.prompt();
        }
    }

    handleSlashCommand(cmd) {
        const parts = cmd.split(" ");
        const action = parts[0].toLowerCase();

        switch (action) {
            case "/help":
                console.log(`\n${C.bright}Available Commands:${C.reset}`);
                console.log(`  ${C.green}/model [name]${C.reset}    Switch active model (deepseek-flash, deepseek-v4-pro, agy)`);
                console.log(`  ${C.green}/status${C.reset}          Show connection status and current workspace`);
                console.log(`  ${C.green}/clear${C.reset}           Clear terminal screen`);
                console.log(`  ${C.green}/exec <cmd>${C.reset}     Run a local command directly`);
                console.log(`  ${C.green}/exit${C.reset}            Quit WaHarness\n`);
                break;
            case "/status":
                console.log(`\n${C.bright}Status:${C.reset}`);
                console.log(`  Connected: ${this.transport.connected ? C.green + "Yes" : C.red + "No"}${C.reset}`);
                console.log(`  Model:     ${C.cyan}${this.activeModel}${C.reset}`);
                console.log(`  Workspace: ${C.yellow}${this.cwd}${C.reset}\n`);
                break;
            case "/model":
                if (parts[1]) {
                    this.activeModel = parts[1];
                    console.log(`\n${C.green}Active model switched to: ${this.activeModel}${C.reset}\n`);
                } else {
                    console.log(`\n${C.yellow}Usage: /model <deepseek-flash | deepseek-v4-pro | agy>${C.reset}\n`);
                }
                break;
            case "/clear":
                console.clear();
                console.log(BANNER);
                break;
            case "/exec":
                const localCmd = parts.slice(1).join(" ");
                if (!localCmd) {
                    console.log(`${C.yellow}Usage: /exec <command>${C.reset}`);
                    return;
                }
                executeCommand(localCmd, this.cwd).then(res => {
                    if (res.out) console.log(res.out.trim());
                    if (res.err) console.error(C.red + res.err.trim() + C.reset);
                });
                break;
            case "/exit":
            case "/quit":
                this.rl.close();
                break;
            default:
                console.log(`${C.red}Unknown command: ${action}. Type /help for assistance.${C.reset}`);
                break;
        }
    }

    async dispatchPrompt(userPrompt) {
        if (!this.transport.connected) {
            console.log(`${C.red}Cannot send prompt: Transport is currently offline.${C.reset}`);
            this.rl.prompt();
            return;
        }

        this.inFlight = true;
        const reqId = Math.random().toString(36).substring(2, 10);

        console.log(`\n${C.magenta}⚡ [Agent Thinking...]${C.reset}`);

        const packet = "!CLI_PROMPT:" + JSON.stringify({
            id: reqId,
            prompt: userPrompt,
            cwd: this.cwd,
            model: this.activeModel,
            ts: Math.floor(Date.now() / 1000)
        });

        try {
            await this.transport.sendMessage(packet);
        } catch (e) {
            console.log(`${C.red}Failed to send prompt over WhatsApp: ${e.message}${C.reset}`);
            this.inFlight = false;
            this.rl.prompt();
        }
    }

    async handleInbound({ from, text }) {
        // 1. Tool execution request from Brain Controller
        if (text.startsWith("!CLI_TOOL_REQ:")) {
            try {
                const req = JSON.parse(text.substring("!CLI_TOOL_REQ:".length).trim());
                console.log(`\n${C.blue}⚙ [Tool Request] ${C.bright}${req.action}${C.reset} ${C.gray}${req.cmd || req.path || ""}${C.reset}`);

                let result = {};
                if (req.action === "bash" || req.action === "exec") {
                    result = await executeCommand(req.cmd, req.cwd || this.cwd);
                } else if (req.action === "read_file") {
                    result = readFile(req.path, req.cwd || this.cwd);
                } else if (req.action === "write_file") {
                    result = writeFile(req.path, req.content, req.cwd || this.cwd);
                } else if (req.action === "list_dir") {
                    result = listDirectory(req.path || ".", req.cwd || this.cwd);
                }

                console.log(`${C.green}✓ [Tool Done]${C.reset} code: ${result.code !== undefined ? result.code : "OK"} (${result.dur || 0}s)`);

                const replyPkt = "!CLI_TOOL_RES:" + JSON.stringify({
                    id: req.id,
                    result: result
                });
                await this.transport.sendMessage(replyPkt, from);
            } catch (e) {
                console.error(C.red + "[Tool Error] " + e.message + C.reset);
            }
            return;
        }

        // 2. Final / Streaming response from Brain Controller
        if (text.startsWith("!CLI_STREAM:")) {
            const chunk = text.substring("!CLI_STREAM:".length);
            process.stdout.write(chunk);
            return;
        }

        if (text.startsWith("!CLI_DONE:")) {
            const data = JSON.parse(text.substring("!CLI_DONE:".length).trim());
            console.log(`\n\n${C.green}✓ [Completed in ${data.dur || 0}s]${C.reset}\n`);
            this.inFlight = false;
            this.promptUser();
            return;
        }

        // Standard text response fallback
        if (!text.startsWith("!RPC_")) {
            console.log(`\n${C.bright}${text}${C.reset}\n`);
            this.inFlight = false;
            this.promptUser();
        }
    }
}

const cli = new WaHarnessCLI();
cli.start();
