const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    redactSecrets,
    wrapPacket,
    unwrapPacket,
    normalizeJid,
    isAuthorizedSender
} = require("../cli/security");

const {
    resolveShell,
    executeCommand,
    readFile,
    writeFile,
    editFile,
    undoLastEdit,
    listDirectory,
    globFiles,
    grepFiles
} = require("../cli/tools");

test("security: redactSecrets masks common tokens and keys", () => {
    const sample = [
        "gh=ghp_1234567890abcdef1234567890abcdef1234",
        "oai=sk-proj-abcdefghijklmnopqrstuvwxyz123456",
        "gcp=AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe",
        "aws=AKIAIOSFODNN7EXAMPLE",
        "auth=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
        "API_KEY=super_secret_value_12345",
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----"
    ].join("\n");

    const redacted = redactSecrets(sample);
    assert.ok(!redacted.includes("ghp_1234567890"));
    assert.ok(!redacted.includes("sk-proj-abcdef"));
    assert.ok(!redacted.includes("AIzaSyDaGmWKa4"));
    assert.ok(!redacted.includes("AKIAIOSFODNN7EXAMPLE"));
    assert.ok(!redacted.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.ok(!redacted.includes("super_secret_value_12345"));
    assert.ok(!redacted.includes("MIIEpAIBAAKCAQEA"));
    assert.ok(redacted.includes("[REDACTED_GITHUB_TOKEN]"));
    assert.ok(redacted.includes("[REDACTED_PRIVATE_KEY]"));
});

test("security: HMAC wrapPacket and unwrapPacket", () => {
    const secret = "test-shared-secret";
    const payload = JSON.stringify({ id: "1", action: "read_file", path: "README.md" });

    const signed = wrapPacket("!WAH_TOOL_REQ:", payload, secret);
    const verified = unwrapPacket("!WAH_TOOL_REQ:", signed, secret);
    assert.equal(verified.ok, true);
    assert.equal(verified.payloadStr, payload);
    assert.equal(verified.signed, true);

    // Tampered signature must fail when secret is set
    const tampered = signed.replace(/"s":"[a-f0-9]+"/, '"s":"0000000000000000"');
    const bad = unwrapPacket("!WAH_TOOL_REQ:", tampered, secret);
    assert.equal(bad.ok, false);

    // Unsigned packet must fail when secret is set
    const unsigned = `!WAH_TOOL_REQ:${payload}`;
    assert.equal(unwrapPacket("!WAH_TOOL_REQ:", unsigned, secret).ok, false);

    // Unsigned packet succeeds when no secret is configured
    const open = unwrapPacket("!WAH_TOOL_REQ:", unsigned, "");
    assert.equal(open.ok, true);
    assert.equal(open.payloadStr, payload);
});

test("security: sender JID authorization", () => {
    assert.equal(normalizeJid("15551234567:12@s.whatsapp.net"), "15551234567@s.whatsapp.net");

    assert.equal(
        isAuthorizedSender({
            remoteJid: "15551234567:4@s.whatsapp.net",
            targetChat: "15551234567@s.whatsapp.net",
            fromMe: false
        }),
        true
    );

    // Reject unknown third-party sender
    assert.equal(
        isAuthorizedSender({
            remoteJid: "19998887777@s.whatsapp.net",
            targetChat: "15551234567@s.whatsapp.net",
            fromMe: false
        }),
        false
    );

    // Reject group chats even if fromMe is true
    assert.equal(
        isAuthorizedSender({
            remoteJid: "120363000000000000@g.us",
            targetChat: "15551234567@s.whatsapp.net",
            fromMe: true
        }),
        false
    );

    // Allow companion @lid self-chat when fromMe is true
    assert.equal(
        isAuthorizedSender({
            remoteJid: "9988776655@lid",
            targetChat: "15551234567@s.whatsapp.net",
            fromMe: true
        }),
        true
    );
});

test("tools: resolveShell and executeCommand work cross-platform", async () => {
    const shell = resolveShell();
    assert.ok(typeof shell === "string" && shell.length > 0);
    const res = await executeCommand("echo waharness_ok");
    assert.equal(res.code, 0);
    assert.ok(res.out.includes("waharness_ok"));
});

test("tools: readFile line ranges, writeFile, editFile, undoLastEdit, listDirectory, globFiles, grepFiles", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "waharness-test-"));
    try {
        const w = writeFile("sub/sample.txt", "line1\nline2\nneedle_here\nline4\nline5", tmpDir);
        assert.equal(w.success, true);

        const ranged = readFile("sub/sample.txt", tmpDir, 2, 4);
        assert.equal(ranged.content, "line2\nneedle_here\nline4");
        assert.equal(ranged.totalLines, 5);
        assert.equal(ranged.startLine, 2);
        assert.equal(ranged.endLine, 4);

        const ed = editFile("sub/sample.txt", "needle_here", "updated_needle", tmpDir);
        assert.equal(ed.success, true);
        assert.ok(readFile("sub/sample.txt", tmpDir).content.includes("updated_needle"));

        const gl = globFiles("**/*.txt", ".", tmpDir);
        assert.deepEqual(gl.files, ["sub/sample.txt"]);

        const gr = grepFiles("updated_needle", ".", tmpDir);
        assert.equal(gr.matches.length, 1);
        assert.equal(gr.matches[0].file, "sub/sample.txt");
        assert.equal(gr.matches[0].line, 3);

        const ls = listDirectory("sub", tmpDir);
        assert.equal(ls.entries.length, 1);
        assert.equal(ls.entries[0].name, "sample.txt");

        const undo = undoLastEdit();
        assert.equal(undo.ok, true);
        assert.ok(readFile("sub/sample.txt", tmpDir).content.includes("needle_here"));
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
