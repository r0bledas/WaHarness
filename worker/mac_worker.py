import os
import sys
import time
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.protocol import parse_request, create_response, MAGIC_REQ
from worker.executor import execute_command

WAHA_URL = os.environ.get('WAHA_URL', 'http://localhost:3001').rstrip('/')
WAHA_API_KEY = os.environ.get('WAHA_API_KEY', '')
WAHA_SESSION = os.environ.get('WAHA_SESSION', 'default')
TARGET_NAME = os.environ.get('TARGET_NAME', 'mac')
RPC_SECRET = os.environ.get('RPC_SECRET', '')
CONTROLLER_CHAT_ID = os.environ.get('CONTROLLER_CHAT_ID', '')
PORT = int(os.environ.get('WORKER_PORT', '5056'))

seen_ids = set()

def send_whatsapp_message(chat_id: str, text: str) -> bool:
    url = f"{WAHA_URL}/api/sendText"
    headers = {"Content-Type": "application/json"}
    if WAHA_API_KEY:
        headers["X-Api-Key"] = WAHA_API_KEY
    payload = json.dumps({
        "session": WAHA_SESSION,
        "chatId": chat_id,
        "text": text
    }).encode("utf-8")
    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"[Worker] Error sending WhatsApp message: {e}", file=sys.stderr)
        return False

def handle_message(msg_body: str, from_chat: str):
    if not msg_body.startswith(MAGIC_REQ):
        return
    try:
        req = parse_request(msg_body, secret=RPC_SECRET)
    except Exception as e:
        print(f"[Worker] Verification failed: {e}", file=sys.stderr)
        return

    req_id = req.get("id")
    target = req.get("target")
    cmd = req.get("cmd")
    cwd = req.get("cwd", "")
    timeout = int(req.get("timeout", 60))

    if req_id in seen_ids:
        return
    seen_ids.add(req_id)

    if target != "all" and target != TARGET_NAME:
        return

    print(f"[Worker] Executing [{req_id}] cmd: {cmd}")
    res = execute_command(cmd, cwd=cwd, timeout=timeout)
    print(f"[Worker] Completed [{req_id}] code: {res['code']} in {res['dur']:.2f}s")

    reply_payload = create_response(
        req_id=req_id,
        exit_code=res["code"],
        stdout=res["out"],
        stderr=res["err"],
        duration=res["dur"],
        secret=RPC_SECRET
    )

    dest = CONTROLLER_CHAT_ID if CONTROLLER_CHAT_ID else from_chat
    send_whatsapp_message(dest, reply_payload)

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            data = json.loads(body)
            payload = data.get("payload", {})
            body_text = payload.get("body", "")
            from_chat = payload.get("from", "")
            if body_text:
                handle_message(body_text, from_chat)
        except Exception:
            pass
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

    def log_message(self, format, *args):
        pass

def main():
    print(f"=== WaHarness Mac Worker ===")
    print(f"Target: {TARGET_NAME} | WAHA: {WAHA_URL} | Session: {WAHA_SESSION}")
    print(f"Listening on port {PORT} for incoming WAHA webhook events...")
    server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Worker] Stopped.")

if __name__ == "__main__":
    main()
