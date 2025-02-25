#!/usr/bin/env python3
import http.server
import socketserver
import os
import webbrowser
from urllib.parse import urlparse, unquote

# Configuration
PORT = 8001
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

class MusicRollercoasterHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler for serving the Music Rollercoaster visualization."""
    
    def __init__(self, *args, **kwargs):
        # Set the directory to serve files from
        super().__init__(*args, directory=WEB_DIR, **kwargs)
    
    def log_message(self, format, *args):
        """Override to provide more informative logging."""
        path = unquote(urlparse(self.path).path)
        print(f"[{self.log_date_time_string()}] {self.address_string()} - {path} - {format % args}")
    
    def end_headers(self):
        """Add CORS headers to allow loading resources from CDNs."""
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def main():
    """Start the server and open the browser."""
    handler = MusicRollercoasterHandler
    
    # Create and start the server
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Serving Music Rollercoaster at http://localhost:{PORT}")
        print(f"Press Ctrl+C to stop the server")
        
        # Open the browser automatically
        webbrowser.open(f"http://localhost:{PORT}")
        
        # Start serving requests
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped by user")

if __name__ == "__main__":
    main() 