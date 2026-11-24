# WaHarness

**Zero-Rated AI Coding Agent Terminal (OpenCode CLI Style) over WhatsApp**

`WaHarness` is an interactive macOS/Linux terminal coding agent modeled after [OpenCode CLI](https://opencode.ai) that operates entirely over **zero-rated WhatsApp data** (e.g., Telcel Mexico social-media bundles with `0 MB` general data balance).

When your laptop is tethered to a mobile hotspot with no open internet access, standard coding agents (`opencode`, `claude`, `cursor`, `codex`) fail immediately because they cannot reach external LLM APIs. `WaHarness` solves this by turning a linked WhatsApp companion session into an isolated, bidirectional RPC transport tunnel between your laptop terminal and a home server (`T450 Brain`) connected to fiber internet.

---

## Installation (macOS / Homebrew)

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
  macOS Terminal (Client, 0 MB Carrier Data)               Home Host (T450 with Fiber Internet)
┌────────────────────────────────────────────┐           ┌────────────────────────────────────────────┐
│  waharness (OpenCode-style Node.js TUI)    │           │  WAHA Gateway (localhost:3001)             │
│  ├─ cli/tui.js        (TUI, Spinner, MD)   │           │  └─ agy_bridge.py (Port 5055)              │
│  ├─ cli/transport.js  (Baileys Companion)  │  WhatsApp │     ├─ Normal Chat -> "self" session       │
│  └─ cli/tools.js      (/bin/zsh, FS Tools) │ <=======> │     └─ !WAH_ Traffic -> waharness_backend  │
└────────────────────────────────────────────┘  Self-Chat│        ├─ Isolated waharness_sessions.json │
                                                (!WAH_)  │        ├─ Custom waharness GEMINI.md       │
                                                         │        ├─ mac_rpc.py (Port 5056 Tool Bus)  │
                                                         │        └─ AGY (Gemini/Claude) & Hermes     │
                                                         └────────────────────────────────────────────┘
```

### How Session Isolation Works
1. **Same WhatsApp Account, Zero Collision**:
   - `WaHarness` communicates through your own WhatsApp self-chat using dedicated `!WAH_` protocol envelopes (`!WAH_PROMPT:`, `!WAH_TOOL_REQ:`, `!WAH_TOOL_RES:`, `!WAH_DONE:`, `!WAH_POLL:`, `!WAH_CMD:`).
   - On the home host (`agy_bridge.py`), `!WAH_` packets are intercepted **before** `@lid` companion filtering and **before** the standard WhatsApp assistant `"self"` session.
   - Outbound `!WAH_` packets are registered in `BOT_PREFIXES` so the regular WhatsApp bridge never ingests them, and the Mac TUI filters strictly for `!WAH_` packets so personal WhatsApp messages never leak into your terminal.
2. **Per-Workspace Persistent Context**:
   - `waharness_backend.py` maintains a separate session store (`waharness_sessions.json`) keyed by your Mac's current working directory (`process.cwd()`).
   - Running `waharness` in `~/Documents/XCode/Projects/AppA` and `~/Documents/XCode/Projects/AppB` automatically maintains independent AGY and Hermes conversation histories for each directory.
3. **Remote Mac Tool Execution Loop (`mac_rpc.py`)**:
   - When the LLM brain on the T450 needs to inspect your Mac files, edit code, or run shell commands, it invokes `mac_rpc.py` (`--bash`, `--read`, `--write`, `--content-file`, `--list`).
   - `waharness_backend.py` dispatches `!WAH_TOOL_REQ:` over WhatsApp to your Mac, `cli/tui.js` executes the operation locally in your Mac workspace, displays a live OpenCode tool badge (`✓ bash ... (0.18s)`), and returns stdout/file content via `!WAH_TOOL_RES:`.
4. **Automatic Signal Ratchet & Reconnect Recovery (`!WAH_POLL:`)**:
   - Completed turn responses are cached by request ID on the host (`_completed_results`).
   - If a background WhatsApp Web socket keepalive reconnect or Signal key ratchet ever coincides with an in-flight turn, the Mac client automatically polls with `!WAH_POLL:` and recovers the response without hanging.

---

## TUI Commands & Shortcuts

| Command | Description |
| :--- | :--- |
| `/models` | List available AI engines on the remote host (`agy`, `deepseek-v4-pro`, `deepseek-flash`) |
| `/model <id>` | Switch active engine (e.g., `/model agy` or `/model deepseek-v4-pro`) |
| `/new` | Reset the isolated conversation history for the current Mac directory |
| `/status` | Display tunnel connection state, target JID, active agent, workspace, and auth path |
| `/exec <cmd>` | Run a local `/bin/zsh` command directly inside the terminal |
| `/clear` | Clear the terminal view and redraw the OpenCode header |
| `/exit` | Close `WaHarness` |
| `Esc` | Cancel an in-flight prompt wait and return to the prompt |

---

## Advantages vs. Limitations Compared to Native OpenCode / Claude Code

### Advantages Unique to WaHarness
- **Operates on 0 MB Carrier Data (Zero-Rated WhatsApp)**: Works anywhere you have a Telcel/carrier social-media signal even when all standard HTTPS/DNS/VPN traffic is blocked.
- **Zero Local LLM Compute/Battery Drain**: Heavy agent orchestration runs on the remote host while your MacBook only runs lightweight Node.js and local shell tools.
- **Dual-Host Capabilities**: Can both read/edit/build projects on your Mac and access host-side integrations and multi-account LLM quota rotation on the T450.
- **Clean Signal Log Filtering**: Suppresses internal `libsignal-node` ratchet dumps (`Closing session: SessionEntry`) and performs silent background socket keepalives.

### Current Limitations
- **Tool Call Round-Trip Latency (~1.5s–2.5s per tool call)**: Each remote Mac tool call traverses WhatsApp encryption between WAHA and Baileys, adding ~1.5–2.5 seconds of transport latency per tool step compared to direct localhost HTTP.
- **Single-Packet Turn Delivery**: Final answers are delivered as a single `!WAH_DONE:` packet upon completion (rendered with full terminal Markdown, syntax boxes, and gutter bars) rather than token-by-token streaming, preventing WhatsApp Signal ratchet flooding and rate limits.
- **12 KB Payload Cap per Single Tool Result**: Individual file reads or command outputs returned in `!WAH_TOOL_RES:` are capped at 12,000 characters per call to stay well within fast WhatsApp stanza limits (larger files can be read in line ranges).
- **60-Second Default Timeout per Single Mac Command**: Individual shell commands executed via `tools.js` default to a 60-second timeout and run non-interactively (commands requiring interactive stdin prompts should use non-interactive flags like `-y`).

---

## Repository Structure

```text
WaHarness/
├── cli/
│   ├── bin/waharness      # CLI executable entrypoint
│   ├── tui.js             # OpenCode-styled TUI, Markdown renderer, spinner & poll watchdog
│   ├── transport.js       # Baileys companion transport, auth auto-migration & Signal noise filter
│   └── tools.js           # Local macOS tool executors (bash, read_file, write_file, list_dir)
├── core/
│   └── protocol.py        # Python packet encoder/decoder helpers
├── worker/
│   ├── baileys_worker.js  # Standalone pairing / worker utility
│   ├── executor.py        # Python tool executor
│   └── mac_worker.py      # Standalone Python worker loop
└── package.json           # Node package manifest
```

## License

MIT
