const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { redactSecrets } = require("./security");

// Undo stack for file modifications made by the agent
const undoStack = [];

const IGNORED_DIRS = new Set([
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".cache"
]);

function resolveShell() {
    if (process.platform === "win32") {
        return process.env.COMSPEC || "cmd.exe";
    }
    const candidates = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(Boolean);
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch (_) {}
    }
    return "/bin/sh";
}

function executeCommand(cmd, cwd = process.cwd(), timeoutSec = 180) {
    return new Promise((resolve) => {
        const start = Date.now();
        exec(
            cmd,
            { cwd, shell: resolveShell(), timeout: timeoutSec * 1000, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout, stderr) => {
                const dur = ((Date.now() - start) / 1000).toFixed(2);
                const rawOut = stdout ? stdout.toString() : "";
                const rawErr = stderr ? stderr.toString() : (error ? error.message : "");
                resolve({
                    code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
                    out: redactSecrets(rawOut),
                    err: redactSecrets(rawErr),
                    dur: parseFloat(dur)
                });
            }
        );
    });
}

function readFile(filePath, cwd = process.cwd(), startLine = null, endLine = null) {
    try {
        const target = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
        if (!fs.existsSync(target)) return { error: `File not found: ${filePath}` };
        const raw = fs.readFileSync(target, "utf-8");
        const allLines = raw.split(/\r?\n/);
        const totalLines = allLines.length;

        let content = raw;
        let sLine = 1;
        let eLine = totalLines;

        if (startLine != null || endLine != null) {
            sLine = Math.max(1, parseInt(startLine, 10) || 1);
            eLine = Math.min(totalLines, parseInt(endLine, 10) || totalLines);
            content = allLines.slice(sLine - 1, eLine).join("\n");
        }

        return {
            content: redactSecrets(content),
            totalLines,
            startLine: sLine,
            endLine: eLine
        };
    } catch (e) {
        return { error: e.message };
    }
}

function writeFile(filePath, content, cwd = process.cwd()) {
    try {
        const target = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
        const existed = fs.existsSync(target);
        const prevContent = existed ? fs.readFileSync(target, "utf-8") : null;
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, content, "utf-8");
        undoStack.push({ path: target, existed, prevContent });
        const lines = String(content || "").split("\n").length;
        return { success: true, path: target, added: lines, removed: existed ? prevContent.split("\n").length : 0 };
    } catch (e) {
        return { error: e.message };
    }
}

function editFile(filePath, oldText, newText, cwd = process.cwd()) {
    try {
        const target = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
        if (!fs.existsSync(target)) return { error: `File not found: ${filePath}` };
        const prevContent = fs.readFileSync(target, "utf-8");
        if (!prevContent.includes(oldText)) {
            return { error: `Target block not found in ${filePath}` };
        }
        const updated = prevContent.replace(oldText, newText);
        fs.writeFileSync(target, updated, "utf-8");
        undoStack.push({ path: target, existed: true, prevContent });

        const removedLines = String(oldText || "").split("\n");
        const addedLines = String(newText || "").split("\n");
        const diffPreview = [
            ...removedLines.slice(0, 6).map((l) => ({ type: "del", text: l })),
            ...addedLines.slice(0, 6).map((l) => ({ type: "add", text: l }))
        ];
        return {
            success: true,
            path: target,
            added: addedLines.length,
            removed: removedLines.length,
            diffPreview
        };
    } catch (e) {
        return { error: e.message };
    }
}

function undoLastEdit() {
    if (undoStack.length === 0) {
        return { ok: false, error: "Nothing to undo in this session." };
    }
    const last = undoStack.pop();
    try {
        if (last.existed) {
            fs.writeFileSync(last.path, last.prevContent, "utf-8");
            return { ok: true, message: `Reverted changes to ${last.path}` };
        } else {
            if (fs.existsSync(last.path)) fs.unlinkSync(last.path);
            return { ok: true, message: `Removed newly created file ${last.path}` };
        }
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function listDirectory(dirPath = ".", cwd = process.cwd()) {
    try {
        const target = path.isAbsolute(dirPath) ? dirPath : path.join(cwd, dirPath);
        if (!fs.existsSync(target)) return { error: `Directory not found: ${dirPath}` };
        const entries = fs.readdirSync(target, { withFileTypes: true });
        const list = entries.map((e) => ({
            name: e.name,
            isDir: e.isDirectory(),
            isFile: e.isFile()
        }));
        return { entries: list };
    } catch (e) {
        return { error: e.message };
    }
}

function globToRegExp(glob) {
    const escaped = String(glob || "*")
        .replace(/\\/g, "/")
        .replace(/[.+^${}()|[\]]/g, "\\$&")
        .replace(/\*\*/g, "__DOUBLE_STAR__")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/__DOUBLE_STAR__/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
}

function walkFiles(rootDir, maxFiles = 2000) {
    const out = [];
    const stack = [rootDir];
    while (stack.length > 0 && out.length < maxFiles) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (_) {
            continue;
        }
        for (const entry of entries) {
            if (IGNORED_DIRS.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
            } else if (entry.isFile()) {
                out.push(full);
                if (out.length >= maxFiles) break;
            }
        }
    }
    return out;
}

function globFiles(pattern = "**/*", dirPath = ".", cwd = process.cwd(), { maxResults = 200 } = {}) {
    try {
        const root = path.isAbsolute(dirPath) ? dirPath : path.join(cwd, dirPath);
        if (!fs.existsSync(root)) return { error: `Directory not found: ${dirPath}` };
        const rx = globToRegExp(pattern);
        const matchBasename = !String(pattern).includes("/") && !String(pattern).includes("\\");
        const all = walkFiles(root);
        const files = [];
        let truncated = false;

        for (const full of all) {
            const rel = path.relative(root, full).replace(/\\/g, "/");
            const candidate = matchBasename ? path.basename(full) : rel;
            if (rx.test(candidate) || rx.test(rel)) {
                if (files.length >= maxResults) {
                    truncated = true;
                    break;
                }
                files.push(rel);
            }
        }
        return { files, truncated };
    } catch (e) {
        return { error: e.message };
    }
}

function grepFiles(pattern, dirPath = ".", cwd = process.cwd(), { maxResults = 100, ignoreCase = false } = {}) {
    try {
        if (!pattern) return { error: "Search pattern is required" };
        const root = path.isAbsolute(dirPath) ? dirPath : path.join(cwd, dirPath);
        if (!fs.existsSync(root)) return { error: `Directory not found: ${dirPath}` };

        let rx;
        try {
            rx = new RegExp(pattern, ignoreCase ? "i" : "");
        } catch (_) {
            const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            rx = new RegExp(escaped, ignoreCase ? "i" : "");
        }

        const all = walkFiles(root);
        const matches = [];
        let truncated = false;

        for (const full of all) {
            let stat;
            try {
                stat = fs.statSync(full);
            } catch (_) {
                continue;
            }
            if (stat.size > 1024 * 1024) continue; // skip >1MB files

            let content;
            try {
                content = fs.readFileSync(full, "utf-8");
            } catch (_) {
                continue;
            }
            if (content.includes("\u0000")) continue; // skip binary files

            const rel = path.relative(root, full).replace(/\\/g, "/");
            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                if (rx.test(lines[i])) {
                    if (matches.length >= maxResults) {
                        truncated = true;
                        break;
                    }
                    matches.push({
                        file: rel,
                        line: i + 1,
                        text: redactSecrets(lines[i].slice(0, 300))
                    });
                }
            }
            if (truncated) break;
        }
        return { matches, truncated };
    } catch (e) {
        return { error: e.message };
    }
}

module.exports = {
    resolveShell,
    executeCommand,
    readFile,
    writeFile,
    editFile,
    undoLastEdit,
    listDirectory,
    globFiles,
    grepFiles
};
