const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const SESSION_SIDEBAR_WIDTH = 42;
const WIDE_BREAKPOINT = 120;

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

function padVisible(s, width, bgAnsi = "") {
    const v = visibleLen(s);
    if (v > width) return fitAnsi(s, width);
    if (v === width) return s;
    const pad = " ".repeat(width - v);
    return bgAnsi ? `${s}${bgAnsi}${pad}${RESET}` : `${s}${pad}`;
}

// OpenCode v2 semantic color palettes (24-bit TrueColor + 16-color System fallback)
const THEMES = {
    opencode: {
        name: "OpenCode v2 Dark",
        primary: "\x1b[38;2;118;153;254m",      // #7699fe interactive blue
        secondary: "\x1b[38;2;236;176;129m",    // #ecb081 warm orange/peach
        accent: "\x1b[38;2;163;131;226m",       // #a383e2 purple
        info: "\x1b[38;2;86;182;194m",          // #56b6c2 teal cyan
        warning: "\x1b[38;2;245;167;66m",       // #f5a742 amber
        success: "\x1b[38;2;158;231;122m",      // #9ee77a green
        error: "\x1b[38;2;239;108;108m",        // #ef6c6c red
        text: "\x1b[38;2;255;255;255m",         // #ffffff neutral.100
        muted: "\x1b[38;2;128;128;128m",        // #808080 neutral.300
        subtle: "\x1b[38;2;72;72;72m",          // #484848 border.base
        bgBase: "\x1b[48;2;8;8;8m",             // #080808 background.base
        bgRaised: "\x1b[48;2;20;20;20m",        // #141414 background.raised.base (sidebar/tabs)
        bgRaisedHigh: "\x1b[48;2;32;32;32m",    // #202020 background.raised.high (active tab)
        diffAdd: "\x1b[48;2;32;48;59m\x1b[38;2;79;214;190m",   // #4fd6be on #20303b
        diffDel: "\x1b[48;2;55;34;44m\x1b[38;2;197;59;83m",    // #c53b53 on #37222c
        selectBg: "\x1b[48;2;118;153;254m\x1b[38;2;8;8;8m"
    },
    "opencode-classic": {
        name: "OpenCode Classic Peach",
        primary: "\x1b[38;2;250;178;131m",      // #fab283 peach
        secondary: "\x1b[38;2;92;156;245m",     // #5c9cf5 blue
        accent: "\x1b[38;2;157;124;216m",       // #9d7cd8 lavender
        info: "\x1b[38;2;86;182;194m",          // #56b6c2 teal
        warning: "\x1b[38;2;245;167;66m",       // #f5a742 amber
        success: "\x1b[38;2;127;216;143m",      // #7fd88f mint
        error: "\x1b[38;2;224;108;117m",        // #e06c75 coral
        text: "\x1b[38;2;238;238;238m",         // #eeeeee
        muted: "\x1b[38;2;128;128;128m",        // #808080
        subtle: "\x1b[38;2;72;72;72m",          // #484848
        bgBase: "\x1b[48;2;10;10;10m",
        bgRaised: "\x1b[48;2;20;20;20m",
        bgRaisedHigh: "\x1b[48;2;34;34;34m",
        diffAdd: "\x1b[48;2;32;48;59m\x1b[38;2;79;214;190m",
        diffDel: "\x1b[48;2;55;34;44m\x1b[38;2;197;59;83m",
        selectBg: "\x1b[48;2;250;178;131m\x1b[38;2;16;16;16m"
    },
    "opencode-light": {
        name: "OpenCode v2 Light",
        primary: "\x1b[38;2;59;125;216m",       // #3b7dd8
        secondary: "\x1b[38;2;196;113;58m",     // #c4713a
        accent: "\x1b[38;2;124;77;255m",
        info: "\x1b[38;2;49;135;149m",          // #318795
        warning: "\x1b[38;2;214;140;39m",       // #d68c27
        success: "\x1b[38;2;61;154;87m",        // #3d9a57
        error: "\x1b[38;2;209;56;61m",          // #d1383d
        text: "\x1b[38;2;16;16;16m",            // #101010
        muted: "\x1b[38;2;128;128;128m",        // #808080
        subtle: "\x1b[38;2;181;181;181m",       // #b5b5b5
        bgBase: "\x1b[48;2;255;255;255m",       // #ffffff
        bgRaised: "\x1b[48;2;242;242;242m",     // #f2f2f2
        bgRaisedHigh: "\x1b[48;2;230;230;230m", // #e6e6e6
        diffAdd: "\x1b[48;2;230;247;236m\x1b[38;2;34;134;58m",
        diffDel: "\x1b[48;2;252;232;235m\x1b[38;2;203;36;49m",
        selectBg: "\x1b[48;2;59;125;216m\x1b[38;2;255;255;255m"
    },
    system: {
        name: "System Native ANSI",
        primary: "\x1b[94m",
        secondary: "\x1b[93m",
        accent: "\x1b[95m",
        info: "\x1b[96m",
        warning: "\x1b[93m",
        success: "\x1b[92m",
        error: "\x1b[91m",
        text: "\x1b[97m",
        muted: "\x1b[90m",
        subtle: "\x1b[90m",
        bgBase: "",
        bgRaised: "",
        bgRaisedHigh: "\x1b[7m",
        diffAdd: "\x1b[92m",
        diffDel: "\x1b[91m",
        selectBg: "\x1b[7m"
    },
    tokyonight: {
        name: "Tokyo Night",
        primary: "\x1b[38;2;122;162;247m",
        secondary: "\x1b[38;2;187;154;247m",
        accent: "\x1b[38;2;187;154;247m",
        info: "\x1b[38;2;125;207;255m",
        warning: "\x1b[38;2;224;175;104m",
        success: "\x1b[38;2;158;206;106m",
        error: "\x1b[38;2;247;118;142m",
        text: "\x1b[38;2;192;202;245m",
        muted: "\x1b[38;2;115;122;162m",
        subtle: "\x1b[38;2;65;72;104m",
        bgBase: "\x1b[48;2;26;27;38m",
        bgRaised: "\x1b[48;2;31;35;53m",
        bgRaisedHigh: "\x1b[48;2;41;46;66m",
        diffAdd: "\x1b[48;2;32;48;59m\x1b[38;2;158;206;106m",
        diffDel: "\x1b[48;2;55;34;44m\x1b[38;2;247;118;142m",
        selectBg: "\x1b[48;2;122;162;247m\x1b[38;2;26;27;38m"
    },
    catppuccin: {
        name: "Catppuccin Mocha",
        primary: "\x1b[38;2;137;180;250m",
        secondary: "\x1b[38;2;250;179;135m",
        accent: "\x1b[38;2;203;166;247m",
        info: "\x1b[38;2;137;220;235m",
        warning: "\x1b[38;2;249;226;175m",
        success: "\x1b[38;2;166;227;161m",
        error: "\x1b[38;2;243;139;168m",
        text: "\x1b[38;2;205;214;244m",
        muted: "\x1b[38;2;147;153;178m",
        subtle: "\x1b[38;2;88;91;112m",
        bgBase: "\x1b[48;2;24;24;37m",
        bgRaised: "\x1b[48;2;30;30;46m",
        bgRaisedHigh: "\x1b[48;2;49;50;68m",
        diffAdd: "\x1b[48;2;30;48;42m\x1b[38;2;166;227;161m",
        diffDel: "\x1b[48;2;56;32;42m\x1b[38;2;243;139;168m",
        selectBg: "\x1b[48;2;203;166;247m\x1b[38;2;24;24;37m"
    }
};

function canonicalToolName(action) {
    const map = {
        bash: "shell",
        exec: "shell",
        read_file: "read",
        write_file: "write",
        edit_file: "edit",
        list_dir: "list",
        search: "grep",
        find: "glob"
    };
    return map[action] || action || "tool";
}

function shouldShowSidebar(cols, sidebarMode = "auto", hasMessages = false) {
    if (!hasMessages) return false;
    if (sidebarMode === "hide") return false;
    if (sidebarMode === "show") return cols >= 64;
    // OpenCode "auto": dock right sidebar automatically when width > 120
    return cols > WIDE_BREAKPOINT;
}

function computeSidebarWidth(cols) {
    if (cols > WIDE_BREAKPOINT) return SESSION_SIDEBAR_WIDTH;
    return Math.max(26, Math.min(SESSION_SIDEBAR_WIDTH, Math.floor(cols * 0.38)));
}

function estimateSessionTokens(tab) {
    let chars = 0;
    for (const m of tab.messages || []) {
        chars += String(m.text || "").length;
        if (Array.isArray(m.output)) {
            chars += m.output.join("\n").length;
        }
    }
    chars += (tab.contextFiles ? tab.contextFiles.size : 0) * 600;
    return Math.max(0, Math.round(chars / 4));
}

function buildTabBarLine({ tabs, activeTabIdx, width, theme: T, spinnerChar = "⠋", toast = null }) {
    const usableW = Math.max(20, width - 1);
    const rightBadge = toast
        ? `${T.bgRaised}${T.primary} ● ${clipPlain(toast, 30)} ${RESET}`
        : `${T.bgRaised}${T.muted} + new (ctrl+t) ${RESET}`;
    const rightW = visibleLen(rightBadge);
    const maxTabsArea = Math.max(12, usableW - rightW - 1);

    const perTabW = Math.max(
        10,
        Math.min(26, Math.floor((maxTabsArea - 3) / Math.max(1, tabs.length)))
    );

    let strip = "";
    let used = 0;
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        const isActive = i === activeTabIdx;
        const indicator = tab.busy
            ? `${T.primary}${spinnerChar}`
            : tab.unread
                ? `${T.primary}•`
                : isActive
                    ? `${T.primary}${i + 1}`
                    : `${T.subtle}${i + 1}`;
        const labelSpace = Math.max(4, perTabW - 5);
        const title = clipPlain(tab.title || "New session", labelSpace);
        const bg = isActive ? T.bgRaisedHigh : T.bgRaised;
        const fg = isActive ? `${T.text}${BOLD}` : T.muted;
        const seg = `${bg} ${indicator}${bg} ${fg}${title}${bg} ${RESET}${T.bgRaised}${T.subtle}│${RESET}`;
        const segW = visibleLen(seg);
        if (used + segW > maxTabsArea) break;
        strip += seg;
        used += segW;
    }

    // Add "+" button right after tabs
    const addBtn = `${T.bgRaised}${T.muted} + ${RESET}`;
    if (used + 3 <= maxTabsArea) {
        strip += addBtn;
        used += 3;
    }

    const gap = Math.max(0, usableW - used - rightW);
    return fitAnsi(`${strip}${T.bgRaised}${" ".repeat(gap)}${RESET}${rightBadge}`, usableW);
}

function buildSidebarLines({
    tab,
    width,
    height,
    theme: T,
    activeModel,
    mode,
    connected,
    shortCwd
}) {
    const innerW = Math.max(16, width - 4);
    const bg = T.bgRaised;
    const row = (content = "") => {
        const fitted = padVisible(content, innerW, bg);
        return `${bg}${T.subtle}│${bg} ${fitted}${bg} ${RESET}`;
    };

    const lines = [];
    // Session / Chat Title (top of sidebar, matching OpenCode sidebar.tsx)
    lines.push(row(`${bg}${T.text}${BOLD}${clipPlain(tab.title || "New session", innerW)}${RESET}`));
    lines.push(row(`${bg}${T.subtle}${"─".repeat(innerW)}${RESET}`));

    // Context section
    const tokens = estimateSessionTokens(tab);
    const pct = Math.min(100, Math.round((tokens / 128000) * 100));
    lines.push(row(`${bg}${T.text}${BOLD}Context${RESET}`));
    lines.push(row(`${bg}${T.muted}${tokens.toLocaleString()} tokens (~${pct}%)${RESET}`));
    lines.push(row(`${bg}${T.muted}${tab.messages.length} events · ${tab.toolCount || 0} tools${RESET}`));
    lines.push(row(`${bg}${T.muted}${clipPlain(activeModel, innerW - 8)} · ${mode === "plan" ? `${T.info}Plan` : `${T.primary}Build`}${RESET}`));
    lines.push(row(""));

    // Modified Files section
    const modEntries = Array.from((tab.modifiedFiles || new Map()).entries());
    lines.push(row(`${bg}${T.text}${BOLD}Modified Files${RESET} ${bg}${T.muted}(${modEntries.length})${RESET}`));
    if (modEntries.length === 0) {
        lines.push(row(`${bg}${T.subtle}None yet${RESET}`));
    } else {
        for (const [file, stats] of modEntries.slice(-6)) {
            const statStr = `+${stats.added || 0} -${stats.removed || 0}`;
            const nameW = Math.max(8, innerW - statStr.length - 3);
            const name = clipPlain(file, nameW);
            lines.push(
                row(
                    `${bg}${T.text}${name} ${T.success}+${stats.added || 0}${bg} ${T.error}-${stats.removed || 0}${RESET}`
                )
            );
        }
    }
    lines.push(row(""));

    // Context / Read Files section
    const ctxFiles = Array.from(tab.contextFiles || []);
    lines.push(row(`${bg}${T.text}${BOLD}Context Files${RESET} ${bg}${T.muted}(${ctxFiles.length})${RESET}`));
    if (ctxFiles.length === 0) {
        lines.push(row(`${bg}${T.subtle}No files read yet${RESET}`));
    } else {
        for (const f of ctxFiles.slice(-6)) {
            lines.push(row(`${bg}${T.info}◦ ${T.muted}${clipPlain(f, innerW - 2)}${RESET}`));
        }
    }

    // Pad middle so sidebar footer pins to the bottom
    const footerRows = [
        row(`${bg}${T.subtle}${"─".repeat(innerW)}${RESET}`),
        row(
            connected
                ? `${bg}${T.success}● ${T.muted}Zero-rate tunnel${RESET}`
                : `${bg}${T.warning}◌ ${T.muted}Reconnecting...${RESET}`
        ),
        row(`${bg}${T.muted}${clipPlain(shortCwd, innerW)}${RESET}`)
    ];

    const maxBody = Math.max(0, height - footerRows.length);
    const body = lines.slice(0, maxBody);
    while (body.length < maxBody) {
        body.push(row(""));
    }
    return [...body, ...footerRows].slice(0, height);
}

module.exports = {
    RESET,
    BOLD,
    DIM,
    SESSION_SIDEBAR_WIDTH,
    WIDE_BREAKPOINT,
    THEMES,
    stripAnsi,
    visibleLen,
    clipPlain,
    fitAnsi,
    padVisible,
    canonicalToolName,
    shouldShowSidebar,
    computeSidebarWidth,
    estimateSessionTokens,
    buildTabBarLine,
    buildSidebarLines
};
