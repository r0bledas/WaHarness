import os
import sys
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.protocol import create_request, parse_request, create_response, parse_response
from worker.executor import execute_command

def main():
    print("=== WaHarness Mac Offline / Zero-Rate CLI Test ===")
    print("This simulates the exact loop without requiring WAHA running yet.\n")
    
    secret = "test-secret"
    target = "mac"
    cmd = "uname -a && sw_vers && whoami"
    
    print(f"1. Controller creates signed RPC request packet:")
    req_packet = create_request(cmd=cmd, target=target, secret=secret)
    print(f"Packet: {req_packet}\n")
    
    print("2. Simulating packet transfer over WhatsApp to Mac...")
    time.sleep(0.5)
    
    print("3. Mac Worker receives and verifies packet:")
    parsed = parse_request(req_packet, secret=secret)
    print(f"Verified command: {parsed['cmd']} (target={parsed['target']}, id={parsed['id']})\n")
    
    print("4. Mac Worker executes command natively in zsh/shell:")
    res = execute_command(parsed["cmd"])
    print(f"Exit code: {res['code']}")
    print(f"Duration: {res['dur']:.2f}s")
    print("Stdout:")
    print(res["out"])
    if res["err"]:
        print("Stderr:")
        print(res["err"])
        
    print("5. Mac Worker wraps result into signed RPC response packet:")
    res_packet = create_response(
        req_id=parsed["id"],
        exit_code=res["code"],
        stdout=res["out"],
        stderr=res["err"],
        duration=res["dur"],
        secret=secret
    )
    print(f"Response Packet: {res_packet}\n")
    
    print("6. Controller receives response packet over WhatsApp and parses it:")
    parsed_res = parse_response(res_packet, secret=secret)
    print(f"Parsed Result for [{parsed_res['id']}]: exit={parsed_res['code']}, dur={parsed_res['dur']}s")
    print("Done! Core execution flow verified.")

if __name__ == "__main__":
    main()
