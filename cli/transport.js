const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const path = require("path");
const os = require("os");
const fs = require("fs");
const EventEmitter = require("events");

class WhatsAppTransport extends EventEmitter {
    constructor(authDir) {
        super();
        const homeDir = os.homedir();
        const defaultAuth = path.join(homeDir, ".waharness", "auth_info");
        const credsFile = path.join(defaultAuth, "creds.json");

        // Auto-migrate existing pairing credentials if creds.json is missing
        const candidates = [
            path.join(homeDir, "Downloads", "WaHarness-Mac", "auth_info"),
            path.join(process.cwd(), "auth_info"),
            path.join(__dirname, "../auth_info")
        ];

        if (!fs.existsSync(credsFile)) {
            for (const candidate of candidates) {
                if (fs.existsSync(path.join(candidate, "creds.json"))) {
                    fs.mkdirSync(defaultAuth, { recursive: true });
                    fs.cpSync(candidate, defaultAuth, { recursive: true });
                    break;
                }
            }
        }

        this.authDir = authDir || defaultAuth;
        this.sock = null;
        this.connected = false;
        this.targetChat = process.env.WAHARNESS_TARGET_JID || null;
    }

    async init() {
        fs.mkdirSync(this.authDir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: require("pino")({ level: "silent" })
        });

        this.sock.ev.on("creds.update", saveCreds);

        this.sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                this.emit("qr", qr);
            }
            if (connection === "close") {
                this.connected = false;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                this.emit("disconnected", { shouldReconnect, error: lastDisconnect?.error });
                if (shouldReconnect) {
                    setTimeout(() => this.init(), 3000);
                }
            } else if (connection === "open") {
                this.connected = true;
                // Default targetChat to the user's own WhatsApp account (self-chat)
                const rawUser = this.sock?.user?.id || "";
                if (rawUser) {
                    const phone = rawUser.split(":")[0].split("@")[0];
                    if (phone) {
                        this.targetChat = `${phone}@s.whatsapp.net`;
                    }
                }
                if (!this.targetChat) {
                    this.targetChat = process.env.WAHARNESS_TARGET_JID || null;
                }
                this.emit("ready", { targetChat: this.targetChat });
            }
        });

        this.sock.ev.on("messages.upsert", async (m) => {
            for (const msg of (m.messages || [])) {
                if (!msg || !msg.message) continue;
                const from = msg.key.remoteJid;
                const text = (
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    ""
                ).trim();
                if (!text) continue;

                // Strictly filter for WaHarness protocol packets from T450 Brain
                // so normal personal WhatsApp chats never leak into the CLI terminal
                if (
                    text.startsWith("!WAH_STREAM:") ||
                    text.startsWith("!WAH_TOOL_REQ:") ||
                    text.startsWith("!WAH_DONE:") ||
                    text.startsWith("!CLI_STREAM:") ||
                    text.startsWith("!CLI_TOOL_REQ:") ||
                    text.startsWith("!CLI_DONE:")
                ) {
                    this.emit("message", { from, text, raw: msg });
                }
            }
        });
    }

    async sendMessage(text, toChat = null) {
        const dest = toChat || this.targetChat;
        if (!this.sock || !this.connected) {
            throw new Error("WhatsApp transport is not connected.");
        }
        if (!dest) {
            throw new Error("No destination WhatsApp chat specified.");
        }
        return await this.sock.sendMessage(dest, { text });
    }
}

module.exports = WhatsAppTransport;
