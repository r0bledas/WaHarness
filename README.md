# WaHarness

**Zero-Rated AI Coding Agent Terminal (OpenCode CLI Style) over WhatsApp**

`WaHarness` is an interactive cross-platform terminal coding agent modeled after [OpenCode CLI](https://opencode.ai) that operates entirely over **zero-rated WhatsApp data** (e.g., Telcel Mexico social-media bundles with `0 MB` general data balance).

When your laptop is tethered to a mobile hotspot with no open internet access, standard coding agents (`opencode`, `claude`, `cursor`, `codex`) fail immediately because they cannot reach external LLM APIs. `WaHarness` solves this by turning a linked WhatsApp companion session into an isolated, bidirectional RPC transport tunnel between your laptop terminal and a home server connected to fiber internet.

---

## Requirements

### 1. Home Host Backend (Required)
`WaHarness` is the **client terminal**. To power the remote AI brain on your home server, you **must** install and run the companion host bridge:

- **[r0bledas/WAHA-AGY-Bridge](https://github.com/r0bledas/WAHA-AGY-Bridge)** — Required host-side WAHA + AGY/Hermes bridge that listens for `!WAH_` traffic, maintains isolated per-workspace sessions, and dispatches tool calls back to your laptop.

### 2. Laptop Client (Homebrew)
The client installs entirely via Homebrew (no manual Python RPC setup needed on the client):

```bash
brew tap r0bledas/tap
brew install waharness
```

To upgrade to the latest release:

```bash
brew update && brew upgrade waharness
```

Then launch from any project folder:

```bash
waharness
# or short alias:
wah
```

---

## Architecture & Isolated Session Protocol (`!WAH_`)

```text
  Laptop Terminal (Client, 0 MB Carrier Data)               Home Host (Fiber Internet)
┌────────────────────────────────────────────┐           ┌────────────────────────────────────────────┐
│  waharness (OpenCode-style Node.js TUI)    │           │  WAHA-AGY-Bridge                           │
│  ├─ cli/tui.js        (TUI, Spinner, MD)   │           │  (github.com/r0bledas/WAHA-AGY-Bridge)     │
│  ├─ cli/transport.js  (Baileys Companion)  │  WhatsApp │  ├─ WAHA Gateway (localhost:3001)          │
│  ├─ cli/security.js   (HMAC, JID, Redact)  │ <=======> │  ├─ agy_bridge.py (Port 5055)              │
│  └─ cli/tools.js      (Shell, FS, Grep)    │  Self-Chat│  │  ├─ Normal Chat -> "self" session       │
└────────────────────────────────────────────┘  (!WAH_)  │  │  └─ !WAH_ Traffic -> Isolated Sessions  │
                                                         │  └─ AGY (Gemini/Claude) & Hermes Backends  │
                                                         └────────────────────────────────────────────┘
```

### How Session Isolation Works
1. **Same WhatsApp Account, Zero Collision**:
   - `WaHarness` communicates through your own WhatsApp self-chat using dedicated `!WAH_` protocol envelopes (`!WAH_PROMPT:`, `!WAH_TOOL_REQ:`, `!WAH_TOOL_RES:`, `!WAH_DONE:`, `!WAH_POLL:`, `!WAH_CMD:`, `!WAH_CHUNK:`).
   - On the home host ([`WAHA-AGY-Bridge`](https://github.com/r0bledas/WAHA-AGY-Bridge)), `!WAH_` packets are intercepted **before** `@lid` companion filtering and **before** the standard WhatsApp assistant `"self"` session.
   - The client strictly whitelists authorized sender JIDs (self-chat / `WAHARNESS_ALLOWED_JIDS`) and rejects group or third-party messages.
2. **Per-Workspace Persistent Context**:
   - Sessions are isolated per working directory (`process.cwd()`), so running `waharness` in different project folders maintains independent conversation histories.
3. **Remote Tool Execution Loop**:
   - When the remote LLM brain needs to inspect files, search code, edit files, or run shell commands, it dispatches `!WAH_TOOL_REQ:` over WhatsApp.
   - `cli/tui.js` executes the operation locally via `cli/tools.js` (`bash`, `read_file` with line ranges, `write_file`, `edit_file`, `list_dir`, `grep`, `glob`), displays a live OpenCode tool badge, redacts any leaked secrets/tokens from output, and returns results via `!WAH_TOOL_RES:` (or chunked `!WAH_CHUNK:` packets).
4. **Automatic Signal Ratchet & Reconnect Recovery (`!WAH_POLL:`)**:
   - If a background WhatsApp Web socket reconnect or Signal key ratchet coincides with an in-flight turn, the client automatically polls with `!WAH_POLL:` and recovers the response without hanging.

---

## Security & Configuration

All configuration is controlled via environment variables (see [.env.example](.env.example)):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `WAHARNESS_TARGET_JID` | *(auto-detected)* | Target WhatsApp self-chat JID (auto-detected from paired session if unset) |
| `WAHARNESS_ALLOWED_JIDS` | *(self-chat only)* | Optional comma-separated whitelist of authorized sender JIDs |
| `WAHARNESS_HMAC_SECRET` | *(unset)* | Optional shared HMAC-SHA256 secret to sign & verify `!WAH_` packets |
| `WAHARNESS_REDACT_SECRETS` | `1` | Automatically redact API keys, GitHub/AWS/Slack/Bearer tokens, and PEM keys from tool outputs |
| `WAHARNESS_CHUNKED_RES` | `0` | Set to `1` to split >12 KB tool responses into `!WAH_CHUNK:` packets instead of truncating |

---

## TUI Commands & Shortcuts

| Command | Description |
| :--- | :--- |
| `/models` | List available AI engines on the remote host (`agy`, `deepseek-v4-pro`, `deepseek-flash`) |
| `/model <id>` | Switch active engine (e.g., `/model agy` or `/model deepseek-v4-pro`) |
| `/new` | Reset the isolated conversation history for the current directory |
| `/status` | Display tunnel connection state, target JID, active agent, workspace, and auth path |
| `/exec <cmd>` | Run a local shell command directly inside the terminal |
| `/undo` | Revert the last file write/edit made by the agent |
| `/cd <dir>` | Change the active working directory |
| `/update` | Check GitHub for newer WaHarness releases |
| `/clear` | Clear the terminal view and redraw the OpenCode header |
| `/exit` | Close `WaHarness` |
| `Esc` | Cancel an in-flight prompt wait and return to the prompt |

---

## Advantages vs. Limitations Compared to Native OpenCode / Claude Code

### Advantages Unique to WaHarness
- **Operates on 0 MB Carrier Data (Zero-Rated WhatsApp)**: Works anywhere you have a Telcel/carrier social-media signal even when all standard HTTPS/DNS/VPN traffic is blocked.
- **Zero Local LLM Compute/Battery Drain**: Heavy agent orchestration runs on the remote host while your laptop only runs lightweight Node.js and local shell tools.
- **Cross-Platform Shell & Tools**: Automatically detects your platform shell (`$SHELL`, `/bin/zsh`, `/bin/bash`, `/bin/sh`, or Windows `COMSPEC`) and supports `bash`, `read_file` (with `startLine`/`endLine`), `write_file`, `edit_file`, `list_dir`, `grep`, and `glob`.
- **Clean Signal Log Filtering**: Suppresses internal `libsignal-node` ratchet dumps (`Closing session: SessionEntry`) and performs silent background socket keepalives.

### Current Limitations
- **Tool Call Round-Trip Latency (~1.5s–2.5s per tool call)**: Each remote tool call traverses WhatsApp encryption between WAHA and Baileys, adding ~1.5–2.5 seconds of transport latency per step.
- **Single-Packet Turn Delivery**: Final answers are delivered as a single `!WAH_DONE:` packet (or reassembled `!WAH_CHUNK:` packets) upon completion rather than token-by-token streaming, preventing WhatsApp Signal ratchet flooding.
- **12 KB Default Payload Cap per Single Tool Result**: Individual file reads or command outputs default to a 12,000-character cap to stay within fast WhatsApp stanza limits (use line-range `read_file` or set `WAHARNESS_CHUNKED_RES=1` for larger outputs).
- **Non-Interactive Shell Execution**: Commands executed via `tools.js` default to a 180-second timeout and run non-interactively (use non-interactive flags like `-y`).

---

## Development & Testing

```bash
npm test
```

## Repository Structure

```text
WaHarness/
├── cli/
│   ├── bin/waharness      # CLI executable entrypoint
│   ├── tui.js             # OpenCode-styled TUI, Markdown renderer, spinner & poll watchdog
│   ├── transport.js       # Baileys companion transport, JID whitelist, HMAC & chunking
│   ├── security.js        # HMAC-SHA256 packet signing, JID authorization & secret redaction
│   └── tools.js           # Cross-platform local tools (bash, read/write/edit, grep, glob, undo)
├── core/
│   └── protocol.py        # Python !WAH_ & !RPC_ packet encoder/decoder with HMAC support
├── drivers/
│   ├── hermes_adapter.py  # Hermes backend adapter
│   └── remote_exec.py     # Remote RPC dispatch manager
├── worker/
│   ├── baileys_worker.js  # Standalone pairing / worker utility
│   ├── executor.py        # Python tool executor
│   └── mac_worker.py      # Standalone Python worker loop
├── test/
│   └── waharness.test.js  # Automated unit test suite (node --test)
├── LICENSE                # MIT License
└── package.json           # Node package manifest
```

## License

MIT — see [LICENSE](LICENSE).
