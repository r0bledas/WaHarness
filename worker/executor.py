import subprocess
import time
import os
import sys

def execute_command(cmd: str, cwd: str = '', timeout: int = 60) -> dict:
    work_dir = os.path.expanduser(cwd) if cwd else os.getcwd()
    if not os.path.exists(work_dir):
        work_dir = os.getcwd()

    start_time = time.time()
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=work_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            encoding='utf-8',
            errors='replace'
        )
        dur = time.time() - start_time
        return {
            'code': proc.returncode,
            'out': proc.stdout or '',
            'err': proc.stderr or '',
            'dur': dur
        }
    except subprocess.TimeoutExpired as e:
        dur = time.time() - start_time
        return {
            'code': 124,
            'out': (e.stdout or '') if isinstance(e.stdout, str) else '',
            'err': f'Command timed out after {timeout} seconds.',
            'dur': dur
        }
    except Exception as e:
        dur = time.time() - start_time
        return {
            'code': 1,
            'out': '',
            'err': str(e),
            'dur': dur
        }
