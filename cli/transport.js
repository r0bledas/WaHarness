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
        
        // Check if legacy auth_info exists in Downloads or local
        const legacyDownloads = path.join(homeDir, "Downloads", "WaHarness-Mac", "auth_info");
        const localAuth = path.join(__dirname, "../auth_info");

        if (!fs.existsSync(defaultAuth)) {
            if (fs.existsSync(legacyDownloads)) {
                fs.mkdirSync(path.join(homeDir, ".waharness"), { recursive: true });
                fs.cpSync(legacyDownloads, defaultAuth, { recursive: true });
            } else if (fs.existsSync(localAuth)) {
                fs.mkdirSync(path.join(homeDir, ".waharness"), { recursive: true });
                fs.cpSync(localAuth, defaultAuth, { recursive: true });
            }
        }

        this.authDir = authDir || defaultAuth;
        this.sock = null;
        this.connected = false;
        this.targetChat = null;
    }

    async init() {
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
                this.emit("ready");
            }
        });

        this.sock.ev.on("messages.upsert", async (m) => {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

            this.targetChat = from;
            this.emit("message", { from, text, raw: msg });
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
