const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// Undo stack for file modifications made by the agent
const undoStack = [];

function executeCommand(cmd, cwd = process.cwd(), timeoutSec = 180) {
    return new Promise((resolve) => {
        const start = Date.now();
        exec(cmd, { cwd, shell: "/bin/zsh", timeout: timeoutSec * 1000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
            const dur = ((Date.now() - start) / 1000).toFixed(2);
            resolve({
                code: error ? (error.code || 1) : 0,
                out: stdout ? stdout.toString() : "",
                err: stderr ? stderr.toString() : (error ? error.message : ""),
                dur: parseFloat(dur)
            });
        });
    });
}

function readFile(filePath, cwd = process.cwd()) {
    try {
        const target = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
        if (!fs.existsSync(target)) return { error: `File not found: ${filePath}` };
        const content = fs.readFileSync(target, "utf-8");
        return { content };
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

module.exports = {
    executeCommand,
    readFile,
    writeFile,
    editFile,
    undoLastEdit,
    listDirectory
};
