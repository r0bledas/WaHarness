import time
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.protocol import create_request, parse_response, MAGIC_RES

class RemoteExecutionManager:
    def __init__(self, secret: str = ''):
        self.secret = secret
        self.pending_requests = {}

    def dispatch(self, cmd: str, target: str = 'mac', cwd: str = '', timeout: int = 60) -> tuple:
        packet = create_request(cmd=cmd, target=target, cwd=cwd, timeout=timeout, secret=self.secret)
        env_raw = packet[len('!RPC_REQ:'):]
        env = json.loads(env_raw)
        req_data = json.loads(env['p'])
        req_id = req_data['id']
        self.pending_requests[req_id] = {
            'status': 'pending',
            'created_at': time.time(),
            'timeout': timeout,
            'result': None
        }
        return req_id, packet

    def record_response(self, raw_message: str) -> dict:
        if not raw_message.startswith(MAGIC_RES):
            return None
        res = parse_response(raw_message, secret=self.secret)
        req_id = res.get('id')
        if req_id in self.pending_requests:
            self.pending_requests[req_id]['status'] = 'completed'
            self.pending_requests[req_id]['result'] = res
            return res
        return None

    def wait_for_result(self, req_id: str, timeout: int = 60, poll_interval: float = 0.5) -> dict:
        deadline = time.time() + timeout
        while time.time() < deadline:
            entry = self.pending_requests.get(req_id)
            if entry and entry['status'] == 'completed':
                return entry['result']
            time.sleep(poll_interval)
        return {
            'id': req_id,
            'code': 124,
            'out': '',
            'err': f'Timed out waiting for remote worker response ({timeout}s)',
            'dur': timeout
        }
