import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

class TestServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_DIR, **kwargs)

    def do_POST(self):
        if self.path == '/__report__':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                report_data = json.loads(body)
                self.server.report_data = report_data
                self.server.report_event.set()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silence HTTP access logs
        pass

def main():
    filter_suite = ''
    if '--suite' in sys.argv:
        idx = sys.argv.index('--suite')
        if idx + 1 < len(sys.argv):
            filter_suite = sys.argv[idx + 1]

    server = http.server.HTTPServer(('127.0.0.1', 0), TestServerHandler)
    server.report_data = None
    server.report_event = threading.Event()
    port = server.server_port

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    edge_bin = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    if not os.path.exists(edge_bin):
        print(f"ERROR: Microsoft Edge not found at {edge_bin}", file=sys.stderr)
        sys.exit(1)

    temp_profile = tempfile.mkdtemp(prefix='edge-test-profile-')
    url = f"http://127.0.0.1:{port}/tests/runner.html?suite={urllib.parse.quote(filter_suite)}"

    cmd = [
        edge_bin,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        f'--user-data-dir={temp_profile}',
        url
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    got_report = server.report_event.wait(timeout=15.0)

    try:
        proc.terminate()
    except Exception:
        pass

    server.shutdown()
    shutil.rmtree(temp_profile, ignore_errors=True)

    if not got_report or server.report_data is None:
        print("ERROR: Test runner timed out after 15 seconds without receiving report from browser.", file=sys.stderr)
        sys.exit(1)

    data = server.report_data
    passed = data.get('passed', 0)
    failed = data.get('failed', 0)
    results = data.get('results', [])

    for r in results:
        status_sym = '✔' if r.get('ok') else '✖'
        print(f"{status_sym} [{r.get('suite')}] {r.get('name')}")
        if not r.get('ok') and r.get('error'):
            print(f"    Error: {r.get('error')}")

    print(f"\nSummary: {passed} passed, {failed} failed")

    if failed > 0 or passed == 0:
        sys.exit(1)
    sys.exit(0)

if __name__ == '__main__':
    main()
