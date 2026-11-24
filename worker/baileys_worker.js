const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const { exec } = require("child_process");
const path = require("path");

const MAGIC_REQ = "!RPC_REQ:";
const MAGIC_RES = "!RPC_RES:";
const TARGET_NAME = "mac";
const seenIds = new Set();

async function startSock() {
    const authDir = path.join(__dirname, "../auth_info");
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("\n[WaHarness] Scan this QR code with WhatsApp on your phone:\n");
            qrcode.generate(qr, { small: true });
        }
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("[WaHarness] Connection closed. Reconnecting:", shouldReconnect);
            if (shouldReconnect) startSock();
        } else if (connection === "open") {
            console.log("\n=== WaHarness Mac Worker Connected & Online! ===");
            console.log("Listening for RPC commands autonomously...\n");
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg || !msg.message) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (!text.startsWith(MAGIC_REQ)) return;

        try {
            const rawEnv = text.substring(MAGIC_REQ.length).trim();
            const envelope = JSON.parse(rawEnv);
            const req = JSON.parse(envelope.p);

            if (seenIds.has(req.id)) return;
            seenIds.add(req.id);

            if (req.target !== "all" && req.target !== TARGET_NAME) return;

            console.log(`[Mac Executing] [${req.id}] ${req.cmd}`);
            const start = Date.now();

            exec(req.cmd, { shell: "/bin/zsh", timeout: (req.timeout || 60) * 1000 }, async (error, stdout, stderr) => {
                const dur = ((Date.now() - start) / 1000).toFixed(2);
                const code = error ? (error.code || 1) : 0;
                console.log(`[Mac Done] [${req.id}] code: ${code} in ${dur}s`);

                const resData = {
                    id: req.id,
                    code: code,
                    out: stdout || "",
                    err: stderr || (error ? error.message : ""),
                    dur: parseFloat(dur),
                    ts: Math.floor(Date.now() / 1000)
                };

                const resPkt = MAGIC_RES + JSON.stringify({ p: JSON.stringify(resData), s: "" });
                await sock.sendMessage(from, { text: resPkt });
            });
        } catch (e) {
            console.error("[WaHarness Error]", e.message);
        }
    });
}

startSock();
