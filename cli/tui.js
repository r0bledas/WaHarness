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

// OpenCode System & Theme Palettes (clean native ANSI by default so macOS Terminal, iTerm2, Ghostty, and Kitty all render with crisp contrast and transparent backgrounds)
const THEMES = {
    system: {
        name: "system (OpenCode Native ANSI)",
        primary: "\x1b[93m",      // Bright Warm Yellow / Amber
        secondary: "\x1b[94m",    // Bright Soft Blue
        accent: "\x1b[95m",       // Bright Lavender / Magenta
        info: "\x1b[96m",         // Bright Cyan
        success: "\x1b[92m",      // Bright Mint Green
        error: "\x1b[91m",        // Bright Coral Red
        text: "\x1b[97m",         // Bright White
        muted: "\x1b[90m",        // Readable Muted Gray (ANSI Bright Black)
        border: "\x1b[90m",       // Clean Subtle Border
        selectedBg: "\x1b[7m"     // Native Terminal Inverse Video highlight
    },
    opencode: {
        name: "opencode (Warm Peach & Lavender)",
        primary: "\x1b[38;5;216m",
        secondary: "\x1b[38;5;111m",
        accent: "\x1b[38;5;141m",
        info: "\x1b[38;5;73m",
        success: "\x1b[38;5;114m",
        error: "\x1b[38;5;168m",
        text: "\x1b[38;5;255m",
        muted: "\x1b[38;5;246m",
        border: "\x1b[38;5;242m",
        selectedBg: "\x1b[48;5;238m"
    },
    tokyonight: {
        name: "tokyonight (Cyan & Purple)",
        primary: "\x1b[38;5;117m",
        secondary: "\x1b[38;5;141m",
        accent: "\x1b[38;5;176m",
        info: "\x1b[38;5;81m",
        success: "\x1b[38;5;115m",
        error: "\x1b[38;5;204m",
        text: "\x1b[38;5;254m",
        muted: "\x1b[38;5;245m",
        border: "\x1b[38;5;241m",
        selectedBg: "\x1b[48;5;238m"
    },
    catppuccin: {
        name: "catppuccin (Mocha Mauve & Peach)",
        primary: "\x1b[38;5;216m",
        secondary: "\x1b[38;5;183m",
        accent: "\x1b[38;5;183m",
        info: "\x1b[38;5;117m",
        success: "\x1b[38;5;151m",
        error: "\x1b[38;5;211m",
        text: "\x1b[38;5;255m",
        muted: "\x1b[38;5;246m",
        border: "\x1b[38;5;242m",
        selectedBg: "\x1b[48;5;238m"
    }
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// All 29 Live T450 Models
const MODEL_CATALOG = [
    // Google Gemini 4
    { id: "gemini-4-argon-medium", label: "Gemini 4 Argon (Medium)", group: "Gemini 4" },
    { id: "gemini-4-argon-high", label: "Gemini 4 Argon (High)", group: "Gemini 4" },
    { id: "gemini-4-argon-low", label: "Gemini 4 Argon (Low)", group: "Gemini 4" },
    { id: "gemini-4-neon-high", label: "Gemini 4 Neon (High)", group: "Gemini 4" },
    { id: "gemini-4-neon-xhigh", label: "Gemini 4 Neon (XHigh)", group: "Gemini 4" },
    { id: "gemini-4-neon-medium", label: "Gemini 4 Neon (Medium)", group: "Gemini 4" },
    { id: "gemini-4-neon-low", label: "Gemini 4 Neon (Low)", group: "Gemini 4" },
    { id: "gemini-4-carbon-high", label: "Gemini 4 Carbon (High)", group: "Gemini 4" },
    { id: "gemini-4-carbon-medium", label: "Gemini 4 Carbon (Medium)", group: "Gemini 4" },
    { id: "gemini-4-carbon-low", label: "Gemini 4 Carbon (Low)", group: "Gemini 4" },
    { id: "gemini-4-hydrogen-high", label: "Gemini 4 Hydrogen (High)", group: "Gemini 4" },
    { id: "gemini-4-hydrogen-xhigh", label: "Gemini 4 Hydrogen (XHigh)", group: "Gemini 4" },
    { id: "gemini-4-hydrogen-medium", label: "Gemini 4 Hydrogen (Medium)", group: "Gemini 4" },
    { id: "gemini-4-hydrogen-low", label: "Gemini 4 Hydrogen (Low)", group: "Gemini 4" },
    { id: "gemini-pro-orchestrator-neon", label: "Orchestrator (Neon)", group: "Gemini 4" },
    { id: "gemini-pro-orchestrator", label: "Orchestrator (Carbon)", group: "Gemini 4" },
    { id: "gemini-pro-orchestrator-argon", label: "Orchestrator (Argon)", group: "Gemini 4" },
    { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", group: "Gemini 3.8" },
    { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)", group: "Gemini 3.8" },
    { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", group: "Gemini 3.8" },
    // Anthropic Claude 5.5
    { id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)", group: "Claude 5.5" },
    { id: "claude-opus-5-5-medium", label: "Claude Opus 5.5 (Medium)", group: "Claude 5.5" },
    { id: "claude-opus-5-5-low", label: "Claude Opus 5.5 (Low)", group: "Claude 5.5" },
    { id: "claude-sonnet-5-5-high", label: "Claude Sonnet 5.5 (High)", group: "Claude 5.5" },
    { id: "claude-sonnet-5-5-medium", label: "Claude Sonnet 5.5 (Medium)", group: "Claude 5.5" },
    { id: "claude-sonnet-5-5-low", label: "Claude Sonnet 5.5 (Low)", group: "Claude 5.5" },
    // Hermes DeepSeek
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro (Hermes)", group: "DeepSeek" },
    { id: "deepseek-flash", label: "DeepSeek V4.1 Flash (Hermes)", group: "DeepSeek" },
    // OpenAI OSS
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", group: "OpenAI OSS" }
];

function shortPath(p) {
    const home = os.homedir();
    if (p === home) return "~";
    if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
    return p;
}

// Helper to pad plain text BEFORE wrapping in ANSI color codes so borders always align 100%
function padCol(str, len, color = "") {
    const raw = String(str || "");
    const clipped = raw.length > len ? raw.slice(0, len - 1) + "…" : raw.padEnd(len, " ");
    return color ? `${color}${clipped}${RESET}` : clipped;
}

class WaHarnessCLI {
    constructor() {
        this.cwd = process.cwd();
        this.activeModel = "gemini-4-argon-medium";
        this.mode = "build"; // "build" | "plan"
        this.themeName = "system";
        this.transport = new WhatsAppTransport();
        this.rl = null;
        this.origTtyWrite = null;
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

    get T() {
        return THEMES[this.themeName] || THEMES.system;
    }

    renderHeader() {
        const T = this.T;
        const connected = this.transport.connected;
        const statusDot = connected ? `${T.success}●${RESET}` : `${T.primary}◌${RESET}`;
        const ws = shortPath(this.cwd);
        const modeText = this.mode === "plan" ? "◈ plan (read-only)" : "▣ build (read/write)";
        const modeColor = this.mode === "plan" ? T.info : T.primary;

        return [
            "",
            `  ${T.muted}█░█░█ ▄▀█${RESET} ${T.text}${BOLD}█░█ ▄▀█ █▀█ █▄░█ █▀▀ █▀ █▀${RESET}   ${T.muted}v1.1.1${RESET}`,
            `  ${T.muted}▀▄▀▄▀ █▀█${RESET} ${T.text}${BOLD}█▀█ █▀█ █▀▄ █░▀█ ██▄ ▄█ ▄█${RESET}   ${statusDot} ${T.muted}zero-rate tunnel${RESET}`,
            "",
            `  ${T.border}┌────────────────────────────────────────────────────────────────────┐${RESET}`,
            `  ${T.border}│${RESET} ${padCol("Workspace", 10, T.muted)} ${padCol(ws, 55, T.text)} ${T.border}│${RESET}`,
            `  ${T.border}│${RESET} ${padCol("Model", 10, T.muted)} ${padCol(this.activeModel, 34, T.text + BOLD)} ${padCol(modeText, 20, modeColor)} ${T.border}│${RESET}`,
            `  ${T.border}│${RESET} ${padCol("Commands", 10, T.muted)} ${padCol("/model  /mode  /theme  /cd  /undo  /new  !cmd  @file", 55, T.muted)} ${T.border}│${RESET}`,
            `  ${T.border}└────────────────────────────────────────────────────────────────────┘${RESET}`,
            ""
        ].join("\n");
    }

    formatMarkdownLines(text) {
        const T = this.T;
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
                    out.push(`  ${T.accent}┃${RESET}  ${T.border}┌── ${T.info}${codeLang}${T.border} ────────────────────────────────────────${RESET}`);
                } else {
                    inCode = false;
                    out.push(`  ${T.accent}┃${RESET}  ${T.border}└────────────────────────────────────────────────────${RESET}`);
                }
                continue;
            }

            if (inCode) {
                out.push(`  ${T.accent}┃${RESET}  ${T.border}│${RESET} ${T.info}${line}${RESET}`);
                continue;
            }

            let formatted = line;
            if (/^#{1,3}\s+/.test(formatted)) {
                formatted = `${T.primary}${BOLD}${formatted.replace(/^#{1,3}\s+/, "")}${RESET}`;
            } else {
                formatted = formatted.replace(/\*\*([^*]+)\*\*/g, `${T.text}${BOLD}$1${RESET}`);
                formatted = formatted.replace(/`([^`]+)`/g, `${T.info}$1${RESET}`);
                if (/^\s*[-*]\s+/.test(formatted)) {
                    formatted = formatted.replace(/^(\s*)[-*]\s+/, `$1${T.primary}•${RESET} `);
                }
            }
            out.push(`  ${T.accent}┃${RESET}  ${formatted}`);
        }
        return out.join("\n");
    }

    // Intercept readline's internal _ttyWrite so stdin stays in raw mode and arrow keys work 100% reliably
    lockReadlineKeys(customHandler) {
        if (!this.rl) return;
        if (!this.origTtyWrite) {
            this.origTtyWrite = this.rl._ttyWrite.bind(this.rl);
        }
        if (process.stdin.isTTY) {
            try {
                process.stdin.setRawMode(true);
                process.stdin.resume();
            } catch (_) {}
        }
        this.rl._ttyWrite = (s, key) => {
            if (customHandler) customHandler(s, key || {});
        };
    }

    unlockReadlineKeys() {
        if (!this.rl) return;
        if (this.origTtyWrite) {
            this.rl._ttyWrite = this.origTtyWrite;
        }
    }

    startSpinner(statusText = "Thinking...") {
        this.stopSpinner();
        const T = this.T;
        this.spinnerStatus = statusText;
        this.spinnerStart = Date.now();
        this.spinnerFrame = 0;

        // While spinner runs, block readline echo and allow Esc / Ctrl+C to cancel
        this.lockReadlineKeys((s, key) => {
            if (key.name === "escape" || (key.ctrl && key.name === "c")) {
                this.cancelInFlight();
            }
        });

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
                `\r\x1b[2K  ${T.accent}┃${RESET}  ${T.primary}${frame}${RESET} ${T.text}${clippedStatus}${RESET}${T.muted}${suffix}${RESET}`
            );
        };
        render();
        this.spinnerTimer = setInterval(render, 80);
    }

    cancelInFlight() {
        if (!this.inFlight) return;
        const T = this.T;
        this.clearPollTimer();
        this.stopSpinner();
        if (this.activeReq && this.activeReq.id) {
            this.completedIds.add(this.activeReq.id);
        }
        this.activeReq = null;
        this.inFlight = false;
        console.log(`  ${T.accent}╹${RESET}${T.error}✗${RESET}  ${T.muted}Cancelled${RESET}\n`);
        this.promptUser();
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
        if (!this.inModal) {
            this.unlockReadlineKeys();
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
        console.log(this.renderHeader());
        this.startSpinner("Connecting to zero-rate WhatsApp tunnel...");

        this.transport.on("qr", (qr) => {
            this.stopSpinner();
            console.log(`\n  ${this.T.primary}Scan QR code in WhatsApp -> Linked Devices:${RESET}\n`);
            if (qrcode) qrcode.generate(qr, { small: true });
        });

        this.transport.on("ready", async ({ isFirst }) => {
            if (isFirst) {
                this.stopSpinner();
                console.clear();
                console.log(this.renderHeader());
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
                console.log(`\n  ${this.T.error}✗ Session logged out. Delete ~/.waharness/auth_info to re-pair.${RESET}\n`);
            }
        });

        this.transport.on("message", (msg) => this.handleInbound(msg));

        await this.transport.init();
    }

    getPromptString() {
        const T = this.T;
        const ws = path.basename(this.cwd) || "~";
        const badge = this.mode === "plan" ? `${T.info}◈ plan${RESET}` : `${T.primary}▣ build${RESET}`;
        return `  ${badge} ${T.muted}·${RESET} ${T.text}${this.activeModel}${RESET} ${T.muted}· ${ws}${RESET} ${T.primary}${BOLD}❯${RESET} `;
    }

    setupReadline() {
        if (this.rl) return;
        readline.emitKeypressEvents(process.stdin);

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: this.getPromptString()
        });
        this.origTtyWrite = this.rl._ttyWrite.bind(this.rl);

        this.rl.on("line", async (line) => {
            if (this.inFlight || this.inModal) return;
            const input = line.trim();
            if (!input) {
                this.promptUser();
                return;
            }

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
            console.log(`\n  ${this.T.muted}Session closed.${RESET}\n`);
            process.exit(0);
        });
    }

    promptUser() {
        if (this.rl && !this.inFlight && !this.inModal) {
            this.unlockReadlineKeys();
            this.rl.line = "";
            this.rl.cursor = 0;
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
        const T = this.T;
        console.log(`\n  ${T.border}┃${RESET} ${T.primary}$ ${localCmd}${RESET}`);
        const res = await executeCommand(localCmd, this.cwd);
        if (res.out) {
            for (const l of res.out.trimEnd().split("\n")) {
                console.log(`  ${T.border}┃${RESET} ${l}`);
            }
        }
        if (res.err) {
            for (const l of res.err.trimEnd().split("\n")) {
                console.log(`  ${T.border}┃${RESET} ${T.error}${l}${RESET}`);
            }
        }
        console.log(`  ${T.border}╹${RESET} ${T.muted}exit ${res.code} · ${res.dur}s${RESET}\n`);
    }

    findModelByQuery(query) {
        const q = String(query || "").trim().toLowerCase();
        if (!q) return null;
        if (q === "agy" || q === "default") return MODEL_CATALOG[0];
        if (q === "hermes" || q === "deepseek") return MODEL_CATALOG.find((m) => m.id === "deepseek-v4-pro");
        if (/^\d+$/.test(q)) {
            const idx = parseInt(q, 10) - 1;
            if (idx >= 0 && idx < MODEL_CATALOG.length) return MODEL_CATALOG[idx];
        }
        const exact = MODEL_CATALOG.find((m) => m.id.toLowerCase() === q);
        if (exact) return exact;
        return MODEL_CATALOG.find(
            (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
        );
    }

    openInteractiveModelPicker() {
        if (!process.stdin.isTTY || !this.rl) {
            this.printStaticModelCatalog();
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const T = this.T;
            this.inModal = true;
            let searchQuery = "";
            let cursor = Math.max(0, MODEL_CATALOG.findIndex((m) => m.id === this.activeModel));
            const pageSize = 10;
            let drawnLines = 0;

            const getFiltered = () => {
                if (!searchQuery) return MODEL_CATALOG;
                const q = searchQuery.toLowerCase();
                return MODEL_CATALOG.filter(
                    (m) =>
                        m.id.toLowerCase().includes(q) ||
                        m.label.toLowerCase().includes(q) ||
                        m.group.toLowerCase().includes(q)
                );
            };

            const clearModal = () => {
                if (drawnLines > 0) {
                    process.stdout.write(`\x1b[${drawnLines}A\r\x1b[J`);
                    drawnLines = 0;
                }
            };

            const renderModal = () => {
                clearModal();
                const items = getFiltered();
                if (cursor >= items.length) cursor = Math.max(0, items.length - 1);

                const start = Math.max(0, Math.min(cursor - Math.floor(pageSize / 2), Math.max(0, items.length - pageSize)));
                const end = Math.min(items.length, start + pageSize);

                const searchDisplay = searchQuery
                    ? `${T.text}${BOLD}${searchQuery}█${RESET}`
                    : `${T.muted}type to filter or use ↑/↓ arrows...${RESET}`;

                const rows = [
                    "",
                    `  ${T.border}┌────────────────────────────────────────────────────────────────────┐${RESET}`,
                    `  ${T.border}│${RESET} ${T.primary}${BOLD}Select Model${RESET} ${T.muted}(↑/↓ navigate · Enter confirm · Esc cancel)${RESET}           ${T.border}│${RESET}`,
                    `  ${T.border}│${RESET} ${T.info}Search:${RESET} ${searchDisplay}`,
                    `  ${T.border}├────────────────────────────────────────────────────────────────────┤${RESET}`
                ];

                if (items.length === 0) {
                    rows.push(`  ${T.border}│${RESET}   ${T.error}No models matching "${searchQuery}"${RESET}`);
                } else {
                    for (let i = start; i < end; i++) {
                        const item = items[i];
                        const globalIdx = MODEL_CATALOG.indexOf(item) + 1;
                        const numStr = String(globalIdx).padStart(2, " ") + ".";
                        const isCurrent = item.id === this.activeModel;
                        const isSelected = i === cursor;

                        const pointer = isSelected ? `${T.primary}${BOLD}❯${RESET}` : " ";
                        const activeDot = isCurrent ? `${T.success}●${RESET}` : " ";
                        const idFormatted = isSelected
                            ? `${T.selectedBg} ${ item.id.padEnd(29) } ${RESET}`
                            : padCol(" " + item.id, 31, isCurrent ? T.primary + BOLD : T.text);
                        const labelFormatted = padCol(item.label, 27, isSelected ? T.info + BOLD : T.muted);

                        rows.push(
                            `  ${T.border}│${RESET} ${pointer} ${T.muted}${numStr}${RESET} ${activeDot} ${idFormatted} ${labelFormatted} ${T.border}│${RESET}`
                        );
                    }
                }

                const countInfo = items.length > 0
                    ? `Showing ${start + 1}-${end} of ${items.length} models`
                    : "0 matches";
                rows.push(
                    `  ${T.border}└────────────────────────────────────────────────────────────────────┘${RESET}`,
                    `    ${T.muted}${countInfo}${RESET}`,
                    ""
                );

                const output = rows.join("\n");
                drawnLines = rows.length - 1;
                process.stdout.write(output);
            };

            const finish = (selectedModel) => {
                clearModal();
                this.inModal = false;
                this.unlockReadlineKeys();
                if (selectedModel) {
                    this.activeModel = selectedModel.id;
                    console.log(
                        `\n  ${T.success}✓${RESET} ${T.muted}Model switched to${RESET} ${T.text}${BOLD}${selectedModel.id}${RESET} ${T.muted}(${selectedModel.label})${RESET}\n`
                    );
                } else {
                    console.log(`\n  ${T.muted}Model unchanged (${this.activeModel}).${RESET}\n`);
                }
                this.promptUser();
                resolve();
            };

            // Intercept readline's raw _ttyWrite so Up/Down/Enter/Esc/Typing work seamlessly
            this.lockReadlineKeys((s, key) => {
                const items = getFiltered();
                if (key.name === "up" || (key.ctrl && key.name === "p")) {
                    if (items.length > 0) {
                        cursor = (cursor - 1 + items.length) % items.length;
                        renderModal();
                    }
                    return;
                }
                if (key.name === "down" || (key.ctrl && key.name === "n")) {
                    if (items.length > 0) {
                        cursor = (cursor + 1) % items.length;
                        renderModal();
                    }
                    return;
                }
                if (key.name === "pageup" || key.name === "left") {
                    if (items.length > 0) {
                        cursor = Math.max(0, cursor - pageSize);
                        renderModal();
                    }
                    return;
                }
                if (key.name === "pagedown" || key.name === "right") {
                    if (items.length > 0) {
                        cursor = Math.min(items.length - 1, cursor + pageSize);
                        renderModal();
                    }
                    return;
                }
                if (key.name === "return" || key.name === "enter") {
                    finish(items[cursor] || null);
                    return;
                }
                if (key.name === "escape" || (key.ctrl && key.name === "c")) {
                    finish(null);
                    return;
                }
                if (key.name === "backspace") {
                    if (searchQuery.length > 0) {
                        searchQuery = searchQuery.slice(0, -1);
                        cursor = 0;
                        renderModal();
                    }
                    return;
                }
                if (s && !key.ctrl && !key.meta && /^[\x20-\x7E]$/.test(s)) {
                    searchQuery += s;
                    cursor = 0;
                    renderModal();
                }
            });

            renderModal();
        });
    }

    printStaticModelCatalog() {
        const T = this.T;
        console.log(`\n  ${T.text}${BOLD}Available T450 Models (${MODEL_CATALOG.length})${RESET}`);
        MODEL_CATALOG.forEach((m, i) => {
            const mark = m.id === this.activeModel ? `${T.success}●${RESET}` : " ";
            const num = String(i + 1).padStart(2, " ");
            console.log(`  ${T.muted}${num}.${RESET} ${mark} ${padCol(m.id, 30, T.text)} ${T.muted}${m.label}${RESET}`);
        });
        console.log(`\n  ${T.muted}Use /model <number or name> to switch.${RESET}\n`);
    }

    async waitForConnection(maxWaitMs = 8000) {
        const start = Date.now();
        while (!this.transport.connected && Date.now() - start < maxWaitMs) {
            await new Promise((r) => setTimeout(r, 250));
        }
        return this.transport.connected;
    }

    async handleSlashCommand(cmd) {
        const T = this.T;
        const parts = cmd.trim().split(/\s+/);
        const action = parts[0].toLowerCase().replace(/\.+$/, "");
        const arg = parts.slice(1).join(" ").trim();

        switch (action) {
            case "/help":
                console.log([
                    "",
                    `  ${T.text}${BOLD}OpenCode Commands & Shortcuts${RESET}`,
                    `  ${T.primary}/model${RESET} ${T.muted}[id|num|query]${RESET}   Interactive arrow-key model picker (with live search filter)`,
                    `  ${T.primary}/mode${RESET} ${T.muted}[build|plan]${RESET}      Toggle between build (read/write) and plan (read-only) mode`,
                    `  ${T.primary}/theme${RESET} ${T.muted}[name]${RESET}           Switch color palette (system, opencode, tokyonight, catppuccin)`,
                    `  ${T.primary}/cd <path>${RESET}              Change active Mac workspace directory (switches session)`,
                    `  ${T.primary}/undo${RESET}                   Revert the last file modification made by the agent`,
                    `  ${T.primary}/new${RESET}                    Start a fresh isolated T450 session for this directory`,
                    `  ${T.primary}/status${RESET}                 Inspect tunnel connection, JID, mode, model, and workspace`,
                    `  ${T.primary}!<command>${RESET}              Quick shell execution on Mac (e.g. ${T.info}!git status${RESET})`,
                    `  ${T.primary}@<filepath>${RESET}             Inline file attachment in prompt (e.g. ${T.info}fix bug in @app.js${RESET})`,
                    `  ${T.primary}/clear${RESET}                  Clear terminal view`,
                    `  ${T.primary}/exit${RESET}                   Exit WaHarness`,
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
                        console.log(`\n  ${T.success}✓${RESET} ${T.muted}Switched model to${RESET} ${T.text}${BOLD}${matched.id}${RESET} ${T.muted}(${matched.label})${RESET}\n`);
                    } else {
                        this.activeModel = arg;
                        console.log(`\n  ${T.success}✓${RESET} ${T.muted}Switched custom model ID to${RESET} ${T.text}${BOLD}${arg}${RESET}\n`);
                    }
                } else {
                    await this.openInteractiveModelPicker();
                }
                break;

            case "/theme":
            case "/themes":
                if (arg && THEMES[arg.toLowerCase()]) {
                    this.themeName = arg.toLowerCase();
                    console.clear();
                    console.log(this.renderHeader());
                    console.log(`  ${this.T.success}✓${RESET} ${this.T.muted}Theme switched to${RESET} ${this.T.text}${BOLD}${this.T.name}${RESET}\n`);
                } else {
                    console.log(`\n  ${T.text}${BOLD}Available Themes${RESET}`);
                    for (const [k, v] of Object.entries(THEMES)) {
                        const mark = k === this.themeName ? `${T.success}●${RESET}` : " ";
                        console.log(`  ${mark} ${padCol(k, 14, T.primary + BOLD)} ${T.muted}${v.name}${RESET}`);
                    }
                    console.log(`\n  ${T.muted}Usage: /theme <system | opencode | tokyonight | catppuccin>${RESET}\n`);
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
                    `\n  ${T.success}✓${RESET} ${T.muted}Switched mode to${RESET} ${this.mode === "plan" ? T.info + "◈ plan (read-only analysis)" : T.primary + "▣ build (full tool execution)"}${RESET}\n`
                );
                break;

            case "/cd":
                if (!arg) {
                    console.log(`\n  ${T.muted}Current workspace:${RESET} ${T.text}${this.cwd}${RESET}\n  ${T.muted}Usage: /cd <directory>${RESET}\n`);
                    return;
                }
                const expanded = arg.startsWith("~") ? path.join(os.homedir(), arg.slice(1)) : arg;
                const targetDir = path.isAbsolute(expanded) ? expanded : path.resolve(this.cwd, expanded);
                if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
                    console.log(`\n  ${T.error}✗ Directory not found:${RESET} ${targetDir}\n`);
                    return;
                }
                this.cwd = targetDir;
                process.chdir(targetDir);
                console.log(`\n  ${T.success}✓${RESET} ${T.muted}Workspace switched to${RESET} ${T.text}${BOLD}${shortPath(this.cwd)}${RESET}\n`);
                break;

            case "/undo":
                const undoRes = undoLastEdit();
                if (undoRes.ok) {
                    console.log(`\n  ${T.success}✓${RESET} ${T.text}${undoRes.message}${RESET}\n`);
                } else {
                    console.log(`\n  ${T.primary}⚠${RESET} ${T.muted}${undoRes.error}${RESET}\n`);
                }
                break;

            case "/status":
                console.log([
                    "",
                    `  ${T.text}${BOLD}Session Status${RESET}`,
                    `  ${T.muted}Tunnel   ${RESET}  ${this.transport.connected ? T.success + "● connected" : T.primary + "◌ reconnecting"}${RESET}`,
                    `  ${T.muted}Channel  ${RESET}  ${T.text}${this.transport.targetChat || "self-chat"} (!WAH_ isolated)${RESET}`,
                    `  ${T.muted}Model    ${RESET}  ${T.primary}${this.activeModel}${RESET}`,
                    `  ${T.muted}Mode     ${RESET}  ${this.mode === "plan" ? T.info + "◈ plan (read-only)" : T.primary + "▣ build"}${RESET}`,
                    `  ${T.muted}Theme    ${RESET}  ${T.text}${this.T.name}${RESET}`,
                    `  ${T.muted}Workspace${RESET}  ${T.text}${this.cwd}${RESET}`,
                    `  ${T.muted}Auth     ${RESET}  ${T.muted}${this.transport.authDir}${RESET}`,
                    ""
                ].join("\n"));
                break;

            case "/new":
                if (!(await this.waitForConnection())) {
                    console.log(`\n  ${T.error}✗ Tunnel offline.${RESET}\n`);
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
                console.log(this.renderHeader());
                break;

            case "/exec":
                if (!arg) {
                    console.log(`\n  ${T.muted}Usage: /exec <command> (or !<command>)${RESET}\n`);
                    return;
                }
                await this.runLocalShell(arg);
                break;

            case "/exit":
            case "/quit":
                this.rl.close();
                break;

            default:
                console.log(`\n  ${T.error}Unknown command:${RESET} ${action}. Type ${T.primary}/help${RESET} for commands.\n`);
                break;
        }
    }

    async dispatchPrompt(userPrompt) {
        const T = this.T;
        process.stdout.write("\x1b[1A\r\x1b[2K");
        const barColor = this.mode === "plan" ? T.info : T.primary;
        console.log(`  ${barColor}┃${RESET}  ${T.text}${BOLD}${userPrompt}${RESET}`);

        const attachments = this.resolveInlineMentions(userPrompt);
        const attachedNames = Object.keys(attachments);
        for (const name of attachedNames) {
            console.log(`  ${barColor}┃${RESET}  ${T.info}📎 Attached @${name}${RESET}`);
        }
        console.log(`  ${T.accent}┃${RESET}`);

        this.inFlight = true;
        this.startSpinner(`Thinking (${this.activeModel})...`);

        if (!(await this.waitForConnection(8000))) {
            this.stopSpinner();
            console.log(`  ${T.accent}┃${RESET}  ${T.error}✗ Tunnel is currently offline. Please wait a moment and try again.${RESET}\n`);
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
            console.log(`  ${T.accent}┃${RESET}  ${T.error}✗ Send failed: ${e.message}${RESET}\n`);
            this.inFlight = false;
            this.promptUser();
        }
    }

    async handleInbound({ text }) {
        const T = this.T;
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
                const badge = result.error ? `${T.error}✗` : `${T.success}✓`;
                const diffStats = (result.added !== undefined || result.removed !== undefined)
                    ? ` ${T.success}+${result.added || 0}${RESET} ${T.error}-${result.removed || 0}${RESET}`
                    : "";
                const durStr = result.dur ? ` (${result.dur}s)` : "";
                const cols = process.stdout.columns || 80;
                const maxDetail = Math.max(20, cols - req.action.length - durStr.length - 16);
                const oneLineDetail = String(detail).replace(/\s+/g, " ").trim();
                const clippedDetail = oneLineDetail.length > maxDetail
                    ? oneLineDetail.slice(0, maxDetail - 1) + "…"
                    : oneLineDetail;
                const dur = result.dur ? ` ${T.muted}(${result.dur}s)${RESET}` : "";
                console.log(`  ${T.accent}┃${RESET}  ${badge} ${T.info}${req.action}${RESET} ${T.text}${clippedDetail}${RESET}${diffStats}${dur}`);

                if (Array.isArray(result.diffPreview)) {
                    for (const row of result.diffPreview) {
                        const sign = row.type === "add" ? `${T.success}+` : `${T.error}-`;
                        const lineColor = row.type === "add" ? T.success : T.error;
                        console.log(`  ${T.accent}┃${RESET}    ${sign} ${lineColor}${row.text.slice(0, cols - 12)}${RESET}`);
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
                console.log(`  ${T.accent}┃${RESET}  ${T.error}✗ Tool error: ${e.message}${RESET}`);
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
                    console.log(this.formatMarkdownLines(data.text));
                }
                const modeIcon = this.mode === "plan" ? `${T.info}◈${RESET}` : `${T.primary}▣${RESET}`;
                console.log(`  ${T.accent}╹${RESET}${modeIcon}  ${T.muted}${data.model || this.activeModel} · ${data.dur || 0}s${RESET}\n`);
            } catch (e) {
                this.clearPollTimer();
                this.stopSpinner();
                console.log(`  ${T.accent}┃${RESET}  ${text.substring("!WAH_DONE:".length)}\n`);
            }
            this.activeReq = null;
            this.inFlight = false;
            this.promptUser();
            return;
        }
    }
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log("waharness 1.1.1");
    process.exit(0);
}

const cli = new WaHarnessCLI();
cli.start();
