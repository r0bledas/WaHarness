# WaHarness Engineering & Implementation Plan

## Problem Statement
When mobile data is limited to Telcel zero-rated WhatsApp, the Mac connected to an iPhone hotspot has zero general internet access. It cannot directly reach AI model endpoints (Gemini, DeepSeek, OpenAI, Claude), cloud servers via SSH/Tailscale, or GitHub.

## Core Solution
Use WhatsApp protocol traffic as a bi-directional RPC (Remote Procedure Call) message bus between:
1. Brain / Controller (T450 host or cloud VPS with open internet + LLM backends).
2. Worker Node (Mac running on zero-rated hotspot executing commands natively).

## Phase 1: Protocol & Message Envelope Specification
- Define structured packet serialization over WhatsApp text and document attachments.
- Message format:
  - Task Request: !RPC_REQ <json_payload> with fields: id, target_host, cmd, cwd, timeout, env_vars.
  - Task Response: !RPC_RES <json_payload> with fields: id, exit_code, stdout, stderr, duration.
- Large output handling: Split chunks or deliver as temporary zero-rated .txt/.log file attachments via WAHA sendFile.

## Phase 2: Mac Zero-Rated Worker Node
- Lightweight native worker running on macOS (Python or Node.js).
- Connectivity options on Mac:
  - Option A: WAHA docker container running locally on Mac paired to a worker WhatsApp session.
  - Option B: Standalone headless Baileys script (no Docker overhead, connects straight to WhatsApp Web protocol).
- Execution engine: Safely dispatches shell commands via zsh subprocess with working directory control, timeouts, and output capture.

## Phase 3: Brain Controller & Agent Adapters
- Pluggable backends:
  - OpenCode driver: Integrates OpenCode agent loop with remote execution tools.
  - Hermes driver: DeepSeek reasoning backend with tool dispatch.
  - AGY driver: Antigravity CLI adapter.
- Tool hook: Whenever an agent invokes a tool (e.g. 
un_command targeting mac), the harness intercepts it, serializes the RPC packet, posts to WhatsApp, waits for the worker response packet, and feeds stdout back to the model.

## Phase 4: Security, Authentication & Redaction
- Public Key or HMAC signature verification on RPC packets to prevent unauthorized execution.
- Strict chat ID whitelist (only authorized WhatsApp sender/recipient can trigger execution).
- Automatic redaction of sensitive tokens and keys in chat output.
