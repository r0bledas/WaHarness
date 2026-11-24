import json
import hmac
import hashlib
import time
import uuid

MAGIC_REQ = '!RPC_REQ:'
MAGIC_RES = '!RPC_RES:'

def sign_payload(payload_str: str, secret: str) -> str:
    if not secret:
        return ''
    return hmac.new(secret.encode('utf-8'), payload_str.encode('utf-8'), hashlib.sha256).hexdigest()

def verify_signature(payload_str: str, signature: str, secret: str) -> bool:
    if not secret:
        return True
    expected = sign_payload(payload_str, secret)
    return hmac.compare_digest(expected, signature)

def create_request(cmd: str, target: str = 'mac', cwd: str = '', timeout: int = 60, secret: str = '') -> str:
    req_id = str(uuid.uuid4())[:8]
    data = {
        'id': req_id,
        'target': target,
        'cmd': cmd,
        'cwd': cwd,
        'timeout': timeout,
        'ts': int(time.time())
    }
    dumped = json.dumps(data, separators=(',', ':'))
    sig = sign_payload(dumped, secret)
    envelope = {'p': dumped, 's': sig}
    return MAGIC_REQ + json.dumps(envelope, separators=(',', ':'))

def parse_request(raw_message: str, secret: str = '') -> dict:
    raw = raw_message.strip()
    if not raw.startswith(MAGIC_REQ):
        return None
    raw_env = raw[len(MAGIC_REQ):].strip()
    envelope = json.loads(raw_env)
    payload_str = envelope.get('p', '')
    sig = envelope.get('s', '')
    if secret and not verify_signature(payload_str, sig, secret):
        raise ValueError('Invalid HMAC signature on RPC request')
    return json.loads(payload_str)

def create_response(req_id: str, exit_code: int, stdout: str, stderr: str, duration: float, secret: str = '') -> str:
    data = {
        'id': req_id,
        'code': exit_code,
        'out': stdout,
        'err': stderr,
        'dur': round(duration, 2),
        'ts': int(time.time())
    }
    dumped = json.dumps(data, separators=(',', ':'))
    sig = sign_payload(dumped, secret)
    envelope = {'p': dumped, 's': sig}
    return MAGIC_RES + json.dumps(envelope, separators=(',', ':'))

def parse_response(raw_message: str, secret: str = '') -> dict:
    raw = raw_message.strip()
    if not raw.startswith(MAGIC_RES):
        return None
    raw_env = raw[len(MAGIC_RES):].strip()
    envelope = json.loads(raw_env)
    payload_str = envelope.get('p', '')
    sig = envelope.get('s', '')
    if secret and not verify_signature(payload_str, sig, secret):
        raise ValueError('Invalid HMAC signature on RPC response')
    return json.loads(payload_str)
