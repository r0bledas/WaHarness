const crypto = require("crypto");

const REDACTION_PATTERNS = [
    // PEM private keys
    { regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, replace: "[REDACTED_PRIVATE_KEY]" },
    // GitHub tokens (classic, fine-grained, OAuth, user-to-server, server-to-server)
    { regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, replace: "[REDACTED_GITHUB_TOKEN]" },
    { regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, replace: "[REDACTED_GITHUB_TOKEN]" },
    // OpenAI / Anthropic / Stripe style sk- keys
    { regex: /\bsk-(?:proj-|ant-api\d+-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g, replace: "[REDACTED_API_KEY]" },
    // Google API keys
    { regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: "[REDACTED_GOOGLE_KEY]" },
    // AWS Access Key IDs
    { regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: "[REDACTED_AWS_KEY]" },
    // Slack tokens
    { regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g, replace: "[REDACTED_SLACK_TOKEN]" },
    // Bearer tokens in headers/logs
    { regex: /(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, replace: "$1[REDACTED_TOKEN]" },
    // Generic key/secret/token/password assignments (e.g. API_KEY=..., PASSWORD="...")
    { regex: /((?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|ACCESS_KEY)\s*[=:]\s*["']?)([^\s"'`]{8,})(["']?)/gi, replace: "$1[REDACTED]$3" }
];

function redactSecrets(text) {
    if (typeof text !== "string" || !text) return text;
    if (process.env.WAHARNESS_REDACT_SECRETS === "0" || process.env.WAHARNESS_REDACT_SECRETS === "false") {
        return text;
    }
    let out = text;
    for (const { regex, replace } of REDACTION_PATTERNS) {
        out = out.replace(regex, replace);
    }
    return out;
}

function signPayload(payloadStr, secret) {
    if (!secret) return "";
    return crypto.createHmac("sha256", String(secret)).update(String(payloadStr), "utf8").digest("hex");
}

function verifySignature(payloadStr, signature, secret) {
    if (!secret) return true;
    if (!signature || typeof signature !== "string") return false;
    const expected = signPayload(payloadStr, secret);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function wrapPacket(prefix, payloadStr, secret = "") {
    if (!secret) {
        return `${prefix}${payloadStr}`;
    }
    const sig = signPayload(payloadStr, secret);
    return `${prefix}${JSON.stringify({ p: payloadStr, s: sig })}`;
}

function unwrapPacket(prefix, rawMessage, secret = "") {
    if (typeof rawMessage !== "string" || !rawMessage.startsWith(prefix)) {
        return { ok: false, error: "Prefix mismatch" };
    }
    const body = rawMessage.slice(prefix.length).trim();
    if (!secret) {
        // Still unwrap signed envelopes gracefully if sender signed it
        try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed.p === "string" && typeof parsed.s === "string") {
                return { ok: true, payloadStr: parsed.p, signed: true };
            }
        } catch (_) {}
        return { ok: true, payloadStr: body, signed: false };
    }

    try {
        const envelope = JSON.parse(body);
        if (!envelope || typeof envelope.p !== "string" || typeof envelope.s !== "string") {
            return { ok: false, error: "Missing HMAC envelope" };
        }
        if (!verifySignature(envelope.p, envelope.s, secret)) {
            return { ok: false, error: "Invalid HMAC signature" };
        }
        return { ok: true, payloadStr: envelope.p, signed: true };
    } catch (e) {
        return { ok: false, error: `Malformed signed envelope: ${e.message}` };
    }
}

function normalizeJid(jid) {
    if (!jid || typeof jid !== "string") return "";
    const trimmed = jid.trim().toLowerCase();
    const atIdx = trimmed.indexOf("@");
    if (atIdx === -1) return trimmed;
    const userPart = trimmed.slice(0, atIdx).split(":")[0];
    const domainPart = trimmed.slice(atIdx + 1);
    return `${userPart}@${domainPart}`;
}

function isAuthorizedSender({ remoteJid, targetChat, allowedJids = [], fromMe = false }) {
    const normRemote = normalizeJid(remoteJid);
    if (!normRemote) return false;

    // Never accept group or broadcast messages for RPC execution
    if (normRemote.endsWith("@g.us") || normRemote === "status@broadcast") {
        return false;
    }

    const allowed = new Set();
    if (targetChat) allowed.add(normalizeJid(targetChat));
    for (const j of allowedJids) {
        const n = normalizeJid(j);
        if (n) allowed.add(n);
    }

    if (allowed.has(normRemote)) {
        return true;
    }

    // Linked companion devices may route self-chat via @lid with fromMe === true
    if (fromMe && normRemote.endsWith("@lid")) {
        return true;
    }

    return false;
}

module.exports = {
    redactSecrets,
    signPayload,
    verifySignature,
    wrapPacket,
    unwrapPacket,
    normalizeJid,
    isAuthorizedSender
};
