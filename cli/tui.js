#!/usr/bin/env node

const readline = require("readline");
const fs = require("fs");
const qrcode = require("qrcode-terminal");
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
    gray: "\x1b[90m"
};

const BANNER = `
${C.cyan}${C.bright}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                      W A H A R N E S S  v1.0.4                   ┃
┃       Zero-Rated AI Agent Terminal • Isolated T450 Session       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${C.reset}
${C.gray}Engine: ${C.green}AGY (Gemini/Claude) & Hermes (DeepSeek)${C.gray} | Channel: ${C.blue}Isolated Self-Chat (!WAH_)${C.reset}
${C.gray}Workspace: ${C.yellow}${process.cwd()}${C.reset}
${C.dim}Type your coding request or /help for commands.${C.reset}
`;

class WaHarnessCLI {
    constructor() {
        this.cwd = process.cwd();
        this.activeModel = "agy";
        this.transport = new WhatsAppTransport();
        this.rl = null;
        this.inFlight = false;
        this.activeReqId = null;
    }

    async start() {
        console.clear();
        console.log(BANNER);
        process.stdout.write(`${C.yellow}⟳ Connecting to WhatsApp Zero-Rate Tunnel...${C.reset}\r`);

        this.transport.on("qr", (qr) => {
            console.log(`\n${C.yellow}Scan this QR code in WhatsApp -> Linked Devices:${C.reset}\n`);
            qrcode.generate(qr, { small: true });
        });

        this.transport.on("ready", (info) => {
            console.log(`\r${C.green}✓ Connected! Isolated Channel Target: ${info?.targetChat || this.transport.targetChat}${C.reset}       \n`);
            this.promptUser();
        });

        this.transport.on("disconnected", (data) => {
            if (data.shouldReconnect) {
                console.log(`\n${C.yellow}⚠ Transport connection dropped. Reconnecting...${C.reset}`);
            } else {
                console.log(`\n${C.red}✗ WhatsApp session logged out. Delete ~/.waharness/auth_info to re-pair.${C.reset}`);
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
            prompt: `${C.cyan}${C.bright}waharness${C.reset} ${C.gray}(${this.activeModel})${C.reset} ${C.dim}❯${C.reset} `
        });

        this.rl.on("line", async (line) => {
            const input = line.trim();
            if (!input) {
                this.promptUser();
                return;
            }

            if (input.startsWith("/")) {
                await this.handleSlashCommand(input);
                this.promptUser();
                return;
            }

            await this.dispatchPrompt(input);
        });

        this.rl.on("close", () => {
            console.log(`\n${C.cyan}Exiting WaHarness. Keep hacking!${C.reset}`);
            process.exit(0);
        });
    }

    updatePromptPrefix() {
        if (this.rl) {
            this.rl.setPrompt(`${C.cyan}${C.bright}waharness${C.reset} ${C.gray}(${this.activeModel})${C.reset} ${C.dim}❯${C.reset} `);
        }
    }

    promptUser() {
        if (this.rl && !this.inFlight) {
            this.updatePromptPrefix();
            this.rl.prompt();
        }
    }

    getTopLevelFiles() {
        try {
            return fs.readdirSync(this.cwd).slice(0, 40);
        } catch (_) {
            return [];
        }
    }

    async handleSlashCommand(cmd) {
        const parts = cmd.split(" ");
        const action = parts[0].toLowerCase();

        switch (action) {
            case "/help":
                console.log(`\n${C.bright}Available Commands:${C.reset}`);
                console.log(`  ${C.green}/model <name>${C.reset}    Switch engine (agy, deepseek-v4-pro, deepseek-flash)`);
                console.log(`  ${C.green}/new${C.reset}             Reset isolated T450 session for this workspace`);
                console.log(`  ${C.green}/status${C.reset}          Show connection, target JID, model, and auth path`);
                console.log(`  ${C.green}/exec <cmd>${C.reset}      Run a local Mac shell command directly`);
                console.log(`  ${C.green}/clear${C.reset}           Clear terminal screen`);
                console.log(`  ${C.green}/exit${C.reset}            Quit WaHarness\n`);
                break;
            case "/status":
                console.log(`\n${C.bright}WaHarness Status:${C.reset}`);
                console.log(`  Connected:  ${this.transport.connected ? C.green + "Online" : C.red + "Offline"}${C.reset}`);
                console.log(`  Target JID: ${C.blue}${this.transport.targetChat || "waiting"}${C.reset}`);
                console.log(`  Auth Dir:   ${C.gray}${this.transport.authDir}${C.reset}`);
                console.log(`  Model:      ${C.cyan}${this.activeModel}${C.reset}`);
                console.log(`  Workspace:  ${C.yellow}${this.cwd}${C.reset}\n`);
                break;
            case "/model":
                if (parts[1]) {
                    this.activeModel = parts[1].trim();
                    this.updatePromptPrefix();
                    console.log(`\n${C.green}✓ Active engine switched to: ${this.activeModel}${C.reset}\n`);
                } else {
                    console.log(`\n${C.yellow}Current model: ${this.activeModel}. Usage: /model <agy | deepseek-v4-pro | deepseek-flash>${C.reset}\n`);
                }
                break;
            case "/new":
                if (!this.transport.connected) {
                    console.log(`${C.red}Transport is offline.${C.reset}`);
                    return;
                }
                const reqId = Math.random().toString(36).substring(2, 10);
                this.inFlight = true;
                await this.transport.sendMessage("!WAH_CMD:" + JSON.stringify({
                    id: reqId,
                    cmd: "new",
                    cwd: this.cwd
                }));
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
                const res = await executeCommand(localCmd, this.cwd);
                if (res.out) console.log(res.out.trim());
                if (res.err) console.error(C.red + res.err.trim() + C.reset);
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
            this.promptUser();
            return;
        }

        this.inFlight = true;
        const reqId = Math.random().toString(36).substring(2, 10);
        this.activeReqId = reqId;

        console.log(`\n${C.magenta}⚡ [Sending to T450 Isolated Session (${this.activeModel})...]${C.reset}`);

        const packet = "!WAH_PROMPT:" + JSON.stringify({
            id: reqId,
            prompt: userPrompt,
            cwd: this.cwd,
            model: this.activeModel,
            files: this.getTopLevelFiles(),
            ts: Math.floor(Date.now() / 1000)
        });

        try {
            await this.transport.sendMessage(packet);
        } catch (e) {
            console.log(`${C.red}Failed to send prompt over WhatsApp: ${e.message}${C.reset}`);
            this.inFlight = false;
            this.promptUser();
        }
    }

    async handleInbound({ text }) {
        // 1. Remote Mac Tool Execution Request from T450 Brain
        if (text.startsWith("!WAH_TOOL_REQ:") || text.startsWith("!CLI_TOOL_REQ:")) {
            const pfx = text.startsWith("!WAH_") ? "!WAH_" : "!CLI_";
            const rawJson = text.split(/:(.+)/s)[1] || "{}";
            try {
                const req = JSON.parse(rawJson.trim());
                const detail = req.cmd || req.path || ".";
                console.log(`\n${C.blue}⚙ [Mac Tool] ${C.bright}${req.action}${C.reset} ${C.gray}${detail}${C.reset}`);

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

                // Cap large output payloads to keep WhatsApp packets fast and reliable
                if (result.out && result.out.length > 12000) {
                    result.out = result.out.slice(0, 12000) + "\n...[truncated]...";
                }
                if (result.content && result.content.length > 12000) {
                    result.content = result.content.slice(0, 12000) + "\n...[truncated]...";
                }

                const statusLabel = result.error ? `${C.red}ERR` : `${C.green}OK`;
                console.log(`  ${statusLabel}${C.reset} ${C.dim}(${result.dur || 0}s)${C.reset}`);

                const replyPkt = `${pfx}TOOL_RES:` + JSON.stringify({
                    id: req.id,
                    result: result
                });
                await this.transport.sendMessage(replyPkt);
            } catch (e) {
                console.error(C.red + "[Tool Error] " + e.message + C.reset);
            }
            return;
        }

        // 2. Live Status / Streaming Update from T450 Brain
        if (text.startsWith("!WAH_STREAM:")) {
            try {
                const data = JSON.parse(text.substring("!WAH_STREAM:".length).trim());
                if (data.status) {
                    console.log(`${C.dim}  ↳ ${data.status}${C.reset}`);
                } else if (data.chunk) {
                    process.stdout.write(data.chunk);
                }
            } catch (_) {
                process.stdout.write(text.substring("!WAH_STREAM:".length));
            }
            return;
        }

        // 3. Final Response from T450 Brain
        if (text.startsWith("!WAH_DONE:")) {
            try {
                const data = JSON.parse(text.substring("!WAH_DONE:".length).trim());
                if (data.text) {
                    console.log(`\n${C.bright}${data.text}${C.reset}`);
                }
                console.log(`\n${C.green}✓ [Completed in ${data.dur || 0}s]${C.reset}\n`);
            } catch (e) {
                console.log(`\n${text.substring("!WAH_DONE:".length)}\n`);
            }
            this.inFlight = false;
            this.promptUser();
            return;
        }
    }
}

const cli = new WaHarnessCLI();
cli.start();
