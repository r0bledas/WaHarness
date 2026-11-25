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
const crypto = require("crypto");
const EventEmitter = require("events");
const { wrapPacket, unwrapPacket, isAuthorizedSender } = require("./security");

const INBOUND_PREFIXES = [
    "!WAH_STREAM:",
    "!WAH_TOOL_REQ:",
    "!WAH_DONE:",
    "!WAH_CHUNK:",
    "!CLI_STREAM:",
    "!CLI_TOOL_REQ:",
    "!CLI_DONE:"
];

const OUTBOUND_PREFIXES = [
    "!WAH_PROMPT:",
    "!WAH_TOOL_RES:",
    "!WAH_POLL:",
    "!WAH_CMD:",
    "!WAH_CHUNK:",
    "!CLI_TOOL_RES:"
];

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
        this.hmacSecret = process.env.WAHARNESS_HMAC_SECRET || "";
        this.allowedJids = (process.env.WAHARNESS_ALLOWED_JIDS || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
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
                if (rawUser && !process.env.WAHARNESS_TARGET_JID) {
                    const phone = rawUser.split(":")[0].split("@")[0];
                    if (phone) {
                        this.targetChat = `${phone}@s.whatsapp.net`;
                    }
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

                const matchedPrefix = INBOUND_PREFIXES.find((p) => text.startsWith(p));
                if (!matchedPrefix) continue;

                if (
                    !isAuthorizedSender({
                        remoteJid: from,
                        targetChat: this.targetChat,
                        allowedJids: this.allowedJids,
                        fromMe: Boolean(msg.key?.fromMe)
                    })
                ) {
                    this.emit("security_warning", { reason: "unauthorized_sender", from });
                    continue;
                }

                const unwrapped = unwrapPacket(matchedPrefix, text, this.hmacSecret);
                if (!unwrapped.ok) {
                    this.emit("security_warning", { reason: unwrapped.error, from });
                    continue;
                }

                this.emit("message", {
                    from,
                    text: `${matchedPrefix}${unwrapped.payloadStr}`,
                    raw: msg
                });
            }
        });
    }

    async sendMessage(text, toChat = null) {
        const dest = toChat || this.targetChat;
        if (!this.sock || !this.connected) {
            throw new Error("WhatsApp transport is not connected.");
        }
        if (!dest) {
            throw new Error("No destination WhatsApp chat specified. Set WAHARNESS_TARGET_JID or pair your WhatsApp account.");
        }
        let wireText = text;
        if (this.hmacSecret && typeof text === "string") {
            const pfx = OUTBOUND_PREFIXES.find((p) => text.startsWith(p));
            if (pfx) {
                wireText = wrapPacket(pfx, text.slice(pfx.length), this.hmacSecret);
            }
        }
        return await this.sock.sendMessage(dest, { text: wireText });
    }

    async sendChunkedPacket(prefix, payloadObj, { maxChunkChars = 10000, toChat = null } = {}) {
        const serialized = typeof payloadObj === "string" ? payloadObj : JSON.stringify(payloadObj);
        if (serialized.length <= maxChunkChars) {
            return await this.sendMessage(`${prefix}${serialized}`, toChat);
        }
        const chunkId = crypto.randomBytes(4).toString("hex");
        const total = Math.ceil(serialized.length / maxChunkChars);
        for (let idx = 0; idx < total; idx++) {
            const data = serialized.slice(idx * maxChunkChars, (idx + 1) * maxChunkChars);
            const pkt = `!WAH_CHUNK:${JSON.stringify({ id: chunkId, prefix, idx, total, data })}`;
            await this.sendMessage(pkt, toChat);
        }
    }
}

module.exports = WhatsAppTransport;
