// Silence libsignal-node and Baileys internal console spam ("Closing session: SessionEntry...", etc.)
const _origLog = console.log;
const _origInfo = console.info;
const _origWarn = console.warn;
const _origError = console.error;

const NOISE_PATTERNS = [
    "Closing session",
    "Opening session",
    "Removing old closed session",
    "SessionEntry",
    "Session already closed",
    "Session already open",
    "Decrypted message with closed session",
    "ephemeralKeyPair",
    "pendingPreKey",
    "currentRatchet",
    "remoteIdentityKey",
    "registrationId",
    "Bad MAC",
    "Failed to decrypt message"
];

function _isSignalNoise(args) {
    for (const a of args) {
        let s = "";
        if (typeof a === "string") {
            s = a;
        } else if (a && typeof a === "object") {
            const cname = a.constructor ? a.constructor.name : "";
            if (cname === "SessionEntry" || a._chains || a.currentRatchet || a.indexInfo) {
                return true;
            }
            try {
                s = String(a);
            } catch (_) {}
        }
        for (const pat of NOISE_PATTERNS) {
            if (s.includes(pat)) return true;
        }
    }
    return false;
}

console.log = (...args) => {
    if (_isSignalNoise(args)) return;
    _origLog.apply(console, args);
};
console.info = (...args) => {
    if (_isSignalNoise(args)) return;
    _origInfo.apply(console, args);
};
console.warn = (...args) => {
    if (_isSignalNoise(args)) return;
    _origWarn.apply(console, args);
};
console.error = (...args) => {
    if (_isSignalNoise(args)) return;
    _origError.apply(console, args);
};

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
        this.everConnected = false;
        this.targetChat = process.env.WAHARNESS_TARGET_JID || null;
    }

    async init() {
        fs.mkdirSync(this.authDir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            logger: require("pino")({ level: "silent" }),
            getMessage: async () => ({ conversation: "" })
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
                    setTimeout(() => this.init(), 2000);
                }
            } else if (connection === "open") {
                this.connected = true;
                const isFirst = !this.everConnected;
                this.everConnected = true;

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
                this.emit("ready", { targetChat: this.targetChat, isFirst });
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
