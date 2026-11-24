#!/usr/bin/env node

const readline = require("readline");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WhatsAppTransport = require("./transport");
const { executeCommand, readFile, writeFile, editFile, undoLastEdit, listDirectory } = require("./tools");

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
    shadowBg: "\x1b[48;5;236m",
    shadowFg: "\x1b[38;5;236m",
    selectBg: "\x1b[48;5;237m",
    amber: "\x1b[38;5;214m",
    cyan: "\x1b[38;5;81m",
    green: "\x1b[38;5;114m",
    purple: "\x1b[38;5;141m",
    red: "\x1b[38;5;203m",
    yellow: "\x1b[38;5;221m"
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// All 29 Live T450 Models (27 Google AGY CLI models + 2 Hermes DeepSeek models)
const MODEL_CATALOG = [
    // Google Gemini 4
    { id: "gemini-4-argon-medium", label: "Gemini 4 Argon (Medium)", group: "Google Gemini 4" },
    { id: "gemini-4-argon-high", label: "Gemini 4 Argon (High)", group: "Google Gemini 4" },
    { id: "gemini-4-argon-low", label: "Gemini 4 Argon (Low)", group: "Google Gemini 4" },
    { id: "gemini-4-neon-high", label: "Gemini 4 Neon (High)", group: "Google Gemini 4" },
    { id: "gemini-4-neon-xhigh", label: "Gemini 4 Neon (XHigh)", group: "Google Gemini 4" },
    { id: "gemini-4-neon-medium", label: "Gemini 4 Neon (Medium)", group: "Google Gemini 4" },
    { id: "gemini-4-neon-low", label: "Gemini 4 Neon (Low)", group: "Google Gemini 4" },
    { id: "gemini-4-carbon-high", label: "Gemini 4 Carbon (High)", group: "Google Gemini 4" },
    { id: "gemini-4-carbon-medium", label: "Gemini 4 Carbon (Medium)", group: "Google Gemini 4" },
    { id: "gemini-4-carbon-low", label: "Gemini 4 Carbon (Low)", group: "Google Gemini 4" },
    { id: "gemini-4-hydrogen-high", label: "Gemini 4 Hydrogen (High)", group: "Google Gemini 4" },
    { id: "gemini-4-hydrogen-xhigh", label: "Gemini 4 Hydrogen (XHigh)", group: "Google Gemini 4" },
    { id: "gemini-4-hydrogen-medium", label: "Gemini 4 Hydrogen (Medium)", group: "Google Gemini 4" },
    { id: "gemini-4-hydrogen-low", label: "Gemini 4 Hydrogen (Low)", group: "Google Gemini 4" },
    { id: "gemini-pro-orchestrator-neon", label: "Orchestrator (Neon)", group: "Google Gemini 4" },
    { id: "gemini-pro-orchestrator", label: "Orchestrator (Carbon)", group: "Google Gemini 4" },
    { id: "gemini-pro-orchestrator-argon", label: "Orchestrator (Argon)", group: "Google Gemini 4" },
    { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", group: "Google Gemini 3.8" },
    { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)", group: "Google Gemini 3.8" },
    { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", group: "Google Gemini 3.8" },
    // Anthropic Claude 5.5 (via AGY)
    { id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)", group: "Anthropic Claude 5.5" },
    { id: "claude-opus-5-5-medium", label: "Claude Opus 5.5 (Medium)", group: "Anthropic Claude 5.5" },
    { id: "claude-opus-5-5-low", label: "Claude Opus 5.5 (Low)", group: "Anthropic Claude 5.5" },
    { id: "claude-sonnet-5-5-high", label: "Claude Sonnet 5.5 (High)", group: "Anthropic Claude 5.5" },
    { id: "claude-sonnet-5-5-medium", label: "Claude Sonnet 5.5 (Medium)", group: "Anthropic Claude 5.5" },
    { id: "claude-sonnet-5-5-low", label: "Claude Sonnet 5.5 (Low)", group: "Anthropic Claude 5.5" },
    // Hermes DeepSeek
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (Hermes)", group: "Hermes DeepSeek" },
    { id: "deepseek-flash", label: "DeepSeek V4.1 Flash (Hermes)", group: "Hermes DeepSeek" },
    // OpenAI OSS
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", group: "OpenAI OSS" }
];

// OpenCode 3D Shadow Logo Matrix (adapted directly from packages/tui/src/logo.ts & component/logo.tsx)
const WAH_LOGO = {
    left: [
        "█___█ ▄▀▀▀▄",
        "█_▄_█ █▀▀▀█",
        "▀~~~▀ ▀~~~▀"
    ],
    right: [
        "█___█ ▄▀▀▀▄ █▀▀▀▄ █▀▀▀▄ █▀▀▀ █▀▀▀ █▀▀▀",
        "█▀▀▀█ █▀▀▀█ █▀▀▀▄ █___█ █^^^ ▀▀▀█ ▀▀▀█",
        "▀~~~▀ ▀~~~▀ ▀~~~▀ ▀~~~▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"
    ]
};

function renderShadowLogoRow(line, fgColor, isBold) {
    const b = isBold ? C.bold : "";
    let out = "";
    for (const ch of line) {
        if (ch === "_") {
            out += `${C.shadowBg}${fgColor}${b} ${C.reset}`;
        } else if (ch === "^") {
            out += `${C.shadowBg}${fgColor}${b}▀${C.reset}`;
        } else if (ch === "~") {
            out += `${C.shadowFg}${b}▀${C.reset}`;
        } else {
            out += `${fgColor}${b}${ch}${C.reset}`;
        }
    }
    return out;
}

function shortPath(p) {
    const home = os.homedir();
    if (p === home) return "~";
    if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
    return p;
}

function renderOpenCodeHeader(cwd, model, mode, connected) {
    const statusDot = connected ? `${C.green}●${C.reset}` : `${C.amber}◌${C.reset}`;
    const ws = shortPath(cwd);
    const modeBadge = mode === "plan" ? `${C.cyan}◈ plan (read-only)` : `${C.amber}▣ build`;
    const logoRows = WAH_LOGO.left.map((leftRow, idx) => {
        const l = renderShadowLogoRow(leftRow, C.slate, false);
        const r = renderShadowLogoRow(WAH_LOGO.right[idx], C.white, true);
        const meta = idx === 0
            ? `   ${C.darkGray}v1.1.0${C.reset}`
            : idx === 1
                ? `   ${statusDot} ${C.slate}zero-rate tunnel${C.reset}`
                : "";
        return `  ${l} ${r}${meta}`;
    });

    return [
        "",
        ...logoRows,
        "",
        `  ${C.darkGray}┌────────────────────────────────────────────────────────────────────┐${C.reset}`,
        `  ${C.darkGray}│${C.reset} ${C.slate}Workspace${C.reset}  ${C.white}${ws.padEnd(55)}${C.reset} ${C.darkGray}│${C.reset}`,
        `  ${C.darkGray}│${C.reset} ${C.slate}Model    ${C.reset}  ${C.white}${model.padEnd(36)}${C.reset} ${modeBadge.padEnd(28)}${C.reset} ${C.darkGray}│${C.reset}`,
        `  ${C.darkGray}│${C.reset} ${C.slate}Shortcuts${C.reset}  ${C.gray}/model  /mode  /cd  /undo  /new  !cmd  @file  /exit    ${C.reset} ${C.darkGray}│${C.reset}`,
        `  ${C.darkGray}└────────────────────────────────────────────────────────────────────┘${C.reset}`,
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
        this.activeModel = "gemini-4-argon-medium";
        this.mode = "build"; // "build" | "plan"
        this.transport = new WhatsAppTransport();
        this.rl = null;
        this.inFlight = false;
        this.inModal = false;
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

        if (this.rl) {
            try {
                this.rl.pause();
            } catch (_) {}
        }

        const render = () => {
            const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
            this.spinnerFrame++;
            const elapsed = ((Date.now() - this.spinnerStart) / 1000).toFixed(1);
            const cols = process.stdout.columns || 80;
            const suffix = ` (${elapsed}s · esc to cancel)`;
            const maxStatusLen = Math.max(16, cols - suffix.length - 10);
            const cleanStatus = String(this.spinnerStatus || "").replace(/\s+/g, " ").trim();
            const clippedStatus = cleanStatus.length > maxStatusLen
                ? cleanStatus.slice(0, maxStatusLen - 1) + "…"
                : cleanStatus;
            process.stdout.write(
                `\r\x1b[2K  ${C.purple}┃${C.reset}  ${C.amber}${frame}${C.reset} ${C.slate}${clippedStatus}${C.reset}${C.darkGray}${suffix}${C.reset}`
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
        this.pollTimer = setInterval(async () => {
            if (!this.inFlight || !this.activeReq || !this.transport.connected) return;
            try {
                await this.transport.sendMessage("!WAH_POLL:" + JSON.stringify(this.activeReq));
            } catch (_) {}
        }, 9000);
    }

    async start() {
        console.clear();
        console.log(renderOpenCodeHeader(this.cwd, this.activeModel, this.mode, false));
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
                console.log(renderOpenCodeHeader(this.cwd, this.activeModel, this.mode, true));
                this.setupReadline();
                this.promptUser();
            } else if (this.inFlight && this.activeReq) {
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
        const badge = this.mode === "plan" ? `${C.cyan}◈ plan${C.reset}` : `${C.amber}▣ build${C.reset}`;
        return `  ${badge} ${C.darkGray}·${C.reset} ${C.slate}${this.activeModel}${C.reset} ${C.darkGray}·${C.reset} ${C.gray}${ws}${C.reset} ${C.white}${C.bold}❯${C.reset} `;
    }

    setupReadline() {
        if (this.rl) return;
        readline.emitKeypressEvents(process.stdin);

        process.stdin.on("keypress", (str, key) => {
            if (this.inModal) return;
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
            if (this.inFlight || this.inModal) return;
            const input = line.trim();
            if (!input) {
                this.promptUser();
                return;
            }

            // OpenCode '!<cmd>' quick shell shortcut
            if (input.startsWith("!") && input.length > 1) {
                const shellCmd = input.slice(1).trim();
                await this.runLocalShell(shellCmd);
                this.promptUser();
                return;
            }

            if (input.startsWith("/")) {
                await this.handleSlashCommand(input);
                if (!this.inModal && !this.inFlight) {
                    this.promptUser();
                }
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
        if (this.rl && !this.inFlight && !this.inModal) {
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

    resolveInlineMentions(promptText) {
        // Parse OpenCode-style @filepath tokens and bundle their file contents
        const attachments = {};
        const regex = /(?:^|\s)@([A-Za-z0-9_./-]+)/g;
        let match;
        while ((match = regex.exec(promptText)) !== null) {
            const rel = match[1];
            const full = path.isAbsolute(rel) ? rel : path.join(this.cwd, rel);
            try {
                if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                    const content = fs.readFileSync(full, "utf-8");
                    attachments[rel] = content.length > 8000
                        ? content.slice(0, 8000) + "\n...[truncated]..."
                        : content;
                }
            } catch (_) {}
        }
        return attachments;
    }

    async runLocalShell(localCmd) {
        console.log(`\n  ${C.darkGray}┃${C.reset} ${C.amber}$ ${localCmd}${C.reset}`);
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
        console.log(`  ${C.darkGray}╹${C.reset} ${C.slate}exit ${res.code} · ${res.dur}s${C.reset}\n`);
    }

    findModelByQuery(query) {
        const q = String(query || "").trim().toLowerCase();
        if (!q) return null;
        if (q === "agy" || q === "default") return { id: "gemini-4-argon-medium", label: "Gemini 4 Argon (Medium)" };
        if (q === "hermes" || q === "deepseek") return MODEL_CATALOG.find((m) => m.id === "deepseek-v4-pro");
        // Number index 1..29
        if (/^\d+$/.test(q)) {
            const idx = parseInt(q, 10) - 1;
            if (idx >= 0 && idx < MODEL_CATALOG.length) return MODEL_CATALOG[idx];
        }
        // Exact match
        const exact = MODEL_CATALOG.find((m) => m.id.toLowerCase() === q);
        if (exact) return exact;
        // Fuzzy substring match
        return MODEL_CATALOG.find(
            (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
        );
    }

    openInteractiveModelPicker() {
        if (!process.stdin.isTTY) {
            this.printStaticModelCatalog();
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.inModal = true;
            if (this.rl) {
                try {
                    this.rl.pause();
                } catch (_) {}
            }

            let cursor = Math.max(0, MODEL_CATALOG.findIndex((m) => m.id === this.activeModel));
            const pageSize = 12;
            let drawnLines = 0;

            const renderModal = () => {
                if (drawnLines > 0) {
                    process.stdout.write(`\x1b[${drawnLines}A\r\x1b[J`);
                }
                const start = Math.max(0, Math.min(cursor - Math.floor(pageSize / 2), MODEL_CATALOG.length - pageSize));
                const end = Math.min(MODEL_CATALOG.length, start + pageSize);

                const lines = [
                    "",
                    `  ${C.darkGray}┌── ${C.white}${C.bold}Select Model (${MODEL_CATALOG.length} available on T450)${C.reset}${C.darkGray} ── ↑/↓ move · Enter select · Esc close ──┐${C.reset}`
                ];

                for (let i = start; i < end; i++) {
                    const item = MODEL_CATALOG[i];
                    const num = String(i + 1).padStart(2, " ");
                    const isCurrent = item.id === this.activeModel;
                    const isSelected = i === cursor;
                    const dot = isCurrent ? `${C.amber}●${C.reset}` : " ";
                    const pointer = isSelected ? `${C.amber}❯${C.reset}` : " ";
                    const rowBg = isSelected ? C.selectBg : "";
                    const idColor = isSelected ? `${C.white}${C.bold}` : C.slate;
                    const lblColor = isSelected ? C.cyan : C.gray;
                    lines.push(
                        `  ${C.darkGray}│${C.reset} ${rowBg}${pointer} ${C.darkGray}${num}.${C.reset}${rowBg} ${dot} ${idColor}${item.id.padEnd(29)}${C.reset}${rowBg} ${lblColor}${item.label.padEnd(28)}${C.reset} ${C.darkGray}│${C.reset}`
                    );
                }

                lines.push(
                    `  ${C.darkGray}└── ${C.slate}Showing ${start + 1}-${end} of ${MODEL_CATALOG.length} · Tip: /model <number|name> switches directly${C.darkGray} ──────────┘${C.reset}`,
                    ""
                );

                const output = lines.join("\n");
                drawnLines = lines.length - 1;
                process.stdout.write(output);
            };

            const onKey = (str, key) => {
                if (!key) return;
                if (key.name === "up" || key.name === "k") {
                    cursor = (cursor - 1 + MODEL_CATALOG.length) % MODEL_CATALOG.length;
                    renderModal();
                } else if (key.name === "down" || key.name === "j") {
                    cursor = (cursor + 1) % MODEL_CATALOG.length;
                    renderModal();
                } else if (key.name === "return" || key.name === "enter") {
                    cleanup();
                    const picked = MODEL_CATALOG[cursor];
                    this.activeModel = picked.id;
                    console.log(`  ${C.green}✓${C.reset} ${C.slate}Model set to${C.reset} ${C.white}${C.bold}${picked.id}${C.reset} ${C.gray}(${picked.label})${C.reset}\n`);
                    this.promptUser();
                    resolve();
                } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
                    cleanup();
                    console.log(`  ${C.slate}Model selection unchanged (${this.activeModel}).${C.reset}\n`);
                    this.promptUser();
                    resolve();
                }
            };

            const cleanup = () => {
                process.stdin.removeListener("keypress", onKey);
                if (drawnLines > 0) {
                    process.stdout.write(`\x1b[${drawnLines}A\r\x1b[J`);
                }
                this.inModal = false;
            };

            process.stdin.on("keypress", onKey);
            renderModal();
        });
    }

    printStaticModelCatalog() {
        console.log(`\n  ${C.white}${C.bold}Available T450 Models (${MODEL_CATALOG.length})${C.reset}`);
        MODEL_CATALOG.forEach((m, i) => {
            const mark = m.id === this.activeModel ? `${C.amber}●${C.reset}` : " ";
            const num = String(i + 1).padStart(2, " ");
            console.log(`  ${C.darkGray}${num}.${C.reset} ${mark} ${C.white}${m.id.padEnd(29)}${C.reset} ${C.slate}${m.label}${C.reset}`);
        });
        console.log(`\n  ${C.darkGray}Use /model <number or name> to switch.${C.reset}\n`);
    }

    async waitForConnection(maxWaitMs = 8000) {
        const start = Date.now();
        while (!this.transport.connected && Date.now() - start < maxWaitMs) {
            await new Promise((r) => setTimeout(r, 250));
        }
        return this.transport.connected;
    }

    async handleSlashCommand(cmd) {
        const parts = cmd.trim().split(/\s+/);
        // Strip trailing dots/punctuation so "/model.." resolves cleanly to "/model"
        const action = parts[0].toLowerCase().replace(/\.+$/, "");
        const arg = parts.slice(1).join(" ").trim();

        switch (action) {
            case "/help":
                console.log([
                    "",
                    `  ${C.white}${C.bold}OpenCode Commands & Shortcuts${C.reset}`,
                    `  ${C.amber}/model${C.reset} ${C.slate}[id|num|query]${C.reset}   Interactive 29-model picker or instant fuzzy switch`,
                    `  ${C.amber}/mode${C.reset} ${C.slate}[build|plan]${C.reset}      Toggle between build (read/write) and plan (read-only) mode`,
                    `  ${C.amber}/cd <path>${C.reset}              Change active Mac workspace directory (switches session)`,
                    `  ${C.amber}/undo${C.reset}                   Revert the last file modification made by the agent`,
                    `  ${C.amber}/new${C.reset}                    Start a fresh isolated T450 session for this directory`,
                    `  ${C.amber}/status${C.reset}                 Inspect tunnel connection, JID, mode, model, and workspace`,
                    `  ${C.amber}!<command>${C.reset}              Quick shell execution on Mac (e.g. ${C.cyan}!git status${C.reset})`,
                    `  ${C.amber}@<filepath>${C.reset}             Inline file attachment in prompt (e.g. ${C.cyan}fix bug in @app.js${C.reset})`,
                    `  ${C.amber}/clear${C.reset}                  Clear terminal view`,
                    `  ${C.amber}/exit${C.reset}                   Exit WaHarness`,
                    ""
                ].join("\n"));
                break;

            case "/models":
            case "/model":
                if (arg) {
                    if (arg.toLowerCase() === "list") {
                        this.printStaticModelCatalog();
                        return;
                    }
                    const matched = this.findModelByQuery(arg);
                    if (matched) {
                        this.activeModel = matched.id;
                        console.log(`\n  ${C.green}✓${C.reset} ${C.slate}Switched model to${C.reset} ${C.white}${C.bold}${matched.id}${C.reset} ${C.gray}(${matched.label})${C.reset}\n`);
                    } else {
                        this.activeModel = arg;
                        console.log(`\n  ${C.green}✓${C.reset} ${C.slate}Switched custom model ID to${C.reset} ${C.white}${C.bold}${arg}${C.reset}\n`);
                    }
                } else {
                    await this.openInteractiveModelPicker();
                }
                break;

            case "/mode":
            case "/plan":
            case "/build":
                if (action === "/plan" || arg.toLowerCase() === "plan") {
                    this.mode = "plan";
                } else if (action === "/build" || arg.toLowerCase() === "build") {
                    this.mode = "build";
                } else {
                    this.mode = this.mode === "build" ? "plan" : "build";
                }
                console.log(
                    `\n  ${C.green}✓${C.reset} ${C.slate}Switched mode to${C.reset} ${this.mode === "plan" ? C.cyan + "◈ plan (read-only analysis)" : C.amber + "▣ build (full tool execution)"}${C.reset}\n`
                );
                break;

            case "/cd":
                if (!arg) {
                    console.log(`\n  ${C.slate}Current workspace:${C.reset} ${C.white}${this.cwd}${C.reset}\n  ${C.darkGray}Usage: /cd <directory>${C.reset}\n`);
                    return;
                }
                const expanded = arg.startsWith("~") ? path.join(os.homedir(), arg.slice(1)) : arg;
                const targetDir = path.isAbsolute(expanded) ? expanded : path.resolve(this.cwd, expanded);
                if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
                    console.log(`\n  ${C.red}✗ Directory not found:${C.reset} ${targetDir}\n`);
                    return;
                }
                this.cwd = targetDir;
                process.chdir(targetDir);
                console.log(`\n  ${C.green}✓${C.reset} ${C.slate}Workspace switched to${C.reset} ${C.white}${C.bold}${shortPath(this.cwd)}${C.reset}\n`);
                break;

            case "/undo":
                const undoRes = undoLastEdit();
                if (undoRes.ok) {
                    console.log(`\n  ${C.green}✓${C.reset} ${C.white}${undoRes.message}${C.reset}\n`);
                } else {
                    console.log(`\n  ${C.amber}⚠${C.reset} ${C.slate}${undoRes.error}${C.reset}\n`);
                }
                break;

            case "/status":
                console.log([
                    "",
                    `  ${C.white}${C.bold}Session Status${C.reset}`,
                    `  ${C.slate}Tunnel   ${C.reset}  ${this.transport.connected ? C.green + "● connected" : C.amber + "◌ reconnecting"}${C.reset}`,
                    `  ${C.slate}Channel  ${C.reset}  ${C.white}${this.transport.targetChat || "self-chat"} (!WAH_ isolated)${C.reset}`,
                    `  ${C.slate}Model    ${C.reset}  ${C.amber}${this.activeModel}${C.reset}`,
                    `  ${C.slate}Mode     ${C.reset}  ${this.mode === "plan" ? C.cyan + "◈ plan (read-only)" : C.amber + "▣ build"}${C.reset}`,
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
                console.log(renderOpenCodeHeader(this.cwd, this.activeModel, this.mode, this.transport.connected));
                break;

            case "/exec":
                if (!arg) {
                    console.log(`\n  ${C.slate}Usage: /exec <command> (or !<command>)${C.reset}\n`);
                    return;
                }
                await this.runLocalShell(arg);
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
        const barColor = this.mode === "plan" ? C.cyan : C.amber;
        console.log(`  ${barColor}┃${C.reset}  ${C.white}${C.bold}${userPrompt}${C.reset}`);

        const attachments = this.resolveInlineMentions(userPrompt);
        const attachedNames = Object.keys(attachments);
        for (const name of attachedNames) {
            console.log(`  ${barColor}┃${C.reset}  ${C.cyan}📎 Attached @${name}${C.reset}`);
        }
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
            mode: this.mode,
            files: this.getTopLevelFiles(),
            attachments,
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
                if ((req.action === "write_file" || req.action === "edit_file") && this.mode === "plan") {
                    result = { error: "Blocked: WaHarness is currently in read-only PLAN mode." };
                } else if (req.action === "bash" || req.action === "exec") {
                    result = await executeCommand(req.cmd, req.cwd || this.cwd);
                } else if (req.action === "read_file") {
                    result = readFile(req.path, req.cwd || this.cwd);
                } else if (req.action === "write_file") {
                    result = writeFile(req.path, req.content, req.cwd || this.cwd);
                } else if (req.action === "edit_file") {
                    result = editFile(req.path, req.target, req.replacement, req.cwd || this.cwd);
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
                const diffStats = (result.added !== undefined || result.removed !== undefined)
                    ? ` ${C.green}+${result.added || 0}${C.reset} ${C.red}-${result.removed || 0}${C.reset}`
                    : "";
                const durStr = result.dur ? ` (${result.dur}s)` : "";
                const cols = process.stdout.columns || 80;
                const maxDetail = Math.max(20, cols - req.action.length - durStr.length - 16);
                const oneLineDetail = String(detail).replace(/\s+/g, " ").trim();
                const clippedDetail = oneLineDetail.length > maxDetail
                    ? oneLineDetail.slice(0, maxDetail - 1) + "…"
                    : oneLineDetail;
                const dur = result.dur ? ` ${C.darkGray}(${result.dur}s)${C.reset}` : "";
                console.log(`  ${C.purple}┃${C.reset}  ${badge} ${C.slate}${req.action}${C.reset} ${C.gray}${clippedDetail}${C.reset}${diffStats}${dur}`);

                // Render OpenCode PatchDiff preview on surgical edits
                if (Array.isArray(result.diffPreview)) {
                    for (const row of result.diffPreview) {
                        const sign = row.type === "add" ? `${C.green}+` : `${C.red}-`;
                        const lineColor = row.type === "add" ? C.green : C.red;
                        console.log(`  ${C.purple}┃${C.reset}    ${sign} ${lineColor}${row.text.slice(0, cols - 12)}${C.reset}`);
                    }
                }

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
                const modeIcon = this.mode === "plan" ? `${C.cyan}◈${C.reset}` : `${C.amber}▣${C.reset}`;
                console.log(`  ${C.purple}╹${C.reset}${modeIcon}  ${C.slate}${data.model || this.activeModel}${C.reset} ${C.darkGray}· ${data.dur || 0}s${C.reset}\n`);
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
    console.log("waharness 1.1.0");
    process.exit(0);
}

const cli = new WaHarnessCLI();
cli.start();
