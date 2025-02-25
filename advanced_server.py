#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys
import webbrowser
import mimetypes
import argparse
from urllib.parse import urlparse, unquote
import time

# Add proper MIME types
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/json', '.json')

class MusicRollercoasterHandler(http.server.SimpleHTTPRequestHandler):
    """Enhanced handler for serving the Music Rollercoaster visualization."""
    
    def __init__(self, *args, **kwargs):
        self.server_start_time = time.time()
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        """Handle GET requests with improved error handling."""
        try:
            # Normalize the path to prevent directory traversal
            path = self.path
            if path == '/':
                path = '/index.html'
                
            # Get the file path
            file_path = os.path.join(self.directory, path.lstrip('/'))
            
            # Check if the file exists
            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                self.send_error(404, f"File not found: {path}")
                return
                
            # Serve the file
            return super().do_GET()
            
        except Exception as e:
            self.send_error(500, f"Server error: {str(e)}")
            print(f"Error serving {self.path}: {str(e)}", file=sys.stderr)
    
    def log_message(self, format, *args):
        """Enhanced logging with timing information."""
        elapsed = time.time() - self.server_start_time
        path = unquote(urlparse(self.path).path)
        status = args[1] if len(args) > 1 else ""
        
        # Color the status code based on its value
        if status.startswith('2'):  # 2xx Success
            status_colored = f"\033[92m{status}\033[0m"  # Green
        elif status.startswith('3'):  # 3xx Redirection
            status_colored = f"\033[94m{status}\033[0m"  # Blue
        elif status.startswith('4'):  # 4xx Client Error
            status_colored = f"\033[93m{status}\033[0m"  # Yellow
        elif status.startswith('5'):  # 5xx Server Error
            status_colored = f"\033[91m{status}\033[0m"  # Red
        else:
            status_colored = status
            
        print(f"[{self.log_date_time_string()}] {status_colored} {self.address_string()} - {path} ({format % args}) [{elapsed:.2f}s]")
    
    def end_headers(self):
        """Add CORS and caching headers."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        
        # Add caching headers for better performance
        if self.path.endswith(('.js', '.css', '.jpg', '.png', '.gif', '.ico')):
            # Cache static assets for 1 hour
            self.send_header('Cache-Control', 'public, max-age=3600')
        else:
            # Don't cache HTML
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            
        super().end_headers()

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Music Rollercoaster Visualization Server')
    parser.add_argument('-p', '--port', type=int, default=8000, help='Port to run the server on (default: 8000)')
    parser.add_argument('-d', '--directory', type=str, default='web', help='Directory to serve (default: web)')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    return parser.parse_args()

def main():
    """Start the server with the specified options."""
    args = parse_arguments()
    
    # Set up the directory to serve
    web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), args.directory)
    if not os.path.isdir(web_dir):
        print(f"Error: Directory '{web_dir}' does not exist", file=sys.stderr)
        sys.exit(1)
    
    # Create the handler with the specified directory
    handler = lambda *args, **kwargs: MusicRollercoasterHandler(*args, directory=web_dir, **kwargs)
    
    # Try to create the server, handling port conflicts
    try:
        with socketserver.TCPServer(("", args.port), handler) as httpd:
            url = f"http://localhost:{args.port}"
            print(f"\033[1m🎢 Music Rollercoaster Server\033[0m")
            print(f"Serving from: \033[94m{web_dir}\033[0m")
            print(f"Server URL: \033[94m{url}\033[0m")
            print(f"Press Ctrl+C to stop the server")
            
            # Open browser if requested
            if not args.no_browser:
                webbrowser.open(url)
            
            # Start serving requests
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n\033[93mServer stopped by user\033[0m")
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"Error: Port {args.port} is already in use. Try a different port with --port option.", file=sys.stderr)
        else:
            print(f"Error starting server: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 