#!/usr/bin/env node

const readline = require("readline");
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const WhatsAppTransport = require("./transport");
const { executeCommand, readFile, writeFile, editFile, undoLastEdit, listDirectory } = require("./tools");

const APP_VERSION = "1.2.2";
const CONFIG_DIR = path.join(os.homedir(), ".waharness");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function loadUserConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) || {};
        }
    } catch (_) {}
    return {};
}

function saveUserConfig(cfg) {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
    } catch (_) {}
}

function isNewerVersion(latest, current) {
    const a = String(latest || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
    const b = String(current || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] || 0) > (b[i] || 0)) return true;
        if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false;
}

function fetchLatestReleaseVersion(timeoutMs = 4000) {
    return new Promise((resolve) => {
        const req = https.get(
            "https://api.github.com/repos/r0bledas/WaHarness/tags?per_page=1",
            { headers: { "User-Agent": `WaHarness/${APP_VERSION}` }, timeout: timeoutMs },
            (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return resolve(null);
                }
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        const tags = JSON.parse(data);
                        if (Array.isArray(tags) && tags[0] && tags[0].name) {
                            return resolve(String(tags[0].name).replace(/^v/i, ""));
                        }
                    } catch (_) {}
                    resolve(null);
                });
            }
        );
        req.on("error", () => resolve(null));
        req.on("timeout", () => {
            req.destroy();
            resolve(null);
        });
    });
}

let qrcode = null;
try {
    qrcode = require("qrcode-terminal");
} catch (_) {}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const THEMES = {
    opencode: {
        name: "OpenCode Default",
        primary: "\x1b[38;5;215m",     // Warm Peach/Amber (#fab283)
        secondary: "\x1b[38;5;111m",   // Soft Blue (#5c9cf5)
        accent: "\x1b[38;5;141m",      // Lavender (#9d7cd8)
        info: "\x1b[38;5;73m",         // Teal Cyan (#56b6c2)
        success: "\x1b[38;5;114m",     // Mint Green (#7fd88f)
        error: "\x1b[38;5;203m",       // Coral Red (#e06c75)
        text: "\x1b[97m",              // Crisp White
        muted: "\x1b[38;5;245m",       // Readable Muted Gray
        subtle: "\x1b[38;5;240m",      // Subtle Border Gray
        selectBg: "\x1b[48;5;215m\x1b[38;5;232m"
    },
    system: {
        name: "System Native ANSI",
        primary: "\x1b[93m",
        secondary: "\x1b[94m",
        accent: "\x1b[95m",
        info: "\x1b[96m",
        success: "\x1b[92m",
        error: "\x1b[91m",
        text: "\x1b[97m",
        muted: "\x1b[90m",
        subtle: "\x1b[90m",
        selectBg: "\x1b[7m"
    },
    tokyonight: {
        name: "Tokyo Night",
        primary: "\x1b[38;5;117m",
        secondary: "\x1b[38;5;141m",
        accent: "\x1b[38;5;176m",
        info: "\x1b[38;5;81m",
        success: "\x1b[38;5;115m",
        error: "\x1b[38;5;204m",
        text: "\x1b[38;5;254m",
        muted: "\x1b[38;5;245m",
        subtle: "\x1b[38;5;240m",
        selectBg: "\x1b[48;5;117m\x1b[38;5;232m"
    },
    catppuccin: {
        name: "Catppuccin Mocha",
        primary: "\x1b[38;5;216m",
        secondary: "\x1b[38;5;183m",
        accent: "\x1b[38;5;183m",
        info: "\x1b[38;5;117m",
        success: "\x1b[38;5;151m",
        error: "\x1b[38;5;211m",
        text: "\x1b[38;5;255m",
        muted: "\x1b[38;5;246m",
        subtle: "\x1b[38;5;240m",
        selectBg: "\x1b[48;5;183m\x1b[38;5;232m"
    }
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Clean 3-row geometric OpenCode-style block wordmark (46 cols exact per row: 10 + 2 + 34)
const LOGO_LINES = [
    ["█   █ ▄▀▀▄", "  ", "█  █ ▄▀▀▄ █▀▀▄ █▄ █ █▀▀▀ █▀▀▀ █▀▀▀"],
    ["█ █ █ █▀▀█", "  ", "█▀▀█ █▀▀█ █▀▀▄ █ ▀█ █▀▀  ▀▀▀█ ▀▀▀█"],
    ["▀▄▀▄▀ ▀  ▀", "  ", "▀  ▀ ▀  ▀ ▀  ▀ ▀  ▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"]
];

const PLACEHOLDERS = [
    "Fix a TODO in the codebase",
    "What is the tech stack of this project?",
    "Explain @package.json or run !git status"
];

const MODEL_CATALOG = [
    { id: "gemini-4-argon-medium", label: "Gemini 4 Argon (Medium)", provider: "Google AGY" },
    { id: "gemini-4-argon-high", label: "Gemini 4 Argon (High)", provider: "Google AGY" },
    { id: "gemini-4-argon-low", label: "Gemini 4 Argon (Low)", provider: "Google AGY" },
    { id: "gemini-4-neon-high", label: "Gemini 4 Neon (High)", provider: "Google AGY" },
    { id: "gemini-4-neon-xhigh", label: "Gemini 4 Neon (XHigh)", provider: "Google AGY" },
    { id: "gemini-4-neon-medium", label: "Gemini 4 Neon (Medium)", provider: "Google AGY" },
    { id: "gemini-4-neon-low", label: "Gemini 4 Neon (Low)", provider: "Google AGY" },
    { id: "gemini-4-carbon-high", label: "Gemini 4 Carbon (High)", provider: "Google AGY" },
    { id: "gemini-4-carbon-medium", label: "Gemini 4 Carbon (Medium)", provider: "Google AGY" },
    { id: "gemini-4-carbon-low", label: "Gemini 4 Carbon (Low)", provider: "Google AGY" },
    { id: "gemini-4-hydrogen-high", label: "Gemini 4 Hydrogen (High)", provider: "Google AGY" },
    { id: "gemini-4-hydrogen-xhigh", label: "Gemini 4 Hydrogen (XHigh)", provider: "Google AGY" },
    { id: "gemini-4-hydrogen-medium", label: "Gemini 4 Hydrogen (Medium)", provider: "Google AGY" },
    { id: "gemini-4-hydrogen-low", label: "Gemini 4 Hydrogen (Low)", provider: "Google AGY" },
    { id: "gemini-pro-orchestrator-neon", label: "Orchestrator (Neon)", provider: "Google AGY" },
    { id: "gemini-pro-orchestrator", label: "Orchestrator (Carbon)", provider: "Google AGY" },
    { id: "gemini-pro-orchestrator-argon", label: "Orchestrator (Argon)", provider: "Google AGY" },
    { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", provider: "Google AGY" },
    { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)", provider: "Google AGY" },
    { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", provider: "Google AGY" },
    { id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)", provider: "Anthropic AGY" },
    { id: "claude-opus-5-5-medium", label: "Claude Opus 5.5 (Medium)", provider: "Anthropic AGY" },
    { id: "claude-opus-5-5-low", label: "Claude Opus 5.5 (Low)", provider: "Anthropic AGY" },
    { id: "claude-sonnet-5-5-high", label: "Claude Sonnet 5.5 (High)", provider: "Anthropic AGY" },
    { id: "claude-sonnet-5-5-medium", label: "Claude Sonnet 5.5 (Medium)", provider: "Anthropic AGY" },
    { id: "claude-sonnet-5-5-low", label: "Claude Sonnet 5.5 (Low)", provider: "Anthropic AGY" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "Hermes" },
    { id: "deepseek-flash", label: "DeepSeek V4.1 Flash", provider: "Hermes" },
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", provider: "OpenAI OSS" }
];

const SLASH_COMMANDS = [
    { cmd: "/models", title: "Switch model", desc: "Open 29-model selector popup" },
    { cmd: "/mode", title: "Toggle Build / Plan", desc: "Switch Build (read/write) <-> Plan (read-only)" },
    { cmd: "/theme", title: "Switch theme", desc: "Open live theme selector popup" },
    { cmd: "/new", title: "New session", desc: "Reset isolated T450 session for this workspace" },
    { cmd: "/cd", title: "Change directory", desc: "Usage: /cd <path>" },
    { cmd: "/undo", title: "Undo last edit", desc: "Revert the last agent file edit" },
    { cmd: "/status", title: "Session status", desc: "Inspect tunnel, JID, model & workspace" },
    { cmd: "/update", title: "Check & install updates", desc: "Check latest release & run brew upgrade waharness" },
    { cmd: "/clear", title: "Clear screen", desc: "Return to centered Home view" },
    { cmd: "/help", title: "Shortcuts & help", desc: "Show commands, !shell, @file & keys" },
    { cmd: "/exit", title: "Exit WaHarness", desc: "Quit WaHarness TUI" }
];

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s) {
    return String(s || "").replace(ANSI_RE, "");
}

function visibleLen(s) {
    return Array.from(stripAnsi(s)).length;
}

function clipPlain(s, maxLen) {
    if (maxLen <= 0) return "";
    const chars = Array.from(String(s || ""));
    if (chars.length <= maxLen) return chars.join("");
    if (maxLen === 1) return "…";
    return chars.slice(0, maxLen - 1).join("") + "…";
}

// Truncate an ANSI-colored string to an exact visible width so borders and terminal rows NEVER wrap
function fitAnsi(str, maxWidth) {
    if (maxWidth <= 0) return "";
    const s = String(str || "");
    let out = "";
    let vis = 0;
    let i = 0;
    while (i < s.length) {
        if (s[i] === "\x1b" && s[i + 1] === "[") {
            const end = s.indexOf("m", i);
            if (end !== -1) {
                out += s.slice(i, end + 1);
                i = end + 1;
                continue;
            }
        }
        const cp = s.codePointAt(i);
        const ch = String.fromCodePoint(cp);
        if (vis + 1 > maxWidth) {
            break;
        }
        out += ch;
        vis += 1;
        i += ch.length;
    }
    return out + RESET;
}

function padVisible(s, width) {
    const v = visibleLen(s);
    if (v > width) return fitAnsi(s, width);
    if (v === width) return s;
    return s + " ".repeat(width - v);
}

function shortPath(p) {
    const home = os.homedir();
    if (p === home) return "~";
    if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
    return p;
}

function wrapText(text, maxWidth) {
    const w = Math.max(20, maxWidth);
    const out = [];
    for (const rawLine of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
        if (rawLine.length <= w) {
            out.push(rawLine);
            continue;
        }
        let rem = rawLine;
        while (rem.length > w) {
            let idx = rem.lastIndexOf(" ", w);
            if (idx <= w * 0.3) idx = w;
            out.push(rem.slice(0, idx));
            rem = rem.slice(idx).trimStart();
        }
        if (rem) out.push(rem);
    }
    return out;
}

class WaHarnessTUI {
    constructor() {
        const saved = loadUserConfig();
        this.cwd = process.cwd();
        this.activeModel = saved.model || "gemini-4-argon-medium";
        this.mode = "build"; // "build" | "plan"
        this.themeName = (saved.theme && THEMES[saved.theme]) ? saved.theme : "opencode";
        this.updateAvailable = null;
        this.transport = new WhatsAppTransport();

        this.messages = [];
        this.scrollOffset = 0;
        this.inputBuffer = "";
        this.cursorPos = 0;
        this.slashIdx = 0;
        this.history = [];
        this.historyIdx = -1;
        this.placeholderIdx = 0;

        this.inFlight = false;
        this.activeReq = null;
        this.completedIds = new Set();
        this.pollTimer = null;
        this.spinnerTimer = null;
        this.streamTimer = null;
        this.spinnerFrame = 0;
        this.spinnerStart = 0;
        this.spinnerStatus = "Thinking...";

        this.modal = null;
        this.toast = null;
        this.toastTimer = null;
        this.qrLines = null;
    }

    get T() {
        return THEMES[this.themeName] || THEMES.opencode;
    }

    get cols() {
        return Math.max(40, process.stdout.columns || 100);
    }

    get rows() {
        return Math.max(16, process.stdout.rows || 30);
    }

    showToast(msg, durationMs = 2600) {
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toast = msg;
        this.render();
        this.toastTimer = setTimeout(() => {
            this.toast = null;
            this.render();
        }, durationMs);
    }

    persistPreferences() {
        saveUserConfig({
            model: this.activeModel,
            theme: this.themeName
        });
    }

    async checkForUpdates(verbose = false) {
        const latest = await fetchLatestReleaseVersion(4000);
        if (latest && isNewerVersion(latest, APP_VERSION)) {
            this.updateAvailable = latest;
            if (verbose) {
                this.showToast(`Update available: v${latest} (run /update to install)`);
            } else {
                this.render();
            }
            return latest;
        }
        if (verbose) {
            this.showToast(latest ? `WaHarness v${APP_VERSION} is up to date.` : "Could not reach GitHub (offline / zero-rate).");
        }
        return null;
    }

    async start() {
        process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
        process.on("exit", () => {
            process.stdout.write("\x1b[?25h\x1b[?1049l");
        });

        this.setupRawInput();
        process.stdout.on("resize", () => this.render());
        this.checkForUpdates(false);

        this.transport.on("qr", (qr) => {
            if (qrcode) {
                qrcode.generate(qr, { small: true }, (str) => {
                    this.qrLines = str.split("\n").filter((l) => l.length > 0);
                    this.render();
                });
            }
        });

        this.transport.on("ready", async ({ isFirst }) => {
            this.qrLines = null;
            if (isFirst) {
                this.render();
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
                this.showToast("WhatsApp logged out. Delete ~/.waharness/auth_info to re-pair.", 6000);
            }
            this.render();
        });

        this.transport.on("message", (msg) => this.handleInbound(msg));

        this.render();
        await this.transport.init();
    }

    cleanupAndExit() {
        if (this.spinnerTimer) clearInterval(this.spinnerTimer);
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.streamTimer) clearInterval(this.streamTimer);
        process.stdout.write("\x1b[?25h\x1b[?1049l");
        process.exit(0);
    }

    getSlashSuggestions() {
        if (!this.inputBuffer.startsWith("/") || this.inputBuffer.includes(" ")) return [];
        const q = this.inputBuffer.toLowerCase();
        return SLASH_COMMANDS.filter(
            (c) => c.cmd.startsWith(q) || c.title.toLowerCase().includes(q.slice(1))
        );
    }

    setupRawInput() {
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();

        process.stdin.on("keypress", async (str, key = {}) => {
            // Global Ctrl+C
            if (key.ctrl && key.name === "c") {
                if (this.modal) {
                    if (this.modal.type === "theme" && this.modal.prevTheme) {
                        this.themeName = this.modal.prevTheme;
                    }
                    this.modal = null;
                    this.render();
                    return;
                }
                if (this.inFlight) {
                    this.cancelInFlight();
                    return;
                }
                this.cleanupAndExit();
                return;
            }

            // Global Ctrl+P -> Open Centered Command Palette Popup
            if (key.ctrl && key.name === "p") {
                this.openCommandPaletteModal();
                return;
            }

            // 1. Centered Modal Popup active
            if (this.modal) {
                await this.handleModalKey(str, key);
                return;
            }

            // 2. Turn in-flight
            if (this.inFlight) {
                if (key.name === "escape") {
                    this.cancelInFlight();
                } else if (key.name === "pageup") {
                    this.scrollOffset += 6;
                    this.render();
                } else if (key.name === "pagedown") {
                    this.scrollOffset = Math.max(0, this.scrollOffset - 6);
                    this.render();
                }
                return;
            }

            // 3. Inline slash autocomplete navigation
            const slashMatches = this.getSlashSuggestions();

            if (key.name === "tab") {
                if (slashMatches.length > 0) {
                    const pick = slashMatches[this.slashIdx % slashMatches.length];
                    this.inputBuffer = pick.cmd === "/cd" ? "/cd " : pick.cmd;
                    this.cursorPos = this.inputBuffer.length;
                    this.slashIdx = 0;
                    this.render();
                    return;
                }
                this.mode = this.mode === "build" ? "plan" : "build";
                this.showToast(`Switched mode to ${this.mode.toUpperCase()}`);
                return;
            }

            if (key.name === "escape") {
                if (this.inputBuffer.length > 0) {
                    this.inputBuffer = "";
                    this.cursorPos = 0;
                    this.slashIdx = 0;
                    this.render();
                }
                return;
            }

            if (key.name === "pageup") {
                this.scrollOffset += 6;
                this.render();
                return;
            }
            if (key.name === "pagedown") {
                this.scrollOffset = Math.max(0, this.scrollOffset - 6);
                this.render();
                return;
            }

            if (key.name === "up") {
                if (slashMatches.length > 0) {
                    this.slashIdx = (this.slashIdx - 1 + slashMatches.length) % slashMatches.length;
                    this.render();
                    return;
                }
                if (this.history.length > 0 && this.historyIdx < this.history.length - 1) {
                    this.historyIdx++;
                    this.inputBuffer = this.history[this.history.length - 1 - this.historyIdx];
                    this.cursorPos = this.inputBuffer.length;
                    this.render();
                }
                return;
            }

            if (key.name === "down") {
                if (slashMatches.length > 0) {
                    this.slashIdx = (this.slashIdx + 1) % slashMatches.length;
                    this.render();
                    return;
                }
                if (this.historyIdx > 0) {
                    this.historyIdx--;
                    this.inputBuffer = this.history[this.history.length - 1 - this.historyIdx];
                    this.cursorPos = this.inputBuffer.length;
                    this.render();
                } else if (this.historyIdx === 0) {
                    this.historyIdx = -1;
                    this.inputBuffer = "";
                    this.cursorPos = 0;
                    this.render();
                }
                return;
            }

            if (key.name === "left") {
                if (this.cursorPos > 0) {
                    this.cursorPos--;
                    this.render();
                }
                return;
            }

            if (key.name === "right") {
                if (this.cursorPos < this.inputBuffer.length) {
                    this.cursorPos++;
                    this.render();
                }
                return;
            }

            if (key.ctrl && key.name === "a") {
                this.cursorPos = 0;
                this.render();
                return;
            }

            if (key.ctrl && key.name === "e") {
                this.cursorPos = this.inputBuffer.length;
                this.render();
                return;
            }

            if (key.ctrl && key.name === "u") {
                this.inputBuffer = "";
                this.cursorPos = 0;
                this.slashIdx = 0;
                this.render();
                return;
            }

            if (key.name === "backspace") {
                if (this.cursorPos > 0) {
                    this.inputBuffer =
                        this.inputBuffer.slice(0, this.cursorPos - 1) +
                        this.inputBuffer.slice(this.cursorPos);
                    this.cursorPos--;
                    this.slashIdx = 0;
                    this.render();
                }
                return;
            }

            if (key.name === "delete") {
                if (this.cursorPos < this.inputBuffer.length) {
                    this.inputBuffer =
                        this.inputBuffer.slice(0, this.cursorPos) +
                        this.inputBuffer.slice(this.cursorPos + 1);
                    this.slashIdx = 0;
                    this.render();
                }
                return;
            }

            if (key.name === "return" || key.name === "enter") {
                let submitted = this.inputBuffer.trim();
                if (slashMatches.length > 0 && !submitted.includes(" ")) {
                    const pick = slashMatches[this.slashIdx % slashMatches.length];
                    if (pick.cmd === "/cd") {
                        this.inputBuffer = "/cd ";
                        this.cursorPos = this.inputBuffer.length;
                        this.slashIdx = 0;
                        this.render();
                        return;
                    }
                    submitted = pick.cmd;
                }

                this.inputBuffer = "";
                this.cursorPos = 0;
                this.slashIdx = 0;
                this.historyIdx = -1;
                if (!submitted) {
                    this.render();
                    return;
                }
                this.history.push(submitted);
                this.scrollOffset = 0;

                if (submitted.startsWith("!") && submitted.length > 1) {
                    await this.runLocalShell(submitted.slice(1).trim());
                    return;
                }

                if (submitted.startsWith("/")) {
                    await this.handleSlashCommand(submitted);
                    return;
                }

                await this.dispatchPrompt(submitted);
                return;
            }

            if (str && !key.ctrl && !key.meta) {
                const clean = str.replace(/[\r\n\t]/g, " ");
                if (clean) {
                    this.inputBuffer =
                        this.inputBuffer.slice(0, this.cursorPos) +
                        clean +
                        this.inputBuffer.slice(this.cursorPos);
                    this.cursorPos += clean.length;
                    this.slashIdx = 0;
                    this.render();
                }
            }
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CENTERED POPUP MODALS
    // ──────────────────────────────────────────────────────────────────────────

    openModelModal() {
        const idx = Math.max(0, MODEL_CATALOG.findIndex((m) => m.id === this.activeModel));
        this.modal = {
            type: "model",
            title: "Select Model",
            subtitle: `${MODEL_CATALOG.length} live T450 models`,
            query: "",
            cursor: idx
        };
        this.render();
    }

    openCommandPaletteModal() {
        this.modal = {
            type: "command",
            title: "Command Palette",
            subtitle: "WaHarness",
            query: "",
            cursor: 0
        };
        this.render();
    }

    openThemeModal() {
        const keys = Object.keys(THEMES);
        const idx = Math.max(0, keys.indexOf(this.themeName));
        this.modal = {
            type: "theme",
            title: "Select Theme",
            subtitle: "Live preview",
            query: "",
            cursor: idx,
            prevTheme: this.themeName
        };
        this.render();
    }

    openInfoModal(title, lines) {
        this.modal = {
            type: "info",
            title,
            lines
        };
        this.render();
    }

    getModalItems() {
        if (!this.modal) return [];
        const q = (this.modal.query || "").toLowerCase().trim();
        if (this.modal.type === "model") {
            const list = MODEL_CATALOG.map((m) => ({
                id: m.id,
                title: m.id,
                desc: m.label,
                badge: m.provider,
                active: m.id === this.activeModel
            }));
            if (!q) return list;
            return list.filter(
                (it) =>
                    it.title.toLowerCase().includes(q) ||
                    it.desc.toLowerCase().includes(q) ||
                    it.badge.toLowerCase().includes(q)
            );
        }
        if (this.modal.type === "command") {
            const list = SLASH_COMMANDS.map((c) => ({
                id: c.cmd,
                title: c.cmd,
                desc: c.desc,
                badge: "",
                active: false
            }));
            if (!q) return list;
            return list.filter(
                (it) => it.title.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)
            );
        }
        if (this.modal.type === "theme") {
            const list = Object.entries(THEMES).map(([k, v]) => ({
                id: k,
                title: k,
                desc: v.name,
                badge: "",
                active: k === this.themeName
            }));
            if (!q) return list;
            return list.filter(
                (it) => it.title.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)
            );
        }
        return [];
    }

    async handleModalKey(str, key) {
        if (!this.modal) return;

        if (this.modal.type === "info") {
            if (key.name === "escape" || key.name === "return" || key.name === "enter" || key.name === "space") {
                this.modal = null;
                this.render();
            }
            return;
        }

        const items = this.getModalItems();

        if (key.name === "escape") {
            if (this.modal.type === "theme" && this.modal.prevTheme) {
                this.themeName = this.modal.prevTheme;
            }
            this.modal = null;
            this.render();
            return;
        }

        if (key.name === "up" || (key.ctrl && key.name === "p")) {
            if (items.length > 0) {
                this.modal.cursor = (this.modal.cursor - 1 + items.length) % items.length;
                if (this.modal.type === "theme" && items[this.modal.cursor]) {
                    this.themeName = items[this.modal.cursor].id;
                }
                this.render();
            }
            return;
        }

        if (key.name === "down" || (key.ctrl && key.name === "n")) {
            if (items.length > 0) {
                this.modal.cursor = (this.modal.cursor + 1) % items.length;
                if (this.modal.type === "theme" && items[this.modal.cursor]) {
                    this.themeName = items[this.modal.cursor].id;
                }
                this.render();
            }
            return;
        }

        if (key.name === "pageup" || key.name === "left") {
            if (items.length > 0) {
                this.modal.cursor = Math.max(0, this.modal.cursor - 8);
                this.render();
            }
            return;
        }

        if (key.name === "pagedown" || key.name === "right") {
            if (items.length > 0) {
                this.modal.cursor = Math.min(items.length - 1, this.modal.cursor + 8);
                this.render();
            }
            return;
        }

        if (key.name === "return" || key.name === "enter") {
            const picked = items[this.modal.cursor];
            const type = this.modal.type;
            this.modal = null;
            if (picked) {
                if (type === "model") {
                    this.activeModel = picked.id;
                    this.persistPreferences();
                    this.showToast(`Model switched to ${picked.id}`);
                } else if (type === "theme") {
                    this.themeName = picked.id;
                    this.persistPreferences();
                    this.showToast(`Theme set to ${THEMES[picked.id].name}`);
                } else if (type === "command") {
                    if (picked.id === "/cd") {
                        this.inputBuffer = "/cd ";
                        this.cursorPos = this.inputBuffer.length;
                        this.render();
                        return;
                    }
                    await this.handleSlashCommand(picked.id);
                    return;
                }
            }
            this.render();
            return;
        }

        if (key.name === "backspace") {
            if (this.modal.query.length > 0) {
                this.modal.query = this.modal.query.slice(0, -1);
                this.modal.cursor = 0;
                this.render();
            }
            return;
        }

        if (str && !key.ctrl && !key.meta && /^[\x20-\x7E]$/.test(str)) {
            this.modal.query += str;
            this.modal.cursor = 0;
            this.render();
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PSEUDO-STREAMING & SPINNER ENGINE
    // ──────────────────────────────────────────────────────────────────────────

    startSpinner(statusText = "Thinking...") {
        this.stopSpinner();
        this.spinnerStatus = statusText;
        this.spinnerStart = Date.now();
        this.spinnerFrame = 0;
        this.spinnerTimer = setInterval(() => {
            this.spinnerFrame++;
            this.render();
        }, 90);
        this.render();
    }

    updateSpinner(statusText) {
        this.spinnerStatus = statusText;
        this.render();
    }

    stopSpinner() {
        if (this.spinnerTimer) {
            clearInterval(this.spinnerTimer);
            this.spinnerTimer = null;
        }
    }

    cancelInFlight() {
        if (!this.inFlight) return;
        this.clearPollTimer();
        this.stopSpinner();
        if (this.activeReq && this.activeReq.id) {
            this.completedIds.add(this.activeReq.id);
        }
        this.activeReq = null;
        this.inFlight = false;
        this.messages.push({ role: "system", text: "✗ Turn cancelled by user." });
        this.render();
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

    pseudoStreamAssistantMessage(fullText, model, dur) {
        if (this.streamTimer) clearInterval(this.streamTimer);
        const text = String(fullText || "").trim();
        const msgObj = {
            role: "assistant",
            text: "",
            model: model || this.activeModel,
            dur: dur || 0,
            streaming: true
        };
        this.messages.push(msgObj);

        if (text.length <= 40) {
            msgObj.text = text;
            msgObj.streaming = false;
            this.inFlight = false;
            this.render();
            return;
        }

        const totalFrames = 26;
        const step = Math.max(12, Math.ceil(text.length / totalFrames));
        let pos = 0;

        this.streamTimer = setInterval(() => {
            pos = Math.min(text.length, pos + step);
            msgObj.text = text.slice(0, pos);
            this.scrollOffset = 0;
            if (pos >= text.length) {
                clearInterval(this.streamTimer);
                this.streamTimer = null;
                msgObj.streaming = false;
                this.inFlight = false;
            }
            this.render();
        }, 26);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SLASH COMMANDS & AGENT DISPATCH
    // ──────────────────────────────────────────────────────────────────────────

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

    async handleSlashCommand(cmd) {
        const parts = cmd.trim().split(/\s+/);
        const action = parts[0].toLowerCase().replace(/\.+$/, "");
        const arg = parts.slice(1).join(" ").trim();

        switch (action) {
            case "/model":
            case "/models":
                if (arg) {
                    const matched = this.findModelByQuery(arg);
                    if (matched) {
                        this.activeModel = matched.id;
                        this.persistPreferences();
                        this.showToast(`Switched model to ${matched.id}`);
                    } else {
                        this.activeModel = arg;
                        this.persistPreferences();
                        this.showToast(`Switched model to ${arg}`);
                    }
                } else {
                    this.openModelModal();
                }
                break;

            case "/theme":
            case "/themes":
                if (arg && THEMES[arg.toLowerCase()]) {
                    this.themeName = arg.toLowerCase();
                    this.persistPreferences();
                    this.showToast(`Theme switched to ${this.T.name}`);
                } else {
                    this.openThemeModal();
                }
                break;

            case "/update":
                if (arg.toLowerCase() === "check") {
                    this.showToast("Checking GitHub for updates...");
                    await this.checkForUpdates(true);
                    return;
                }
                this.inFlight = true;
                this.startSpinner("Updating WaHarness via Homebrew (brew update && brew upgrade waharness)...");
                const updRes = await executeCommand("brew update && brew upgrade waharness", this.cwd, 180);
                this.stopSpinner();
                this.inFlight = false;
                if (updRes.code === 0) {
                    this.updateAvailable = null;
                    this.showToast("Upgrade complete! Run /exit then waharness to use the new version.", 5000);
                } else {
                    const errMsg = (updRes.err || updRes.out || "Upgrade failed").split("\n")[0];
                    this.showToast(`Update failed: ${clipPlain(errMsg, 55)}`, 5000);
                }
                this.render();
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
                this.showToast(`Switched mode to ${this.mode.toUpperCase()}`);
                break;

            case "/cd":
                if (!arg) {
                    this.showToast(`Workspace: ${shortPath(this.cwd)} (Usage: /cd <path>)`);
                    return;
                }
                const expanded = arg.startsWith("~") ? path.join(os.homedir(), arg.slice(1)) : arg;
                const targetDir = path.isAbsolute(expanded) ? expanded : path.resolve(this.cwd, expanded);
                if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
                    this.showToast(`Directory not found: ${targetDir}`);
                    return;
                }
                this.cwd = targetDir;
                process.chdir(targetDir);
                this.showToast(`Workspace changed to ${shortPath(this.cwd)}`);
                break;

            case "/undo":
                const undoRes = undoLastEdit();
                this.showToast(undoRes.ok ? undoRes.message : undoRes.error);
                break;

            case "/status":
                this.openInfoModal("Session Status", [
                    `Tunnel     : ${this.transport.connected ? "Connected (Zero-Rate WhatsApp)" : "Reconnecting..."}`,
                    `Target JID : ${this.transport.targetChat || "self-chat"} (!WAH_ isolated)`,
                    `Model      : ${this.activeModel}`,
                    `Mode       : ${this.mode.toUpperCase()} (${this.mode === "plan" ? "Read-only" : "Read/Write"})`,
                    `Theme      : ${this.T.name}`,
                    `Workspace  : ${this.cwd}`,
                    `Auth Path  : ${this.transport.authDir}`,
                    `Messages   : ${this.messages.length} in current view`
                ]);
                break;

            case "/help":
                this.openInfoModal("OpenCode Shortcuts & Commands", [
                    "Ctrl+P         : Open centered Command Palette popup",
                    "/models        : Open centered 29-model selector popup",
                    "/theme         : Open centered live theme switcher popup",
                    "Tab            : Toggle Build <-> Plan mode (or complete /cmd)",
                    "!<command>     : Execute local Mac shell command (!git status)",
                    "@<filepath>    : Attach local Mac file into prompt (@app.js)",
                    "/cd <dir>      : Switch active Mac directory & isolated session",
                    "/undo          : Revert last file edit made by the agent",
                    "/new           : Reset isolated T450 session for this workspace",
                    "PgUp / PgDn    : Scroll conversation history",
                    "Esc            : Dismiss popup or cancel in-flight turn"
                ]);
                break;

            case "/clear":
                this.messages = [];
                this.scrollOffset = 0;
                this.render();
                break;

            case "/new":
                this.messages = [];
                this.scrollOffset = 0;
                if (!this.transport.connected) {
                    this.showToast("Cleared local view (tunnel offline).");
                    return;
                }
                const reqId = Math.random().toString(36).substring(2, 10);
                this.inFlight = true;
                this.activeReq = { id: reqId, cmd: "new", cwd: this.cwd };
                this.startSpinner("Resetting isolated T450 workspace session...");
                await this.transport.sendMessage("!WAH_CMD:" + JSON.stringify(this.activeReq));
                break;

            case "/exec":
                if (arg) await this.runLocalShell(arg);
                break;

            case "/exit":
            case "/quit":
                this.cleanupAndExit();
                break;

            default:
                this.openCommandPaletteModal();
                break;
        }
    }

    async runLocalShell(localCmd) {
        this.messages.push({ role: "user", text: `!${localCmd}`, mode: "shell" });
        this.inFlight = true;
        this.startSpinner(`Running local shell: ${localCmd}`);
        const res = await executeCommand(localCmd, this.cwd);
        this.stopSpinner();
        this.inFlight = false;
        const out = [res.out ? res.out.trimEnd() : "", res.err ? res.err.trimEnd() : ""].filter(Boolean).join("\n");
        this.messages.push({
            role: "tool",
            action: "shell",
            detail: localCmd,
            dur: res.dur,
            ok: res.code === 0,
            output: out ? out.split("\n").slice(0, 18) : []
        });
        this.render();
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

    async waitForConnection(maxWaitMs = 8000) {
        const start = Date.now();
        while (!this.transport.connected && Date.now() - start < maxWaitMs) {
            await new Promise((r) => setTimeout(r, 250));
        }
        return this.transport.connected;
    }

    async dispatchPrompt(userPrompt) {
        const attachments = this.resolveInlineMentions(userPrompt);
        this.messages.push({
            role: "user",
            text: userPrompt,
            mode: this.mode,
            attachments: Object.keys(attachments)
        });

        this.inFlight = true;
        this.startSpinner(`Thinking (${this.activeModel})...`);

        if (!(await this.waitForConnection(8000))) {
            this.stopSpinner();
            this.inFlight = false;
            this.messages.push({
                role: "system",
                text: "✗ Tunnel is currently offline. Wait a moment for automatic reconnect."
            });
            this.render();
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
            this.inFlight = false;
            this.messages.push({ role: "system", text: `✗ Send failed: ${e.message}` });
            this.render();
        }
    }

    async handleInbound({ text }) {
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

                this.messages.push({
                    role: "tool",
                    action: req.action === "bash" ? "shell" : req.action,
                    detail,
                    dur: result.dur,
                    ok: !result.error,
                    added: result.added,
                    removed: result.removed,
                    diffPreview: result.diffPreview
                });
                this.updateSpinner(`Thinking (${this.activeModel})...`);

                const replyPkt = `${pfx}TOOL_RES:` + JSON.stringify({ id: req.id, result });
                await this.transport.sendMessage(replyPkt);
            } catch (e) {
                this.messages.push({ role: "system", text: `✗ Tool error: ${e.message}` });
                this.render();
            }
            return;
        }

        if (text.startsWith("!WAH_DONE:")) {
            try {
                const data = JSON.parse(text.substring("!WAH_DONE:".length).trim());
                if (data.id && this.completedIds.has(data.id)) return;
                if (data.id) this.completedIds.add(data.id);

                this.clearPollTimer();
                this.stopSpinner();
                this.activeReq = null;

                this.pseudoStreamAssistantMessage(
                    data.text || "(Done)",
                    data.model || this.activeModel,
                    data.dur || 0
                );
            } catch (e) {
                this.clearPollTimer();
                this.stopSpinner();
                this.activeReq = null;
                this.inFlight = false;
                this.messages.push({
                    role: "assistant",
                    text: text.substring("!WAH_DONE:".length),
                    model: this.activeModel,
                    dur: 0
                });
                this.render();
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // FULL-SCREEN CENTERED OPENCODE COMPOSITOR & RENDERER
    // ──────────────────────────────────────────────────────────────────────────

    buildPromptBoxLines(boxWidth) {
        const T = this.T;
        const innerW = boxWidth - 4;
        const borderCol = this.mode === "plan" ? T.info : T.primary;
        const modeTitle = this.mode === "plan" ? "Plan" : "Build";
        const placeholder = PLACEHOLDERS[this.placeholderIdx % PLACEHOLDERS.length];

        let inputLine;
        if (this.inputBuffer.length > 0) {
            const before = this.inputBuffer.slice(0, this.cursorPos);
            const at = this.inputBuffer[this.cursorPos] || " ";
            const after = this.inputBuffer.slice(this.cursorPos + 1);
            const combined = `${T.text}${before}${T.selectBg}${at}${RESET}${T.text}${after}${RESET}`;
            if (this.inputBuffer.length + 1 > innerW) {
                const start = Math.max(0, this.cursorPos - (innerW - 6));
                const slice = this.inputBuffer.slice(start, start + innerW - 3);
                const relCur = this.cursorPos - start;
                const b = slice.slice(0, relCur);
                const c = slice[relCur] || " ";
                const a = slice.slice(relCur + 1);
                inputLine = `${T.muted}…${T.text}${b}${T.selectBg}${c}${RESET}${T.text}${a}${RESET}`;
            } else {
                inputLine = combined;
            }
        } else {
            inputLine = `${T.selectBg} ${RESET} ${T.muted}${clipPlain(placeholder, innerW - 3)}${RESET}`;
        }

        const modelObj = MODEL_CATALOG.find((m) => m.id === this.activeModel);
        const providerName = modelObj ? modelObj.provider : "T450";
        const metaLeft = `${borderCol}${BOLD}${modeTitle}${RESET} ${T.muted}·${RESET} ${T.text}${this.activeModel}${RESET} ${T.muted}· ${providerName}${RESET}`;
        const metaRight = `${T.muted}tab${RESET} ${T.subtle}mode${RESET}  ${T.muted}ctrl+p${RESET} ${T.subtle}commands${RESET}`;
        const gap = Math.max(1, innerW - visibleLen(metaLeft) - visibleLen(metaRight));
        const metaLine = visibleLen(metaLeft) + visibleLen(metaRight) + 1 <= innerW
            ? metaLeft + " ".repeat(gap) + metaRight
            : fitAnsi(metaLeft, innerW);

        const lines = [];
        // Optional inline slash autocomplete dropdown right above the composer box
        const suggestions = this.getSlashSuggestions();
        if (suggestions.length > 0 && !this.modal && !this.inFlight) {
            const maxShow = Math.min(6, suggestions.length);
            lines.push(`${T.subtle}╭${"─".repeat(boxWidth - 2)}╮${RESET}`);
            for (let i = 0; i < maxShow; i++) {
                const s = suggestions[i];
                const isSel = i === (this.slashIdx % suggestions.length);
                const plainRow = ` ${s.cmd.padEnd(11)} ${clipPlain(s.desc, innerW - 14)}`.slice(0, innerW).padEnd(innerW, " ");
                if (isSel) {
                    lines.push(`${T.subtle}│${RESET} ${T.selectBg}${BOLD}${plainRow}${RESET} ${T.subtle}│${RESET}`);
                } else {
                    const rowStr = ` ${T.primary}${s.cmd.padEnd(11)}${RESET} ${T.muted}${clipPlain(s.desc, innerW - 14)}${RESET}`;
                    lines.push(`${T.subtle}│${RESET} ${padVisible(rowStr, innerW)} ${T.subtle}│${RESET}`);
                }
            }
        }

        lines.push(
            `${borderCol}╭${"─".repeat(boxWidth - 2)}╮${RESET}`,
            `${borderCol}│${RESET} ${padVisible(inputLine, innerW)} ${borderCol}│${RESET}`,
            `${borderCol}│${RESET} ${" ".repeat(innerW)} ${borderCol}│${RESET}`,
            `${borderCol}│${RESET} ${padVisible(metaLine, innerW)} ${borderCol}│${RESET}`,
            `${borderCol}╰${"─".repeat(boxWidth - 2)}╯${RESET}`
        );
        return lines;
    }

    buildConversationLines(colWidth) {
        const T = this.T;
        const textWidth = colWidth - 6;
        const lines = [];

        for (const m of this.messages) {
            if (m.role === "user") {
                const bar = m.mode === "plan" ? T.info : T.primary;
                lines.push(`${bar}┃${RESET}`);
                for (const wLine of wrapText(m.text, textWidth)) {
                    lines.push(`${bar}┃${RESET}  ${T.text}${BOLD}${wLine}${RESET}`);
                }
                if (m.attachments && m.attachments.length > 0) {
                    lines.push(`${bar}┃${RESET}  ${T.info}@ ${m.attachments.join("  @")}${RESET}`);
                }
                lines.push(`${bar}┃${RESET}`);
                lines.push("");
            } else if (m.role === "tool") {
                const icon = m.ok ? `${T.success}✓${RESET}` : `${T.error}✗${RESET}`;
                const diffInfo = (m.added !== undefined || m.removed !== undefined)
                    ? ` ${T.success}+${m.added || 0}${RESET} ${T.error}-${m.removed || 0}${RESET}`
                    : "";
                const durInfo = m.dur !== undefined ? ` ${T.muted}(${m.dur}s)${RESET}` : "";
                const clipped = clipPlain(String(m.detail || "").replace(/\s+/g, " "), Math.max(16, textWidth - 24));
                lines.push(`   ${icon} ${T.info}${m.action}${RESET} ${T.muted}${clipped}${RESET}${diffInfo}${durInfo}`);

                if (Array.isArray(m.diffPreview)) {
                    for (const d of m.diffPreview) {
                        const sign = d.type === "add" ? `${T.success}+` : `${T.error}-`;
                        const c = d.type === "add" ? T.success : T.error;
                        lines.push(`     ${sign} ${c}${clipPlain(d.text, textWidth - 8)}${RESET}`);
                    }
                }
                if (Array.isArray(m.output) && m.output.length > 0) {
                    for (const oLine of m.output) {
                        lines.push(`     ${T.subtle}│${RESET} ${T.muted}${clipPlain(oLine, textWidth - 8)}${RESET}`);
                    }
                }
            } else if (m.role === "assistant") {
                lines.push("");
                let inCode = false;
                for (const rawLine of String(m.text || "").replace(/\r\n/g, "\n").split("\n")) {
                    const trimmed = rawLine.trim();
                    if (trimmed.startsWith("```")) {
                        if (!inCode) {
                            inCode = true;
                            const lang = trimmed.slice(3).trim() || "code";
                            lines.push(`   ${T.subtle}┌── ${T.info}${lang}${T.subtle} ${"─".repeat(Math.max(4, textWidth - lang.length - 8))}${RESET}`);
                        } else {
                            inCode = false;
                            lines.push(`   ${T.subtle}└${"─".repeat(Math.max(4, textWidth - 2))}${RESET}`);
                        }
                        continue;
                    }
                    if (inCode) {
                        lines.push(`   ${T.subtle}│${RESET} ${T.info}${clipPlain(rawLine, textWidth - 4)}${RESET}`);
                        continue;
                    }
                    for (const wLine of wrapText(rawLine, textWidth)) {
                        let fmt = wLine;
                        if (/^#{1,3}\s+/.test(fmt)) {
                            fmt = `${T.primary}${BOLD}${fmt.replace(/^#{1,3}\s+/, "")}${RESET}`;
                        } else {
                            fmt = fmt.replace(/\*\*([^*]+)\*\*/g, `${T.text}${BOLD}$1${RESET}`);
                            fmt = fmt.replace(/`([^`]+)`/g, `${T.info}$1${RESET}`);
                            if (/^\s*[-*]\s+/.test(fmt)) {
                                fmt = fmt.replace(/^(\s*)[-*]\s+/, `$1${T.primary}•${RESET} `);
                            }
                        }
                        lines.push(`   ${T.text}${fmt}${RESET}`);
                    }
                }
                const cursorTail = m.streaming ? ` ${T.primary}▋${RESET}` : "";
                lines.push(`   ${T.primary}▣${RESET} ${T.muted}${m.model} · ${m.dur}s${RESET}${cursorTail}`);
                lines.push("");
            } else if (m.role === "system") {
                lines.push(`   ${T.muted}${m.text}${RESET}`);
                lines.push("");
            }
        }

        if (this.inFlight) {
            const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
            const elapsed = ((Date.now() - this.spinnerStart) / 1000).toFixed(1);
            const st = clipPlain(this.spinnerStatus, Math.max(18, textWidth - 28));
            lines.push(`   ${T.primary}${frame}${RESET} ${T.text}${st}${RESET} ${T.muted}(${elapsed}s · esc to cancel)${RESET}`);
            lines.push("");
        }

        return lines;
    }

    buildModalBox() {
        if (!this.modal) return null;
        const T = this.T;
        const modalW = Math.min(72, this.cols - 4);
        const innerW = modalW - 4;

        const headerRow = (titleText, subText) => {
            const left = `${T.text}${BOLD}${titleText}${RESET}${subText ? `  ${T.muted}${subText}${RESET}` : ""}`;
            const right = `${T.muted}esc${RESET}`;
            const leftFitted = fitAnsi(left, Math.max(10, innerW - 4));
            const gap = Math.max(1, innerW - visibleLen(leftFitted) - 3);
            return `${T.primary}│${RESET} ${leftFitted}${" ".repeat(gap)}${right} ${T.primary}│${RESET}`;
        };

        if (this.modal.type === "info") {
            const box = [
                `${T.primary}╭${"─".repeat(modalW - 2)}╮${RESET}`,
                headerRow(this.modal.title, ""),
                `${T.primary}├${"─".repeat(modalW - 2)}┤${RESET}`
            ];
            for (const l of this.modal.lines || []) {
                box.push(`${T.primary}│${RESET} ${padVisible(`${T.text}${clipPlain(l, innerW)}${RESET}`, innerW)} ${T.primary}│${RESET}`);
            }
            box.push(`${T.primary}╰${"─".repeat(modalW - 2)}╯${RESET}`);
            return { width: modalW, lines: box };
        }

        const items = this.getModalItems();
        if (this.modal.cursor >= items.length) {
            this.modal.cursor = Math.max(0, items.length - 1);
        }
        const pageSize = Math.min(10, Math.max(5, this.rows - 12));
        const start = Math.max(0, Math.min(this.modal.cursor - Math.floor(pageSize / 2), Math.max(0, items.length - pageSize)));
        const end = Math.min(items.length, start + pageSize);

        const searchStr = this.modal.query
            ? `${T.text}${BOLD}${clipPlain(this.modal.query, innerW - 5)}${T.primary}█${RESET}`
            : `${T.muted}Type to filter or use ↑/↓ arrows...${RESET}`;

        const box = [
            `${T.primary}╭${"─".repeat(modalW - 2)}╮${RESET}`,
            headerRow(this.modal.title, this.modal.subtitle || ""),
            `${T.primary}│${RESET} ${padVisible(`${T.info}❯${RESET} ${searchStr}`, innerW)} ${T.primary}│${RESET}`,
            `${T.primary}├${"─".repeat(modalW - 2)}┤${RESET}`
        ];

        if (items.length === 0) {
            box.push(`${T.primary}│${RESET} ${padVisible(`${T.error}No matches for "${clipPlain(this.modal.query, innerW - 20)}"${RESET}`, innerW)} ${T.primary}│${RESET}`);
        } else {
            const titleColW = Math.min(28, Math.floor(innerW * 0.48));
            const descColW = Math.max(10, innerW - titleColW - 6);
            for (let i = start; i < end; i++) {
                const it = items[i];
                const isSel = i === this.modal.cursor;
                const dot = it.active ? "●" : " ";
                const tPlain = clipPlain(it.title, titleColW).padEnd(titleColW, " ");
                const dPlain = clipPlain(it.desc, descColW).padEnd(descColW, " ");

                if (isSel) {
                    const rowPlain = `▌ ${dot} ${tPlain} ${dPlain}`.slice(0, innerW).padEnd(innerW, " ");
                    box.push(`${T.primary}│${RESET} ${T.selectBg}${BOLD}${rowPlain}${RESET} ${T.primary}│${RESET}`);
                } else {
                    const dotCol = it.active ? `${T.success}●${RESET}` : " ";
                    const tCol = it.active ? `${T.primary}${BOLD}${tPlain}${RESET}` : `${T.text}${tPlain}${RESET}`;
                    const dCol = `${T.muted}${dPlain}${RESET}`;
                    const rowStr = `  ${dotCol} ${tCol} ${dCol}`;
                    box.push(`${T.primary}│${RESET} ${padVisible(rowStr, innerW)} ${T.primary}│${RESET}`);
                }
            }
        }

        const footerLeft = items.length > 0 ? `${start + 1}-${end} of ${items.length}` : "0 items";
        const footerRight = "↑/↓ move · enter select · esc close";
        const fGap = Math.max(1, innerW - footerLeft.length - footerRight.length);
        const footerContent = footerLeft.length + footerRight.length + 1 <= innerW
            ? `${T.muted}${footerLeft}${" ".repeat(fGap)}${footerRight}${RESET}`
            : `${T.muted}${clipPlain(footerLeft, innerW)}${RESET}`;

        box.push(
            `${T.primary}├${"─".repeat(modalW - 2)}┤${RESET}`,
            `${T.primary}│${RESET} ${padVisible(footerContent, innerW)} ${T.primary}│${RESET}`,
            `${T.primary}╰${"─".repeat(modalW - 2)}╯${RESET}`
        );

        return { width: modalW, lines: box };
    }

    render() {
        const T = this.T;
        const W = this.cols;
        const H = this.rows;
        const screen = new Array(H).fill("");

        const centerLine = (lineStr, widthHint = null) => {
            const vLen = widthHint !== null ? widthHint : visibleLen(lineStr);
            const padLeft = Math.max(0, Math.floor((W - vLen) / 2));
            return fitAnsi(" ".repeat(padLeft) + lineStr, W - 1);
        };

        const boxWidth = Math.min(76, W - 4);
        const promptBox = this.buildPromptBoxLines(boxWidth);

        // 1. HOME ROUTE
        if (this.messages.length === 0 && !this.inFlight) {
            const block = [];
            if (this.qrLines && this.qrLines.length > 0) {
                block.push(centerLine(`${T.primary}${BOLD}Scan QR in WhatsApp -> Linked Devices${RESET}`));
                block.push("");
                for (const ql of this.qrLines) {
                    block.push(centerLine(ql));
                }
            } else {
                for (const [leftPart, gapPart, rightPart] of LOGO_LINES) {
                    const logoRow = `${T.muted}${leftPart}${RESET}${gapPart}${T.text}${BOLD}${rightPart}${RESET}`;
                    block.push(centerLine(logoRow, 46));
                }
                if (this.updateAvailable) {
                    block.push(centerLine(`${T.primary}/update${RESET} ${T.muted}to install v${this.updateAvailable} (current v${APP_VERSION})${RESET}`));
                } else {
                    block.push("");
                }
                for (const pLine of promptBox) {
                    block.push(centerLine(pLine, boxWidth));
                }
                block.push("");
                const tip = `${T.muted}Type ${T.text}/${T.muted} for commands · ${T.text}/models${T.muted} for 29 models · ${T.text}tab${T.muted} build/plan · ${T.text}ctrl+p${T.muted} palette${RESET}`;
                block.push(centerLine(tip));

                if (this.toast) {
                    block.push("");
                    block.push(centerLine(`${T.primary}● ${this.toast}${RESET}`));
                }
            }

            const startRow = Math.max(1, Math.floor((H - 2 - block.length) / 2));
            for (let i = 0; i < block.length && startRow + i < H - 1; i++) {
                screen[startRow + i] = block[i];
            }
        } else {
            // 2. SESSION ROUTE
            const topLeft = `  ${T.primary}▣${RESET} ${T.text}${BOLD}WAHARNESS${RESET}  ${T.muted}${shortPath(this.cwd)}${RESET}`;
            const topRight = this.toast
                ? `${T.primary}● ${this.toast}${RESET}  `
                : `${T.muted}${this.activeModel}${RESET}  `;
            const topGap = Math.max(1, W - 1 - visibleLen(topLeft) - visibleLen(topRight));
            screen[0] = fitAnsi(topLeft + " ".repeat(topGap) + topRight, W - 1);
            screen[1] = `${T.subtle}${"─".repeat(W - 1)}${RESET}`;

            const convLines = this.buildConversationLines(boxWidth);
            const availRows = Math.max(3, H - 2 - promptBox.length - 1);
            const maxOffset = Math.max(0, convLines.length - availRows);
            if (this.scrollOffset > maxOffset) this.scrollOffset = maxOffset;

            const endIdx = convLines.length - this.scrollOffset;
            const startIdx = Math.max(0, endIdx - availRows);
            const visibleConv = convLines.slice(startIdx, endIdx);

            const leftPad = " ".repeat(Math.max(0, Math.floor((W - boxWidth) / 2)));
            for (let i = 0; i < visibleConv.length; i++) {
                screen[2 + i] = fitAnsi(leftPad + visibleConv[i], W - 1);
            }

            const promptStartRow = H - 1 - promptBox.length;
            for (let i = 0; i < promptBox.length; i++) {
                if (promptStartRow + i >= 2) {
                    screen[promptStartRow + i] = centerLine(promptBox[i], boxWidth);
                }
            }
        }

        // 3. BOTTOM FOOTER BAR
        const connBadge = this.transport.connected
            ? `${T.success}●${RESET} ${T.muted}zero-rate tunnel${RESET}`
            : `${T.primary}◌${RESET} ${T.muted}connecting...${RESET}`;
        const footLeft = `  ${T.muted}${shortPath(this.cwd)}${RESET}`;
        const verTag = this.updateAvailable
            ? `${T.primary}v${APP_VERSION} -> v${this.updateAvailable} (/update)${RESET}`
            : `${T.muted}v${APP_VERSION}${RESET}`;
        const footRight = `${connBadge} ${T.subtle}·${RESET} ${verTag}  `;
        const footGap = Math.max(1, W - 1 - visibleLen(footLeft) - visibleLen(footRight));
        screen[H - 1] = fitAnsi(footLeft + " ".repeat(footGap) + footRight, W - 1);

        // 4. CENTERED FLOATING MODAL POPUP OVERLAY
        if (this.modal) {
            const modalObj = this.buildModalBox();
            if (modalObj) {
                const mTop = Math.max(1, Math.floor((H - modalObj.lines.length) / 2));
                for (let i = 0; i < modalObj.lines.length && mTop + i < H - 1; i++) {
                    screen[mTop + i] = centerLine(modalObj.lines[i], modalObj.width);
                }
            }
        }

        // Atomic absolute-row flush (never emits trailing newline on row H so terminal never scrolls)
        let buf = "";
        for (let r = 0; r < H; r++) {
            buf += `\x1b[${r + 1};1H\x1b[2K${screen[r]}`;
        }
        process.stdout.write(buf);
    }
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(`waharness ${APP_VERSION}`);
    process.exit(0);
}

const app = new WaHarnessTUI();
app.start();
