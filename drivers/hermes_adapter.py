import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from drivers.remote_exec import RemoteExecutionManager

class WaHarnessController:
    def __init__(self, secret: str = ''):
        self.rpc = RemoteExecutionManager(secret=secret)

    def route_mac_command(self, cmd: str, send_whatsapp_cb, chat_id: str, cwd: str = '', timeout: int = 60) -> dict:
        req_id, packet = self.rpc.dispatch(cmd=cmd, target='mac', cwd=cwd, timeout=timeout)
        send_whatsapp_cb(chat_id, packet)
        res = self.rpc.wait_for_result(req_id, timeout=timeout)
        return res
