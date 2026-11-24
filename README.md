# WaHarness

Zero-Rated AI Agent Harness and Out-of-band Remote Command Execution over WhatsApp.

Designed for carriers with zero-rated WhatsApp access (e.g., Telcel Mexico), allowing complete remote device orchestration, code execution, and AI agent feedback loops when no open internet connection is available on the client device.

## Architecture Overview

`
                               ZERO-RATED CARRIER (TELCEL)
                               
[ macOS / Client ]  <====== WhatsApp Protocol ======>  [ WhatsApp Cloud / Meta ]
(Connected via Hotspot;                                          ||
 Zero open internet)                                             ||
      ||                                                         ||
   WAHA Node / RPC Agent                                         ||
 (Executes shell & returns results)                              ||
                                                                 ||
                                                                 v
                                                       [ WAHA Gateway / Host ]
                                                        (T450 / VPS with LAN)
                                                                 ||
                                                       [ WaHarness Controller ]
                                                        (OpenCode / Hermes / AGY)
                                                                 ||
                                                       Open Internet / AI APIs
                                                    (Gemini / DeepSeek / Claude)
`

## Features

- Zero-Rated Transport: Uses WhatsApp messages and media files as a covert RPC bus.
- Dual-Node Orchestration:
  - Controller (Host with Internet): Coordinates LLM planning, multi-agent evaluation, and task generation.
  - Worker Node (Mac / Target Device): Listens over zero-rated WhatsApp connection, runs native commands, and delivers output back through chat.
- Harness Modular Engine: Pluggable backends supporting OpenCode, Hermes (DeepSeek), and Antigravity (Gemini).
- Security Guardrails: Strict chat authentication, command execution sandboxing, and token redaction.

## License

MIT
