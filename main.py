import os
import sys
import threading
import socket
from http.server import HTTPServer, SimpleHTTPRequestHandler
import webview

# When frozen by PyInstaller, sys._MEIPASS is the extracted folder
if getattr(sys, 'frozen', False):
    BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

APP_DIR = os.path.join(BASE_DIR, 'app')

class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def end_headers(self):
        # Enable caching and offline headers
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Silence HTTP access logs
        pass

def run_server(port):
    server = HTTPServer(('127.0.0.1', port), AppRequestHandler)
    server.serve_forever()

def get_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port

def main():
    port = get_free_port()
    server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
    server_thread.start()

    url = f"http://127.0.0.1:{port}/index.html"
    
    icon_path = os.path.join(APP_DIR, 'assets', 'icons', 'icon.ico')
    if not os.path.exists(icon_path):
        icon_path = None

    window = webview.create_window(
        title='Qisas',
        url=url,
        width=1200,
        height=850,
        min_size=(460, 650),
        text_select=True,
        zoomable=True
    )

    webview.start(debug=False)

if __name__ == '__main__':
    main()
