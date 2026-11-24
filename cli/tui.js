#!/usr/bin/env node

const readline = require("readline");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WhatsAppTransport = require("./transport");
const { executeCommand, readFile, writeFile, listDirectory } = require("./tools");

let qrcode = null;
try {
    qrcode = require("qrcode-terminal");
} catch (_) {}

// OpenCode Color Palette
const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    italic: "\x1b[3m",
    white: "\x1b[97m",
    gray: "\x1b[90m",
    slate: "\x1b[38;5;244m",
    darkGray: "\x1b[38;5;238m",
    amber: "\x1b[38;5;214m",
    cyan: "\x1b[38;5;81m",
    green: "\x1b[38;5;114m",
    purple: "\x1b[38;5;141m",
    red: "\x1b[38;5;203m",
    yellow: "\x1b[38;5;221m"
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function shortPath(p) {
    const home = os.homedir();
    if (p === home) return "~";
    if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
    return p;
}

function renderOpenCodeHeader(cwd, model, connected) {
    const statusDot = connected ? `${C.green}●${C.reset}` : `${C.amber}◌${C.reset}`;
    const ws = shortPath(cwd);
    return [
        "",
        `  ${C.slate}█░█░█ ▄▀█ ${C.white}${C.bold}█░█ ▄▀█ █▀█ █▄░█ █▀▀ █▀ █▀${C.reset}   ${C.darkGray}v1.0.6${C.reset}`,
        `  ${C.slate}▀▄▀▄▀ █▀█ ${C.white}${C.bold}█▀█ █▀█ █▀▄ █░▀█ ██▄ ▄█ ▄█${C.reset}   ${statusDot} ${C.slate}zero-rate tunnel${C.reset}`,
        "",
        `  ${C.darkGray}┌──────────────────────────────────────────────────────────────┐${C.reset}`,
        `  ${C.darkGray}│${C.reset} ${C.slate}Workspace${C.reset}  ${C.white}${ws.padEnd(49)}${C.reset} ${C.darkGray}│${C.reset}`,
        `  ${C.darkGray}│${C.reset} ${C.slate}Agent    ${C.reset}  ${C.amber}▣ ${model.padEnd(47)}${C.reset} ${C.darkGray}│${C.reset}`,
        `  ${C.darkGray}│${C.reset} ${C.slate}Commands ${C.reset}  ${C.gray}/models  /new  /status  /exec  /clear  /exit     ${C.reset} ${C.darkGray}│${C.reset}`,
        `  ${C.darkGray}└──────────────────────────────────────────────────────────────┘${C.reset}`,
        ""
    ].join("\n");
}

function formatMarkdownLines(text) {
    const rawLines = (text || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let inCode = false;
    let codeLang = "";

    for (const line of rawLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("```")) {
            if (!inCode) {
                inCode = true;
                codeLang = trimmed.slice(3).trim() || "code";
                out.push(`  ${C.purple}┃${C.reset}  ${C.darkGray}┌── ${C.slate}${codeLang}${C.darkGray} ────────────────────────────────────────${C.reset}`);
            } else {
                inCode = false;
                out.push(`  ${C.purple}┃${C.reset}  ${C.darkGray}└────────────────────────────────────────────────────${C.reset}`);
            }
            continue;
        }

        if (inCode) {
            out.push(`  ${C.purple}┃${C.reset}  ${C.darkGray}│${C.reset} ${C.cyan}${line}${C.reset}`);
            continue;
        }

        let formatted = line;
        if (/^#{1,3}\s+/.test(formatted)) {
            formatted = `${C.amber}${C.bold}${formatted.replace(/^#{1,3}\s+/, "")}${C.reset}`;
        } else {
            formatted = formatted.replace(/\*\*([^*]+)\*\*/g, `${C.white}${C.bold}$1${C.reset}`);
            formatted = formatted.replace(/`([^`]+)`/g, `${C.cyan}$1${C.reset}`);
            if (/^\s*[-*]\s+/.test(formatted)) {
                formatted = formatted.replace(/^(\s*)[-*]\s+/, `$1${C.amber}•${C.reset} `);
            }
        }
        out.push(`  ${C.purple}┃${C.reset}  ${formatted}`);
    }
    return out.join("\n");
}

class WaHarnessCLI {
    constructor() {
        this.cwd = process.cwd();
        this.activeModel = "agy";
        this.transport = new WhatsAppTransport();
        this.rl = null;
        this.inFlight = false;
        this.activeReq = null;
        this.completedIds = new Set();
        this.pollTimer = null;
        this.spinnerTimer = null;
        this.spinnerFrame = 0;
        this.spinnerStart = 0;
        this.spinnerStatus = "Thinking...";
    }

    startSpinner(statusText = "Thinking...") {
        this.stopSpinner();
        this.spinnerStatus = statusText;
        this.spinnerStart = Date.now();
        this.spinnerFrame = 0;

        // Pause readline during spinner so accidental arrow keys don't echo or split spinner lines
        if (this.rl) {
            try {
                this.rl.pause();
            } catch (_) {}
        }

        const render = () => {
            const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
            this.spinnerFrame++;
            const elapsed = ((Date.now() - this.spinnerStart) / 1000).toFixed(1);
            process.stdout.write(
                `\r\x1b[2K  ${C.purple}┃${C.reset}  ${C.amber}${frame}${C.reset} ${C.slate}${this.spinnerStatus}${C.reset} ${C.darkGray}(${elapsed}s · esc to cancel)${C.reset}`
            );
        };
        render();
        this.spinnerTimer = setInterval(render, 80);
    }

    updateSpinner(statusText) {
        this.spinnerStatus = statusText;
    }

    stopSpinner() {
        if (this.spinnerTimer) {
            clearInterval(this.spinnerTimer);
            this.spinnerTimer = null;
            process.stdout.write("\r\x1b[2K");
        }
    }

    clearPollTimer() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    startPollWatchdog() {
        this.clearPollTimer();
        // Every 9s while inFlight, send a lightweight !WAH_POLL: packet in case
        // a Signal ratchet or background socket reconnect dropped a packet.
        this.pollTimer = setInterval(async () => {
            if (!this.inFlight || !this.activeReq || !this.transport.connected) return;
            try {
                await this.transport.sendMessage("!WAH_POLL:" + JSON.stringify(this.activeReq));
            } catch (_) {}
        }, 9000);
    }

    async start() {
        console.clear();
        console.log(renderOpenCodeHeader(this.cwd, this.activeModel, false));
        this.startSpinner("Connecting to zero-rate WhatsApp tunnel...");

        this.transport.on("qr", (qr) => {
            this.stopSpinner();
            console.log(`\n  ${C.amber}Scan QR code in WhatsApp -> Linked Devices:${C.reset}\n`);
            if (qrcode) qrcode.generate(qr, { small: true });
        });

        this.transport.on("ready", async ({ isFirst }) => {
            if (isFirst) {
                this.stopSpinner();
                console.clear();
                console.log(renderOpenCodeHeader(this.cwd, this.activeModel, true));
                this.setupReadline();
                this.promptUser();
            } else if (this.inFlight && this.activeReq) {
                // Immediately poll after a background reconnect so any missed DONE packet is recovered
                setTimeout(async () => {
                    if (this.inFlight && this.activeReq && this.transport.connected) {
                        try {
                            await this.transport.sendMessage("!WAH_POLL:" + JSON.stringify(this.activeReq));
                        } catch (_) {}
                    }
                }, 800);
            }
        });

        this.transport.on("disconnected", ({ shouldReconnect }) => {
            if (!shouldReconnect) {
                this.stopSpinner();
                this.clearPollTimer();
                console.log(`\n  ${C.red}✗ Session logged out. Delete ~/.waharness/auth_info to re-pair.${C.reset}\n`);
            }
        });

        this.transport.on("message", (msg) => this.handleInbound(msg));

        await this.transport.init();
    }

    getPromptString() {
        const ws = path.basename(this.cwd) || "~";
        return `  ${C.amber}▣${C.reset} ${C.slate}${this.activeModel}${C.reset} ${C.darkGray}·${C.reset} ${C.gray}${ws}${C.reset} ${C.white}${C.bold}❯${C.reset} `;
    }

    setupReadline() {
        if (this.rl) return;
        readline.emitKeypressEvents(process.stdin);

        // Allow Esc key to cancel an in-flight turn cleanly
        process.stdin.on("keypress", (str, key) => {
            if (this.inFlight && key && key.name === "escape") {
                this.clearPollTimer();
                this.stopSpinner();
                if (this.activeReq && this.activeReq.id) {
                    this.completedIds.add(this.activeReq.id);
                }
                this.activeReq = null;
                this.inFlight = false;
                console.log(`  ${C.purple}╹${C.reset}${C.red}✗${C.reset}  ${C.slate}Cancelled${C.reset}\n`);
                this.promptUser();
            }
        });

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: this.getPromptString()
        });

        this.rl.on("line", async (line) => {
            if (this.inFlight) return;
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
            this.clearPollTimer();
            this.stopSpinner();
            console.log(`\n  ${C.slate}Session closed.${C.reset}\n`);
            process.exit(0);
        });
    }

    promptUser() {
        if (this.rl && !this.inFlight) {
            try {
                this.rl.resume();
            } catch (_) {}
            this.rl.setPrompt(this.getPromptString());
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

    async waitForConnection(maxWaitMs = 8000) {
        const start = Date.now();
        while (!this.transport.connected && Date.now() - start < maxWaitMs) {
            await new Promise((r) => setTimeout(r, 250));
        }
        return this.transport.connected;
    }

    async handleSlashCommand(cmd) {
        const parts = cmd.split(/\s+/);
        const action = parts[0].toLowerCase();

        switch (action) {
            case "/help":
                console.log([
                    "",
                    `  ${C.white}${C.bold}Commands${C.reset}`,
                    `  ${C.amber}/models${C.reset} ${C.slate}or${C.reset} ${C.amber}/model <id>${C.reset}   Switch agent engine (agy, deepseek-v4-pro, deepseek-flash)`,
                    `  ${C.amber}/new${C.reset}                     Start a fresh isolated session for this workspace`,
                    `  ${C.amber}/status${C.reset}                  Inspect tunnel connection, JID, and workspace`,
                    `  ${C.amber}/exec <cmd>${C.reset}              Execute a local macOS shell command`,
                    `  ${C.amber}/clear${C.reset}                   Clear terminal view`,
                    `  ${C.amber}/exit${C.reset}                    Exit WaHarness`,
                    ""
                ].join("\n"));
                break;

            case "/models":
            case "/model":
                if (parts[1]) {
                    this.activeModel = parts[1].trim();
                    console.log(`\n  ${C.green}✓${C.reset} ${C.slate}Switched agent model to${C.reset} ${C.white}${C.bold}${this.activeModel}${C.reset}\n`);
                } else {
                    const models = [
                        ["agy", "Google Antigravity (Gemini / Claude Sonnet) [Isolated T450]"],
                        ["deepseek-v4-pro", "Hermes DeepSeek V4 Pro [Isolated T450]"],
                        ["deepseek-flash", "Hermes DeepSeek V4.1 Flash [Isolated T450]"]
                    ];
                    console.log(`\n  ${C.white}${C.bold}Available Models${C.reset}`);
                    for (const [id, desc] of models) {
                        const mark = id === this.activeModel ? `${C.amber}●${C.reset}` : ` `;
                        console.log(`  ${mark} ${C.white}${id.padEnd(18)}${C.reset} ${C.slate}${desc}${C.reset}`);
                    }
                    console.log(`\n  ${C.darkGray}Use /model <name> to switch.${C.reset}\n`);
                }
                break;

            case "/status":
                console.log([
                    "",
                    `  ${C.white}${C.bold}Session Status${C.reset}`,
                    `  ${C.slate}Tunnel   ${C.reset}  ${this.transport.connected ? C.green + "● connected" : C.amber + "◌ reconnecting"}${C.reset}`,
                    `  ${C.slate}Channel  ${C.reset}  ${C.white}${this.transport.targetChat || "self-chat"} (!WAH_ isolated)${C.reset}`,
                    `  ${C.slate}Agent    ${C.reset}  ${C.amber}${this.activeModel}${C.reset}`,
                    `  ${C.slate}Workspace${C.reset}  ${C.white}${this.cwd}${C.reset}`,
                    `  ${C.slate}Auth     ${C.reset}  ${C.gray}${this.transport.authDir}${C.reset}`,
                    ""
                ].join("\n"));
                break;

            case "/new":
                if (!(await this.waitForConnection())) {
                    console.log(`\n  ${C.red}✗ Tunnel offline.${C.reset}\n`);
                    return;
                }
                const reqId = Math.random().toString(36).substring(2, 10);
                this.inFlight = true;
                this.activeReq = { id: reqId, cmd: "new", cwd: this.cwd };
                console.log("");
                this.startSpinner("Resetting workspace session...");
                await this.transport.sendMessage("!WAH_CMD:" + JSON.stringify(this.activeReq));
                break;

            case "/clear":
                console.clear();
                console.log(renderOpenCodeHeader(this.cwd, this.activeModel, this.transport.connected));
                break;

            case "/exec":
                const localCmd = cmd.slice(action.length).trim();
                if (!localCmd) {
                    console.log(`\n  ${C.slate}Usage: /exec <command>${C.reset}\n`);
                    return;
                }
                console.log(`\n  ${C.darkGray}┃${C.reset} ${C.slate}$ ${localCmd}${C.reset}`);
                const res = await executeCommand(localCmd, this.cwd);
                if (res.out) {
                    for (const l of res.out.trimEnd().split("\n")) {
                        console.log(`  ${C.darkGray}┃${C.reset} ${l}`);
                    }
                }
                if (res.err) {
                    for (const l of res.err.trimEnd().split("\n")) {
                        console.log(`  ${C.darkGray}┃${C.reset} ${C.red}${l}${C.reset}`);
                    }
                }
                console.log("");
                break;

            case "/exit":
            case "/quit":
                this.rl.close();
                break;

            default:
                console.log(`\n  ${C.red}Unknown command:${C.reset} ${action}. Type ${C.amber}/help${C.reset} for commands.\n`);
                break;
        }
    }

    async dispatchPrompt(userPrompt) {
        process.stdout.write("\x1b[1A\r\x1b[2K");
        console.log(`  ${C.amber}┃${C.reset}  ${C.white}${C.bold}${userPrompt}${C.reset}`);
        console.log(`  ${C.purple}┃${C.reset}`);

        this.inFlight = true;
        this.startSpinner(`Thinking (${this.activeModel})...`);

        if (!(await this.waitForConnection(8000))) {
            this.stopSpinner();
            console.log(`  ${C.purple}┃${C.reset}  ${C.red}✗ Tunnel is currently offline. Please wait a moment and try again.${C.reset}\n`);
            this.inFlight = false;
            this.promptUser();
            return;
        }

        const reqId = Math.random().toString(36).substring(2, 10);
        this.activeReq = {
            id: reqId,
            prompt: userPrompt,
            cwd: this.cwd,
            model: this.activeModel,
            files: this.getTopLevelFiles(),
            ts: Math.floor(Date.now() / 1000)
        };

        this.startPollWatchdog();

        try {
            await this.transport.sendMessage("!WAH_PROMPT:" + JSON.stringify(this.activeReq));
        } catch (e) {
            this.clearPollTimer();
            this.stopSpinner();
            console.log(`  ${C.purple}┃${C.reset}  ${C.red}✗ Send failed: ${e.message}${C.reset}\n`);
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
                if (this.completedIds.has(`tool_${req.id}`)) return;
                this.completedIds.add(`tool_${req.id}`);

                const detail = req.cmd || req.path || ".";
                this.updateSpinner(`Running ${req.action}: ${detail}`);

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

                if (result.out && result.out.length > 12000) {
                    result.out = result.out.slice(0, 12000) + "\n...[truncated]...";
                }
                if (result.content && result.content.length > 12000) {
                    result.content = result.content.slice(0, 12000) + "\n...[truncated]...";
                }

                this.stopSpinner();
                const badge = result.error ? `${C.red}✗` : `${C.green}✓`;
                const dur = result.dur ? ` ${C.darkGray}(${result.dur}s)${C.reset}` : "";
                console.log(`  ${C.purple}┃${C.reset}  ${badge} ${C.slate}${req.action}${C.reset} ${C.gray}${detail}${C.reset}${dur}`);
                this.startSpinner(`Thinking (${this.activeModel})...`);

                const replyPkt = `${pfx}TOOL_RES:` + JSON.stringify({
                    id: req.id,
                    result: result
                });
                await this.transport.sendMessage(replyPkt);
            } catch (e) {
                this.stopSpinner();
                console.log(`  ${C.purple}┃${C.reset}  ${C.red}✗ Tool error: ${e.message}${C.reset}`);
                this.startSpinner(`Thinking (${this.activeModel})...`);
            }
            return;
        }

        // 2. Final Response from T450 Brain
        if (text.startsWith("!WAH_DONE:")) {
            try {
                const data = JSON.parse(text.substring("!WAH_DONE:".length).trim());
                if (data.id && this.completedIds.has(data.id)) {
                    return;
                }
                if (data.id) {
                    this.completedIds.add(data.id);
                }
                this.clearPollTimer();
                this.stopSpinner();
                if (data.text) {
                    console.log(formatMarkdownLines(data.text));
                }
                console.log(`  ${C.purple}╹${C.reset}${C.amber}▣${C.reset}  ${C.slate}${data.model || this.activeModel}${C.reset} ${C.darkGray}· ${data.dur || 0}s${C.reset}\n`);
            } catch (e) {
                this.clearPollTimer();
                this.stopSpinner();
                console.log(`  ${C.purple}┃${C.reset}  ${text.substring("!WAH_DONE:".length)}\n`);
            }
            this.activeReq = null;
            this.inFlight = false;
            this.promptUser();
            return;
        }
    }
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log("waharness 1.0.6");
    process.exit(0);
}

const cli = new WaHarnessCLI();
cli.start();
