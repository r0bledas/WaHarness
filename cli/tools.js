const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

function executeCommand(cmd, cwd = process.cwd(), timeoutSec = 60) {
    return new Promise((resolve) => {
        const start = Date.now();
        exec(cmd, { cwd, shell: "/bin/zsh", timeout: timeoutSec * 1000 }, (error, stdout, stderr) => {
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
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, content, "utf-8");
        return { success: true, path: target };
    } catch (e) {
        return { error: e.message };
    }
}

function listDirectory(dirPath = ".", cwd = process.cwd()) {
    try {
        const target = path.isAbsolute(dirPath) ? dirPath : path.join(cwd, dirPath);
        if (!fs.existsSync(target)) return { error: `Directory not found: ${dirPath}` };
        const entries = fs.readdirSync(target, { withFileTypes: true });
        const list = entries.map(e => ({
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
    listDirectory
};
