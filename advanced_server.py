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
import json
import cgi
import threading
import uuid
import shutil
from music_energy_analyzer import extract_energy_metric

# Add proper MIME types
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/json', '.json')

# Track processing status for each upload
processing_status = {}
# Lock for thread-safe access to the processing_status dictionary
status_lock = threading.Lock()

class MusicRollercoasterHandler(http.server.SimpleHTTPRequestHandler):
    """Enhanced handler for serving the Music Rollercoaster visualization."""
    
    def __init__(self, *args, **kwargs):
        self.server_start_time = time.time()
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        """Handle GET requests with improved error handling."""
        try:
            # Check if this is a status check for an upload
            if self.path.startswith('/status/'):
                # Extract the upload ID from the path
                upload_id = self.path.split('/status/')[1]
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                # Get status with thread safety
                with status_lock:
                    status = processing_status.get(upload_id, {'status': 'unknown'})
                
                self.wfile.write(json.dumps(status).encode())
                return
                
            # Check if this is a request to clean up a processed file
            if self.path.startswith('/cleanup/'):
                # Extract the upload ID from the path
                upload_id = self.path.split('/cleanup/')[1]
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                # Perform cleanup in a separate thread to not block the response
                threading.Thread(target=self.cleanup_processed_files, args=(upload_id,)).start()
                
                self.wfile.write(json.dumps({'status': 'cleanup_initiated'}).encode())
                return
            
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
    
    def do_POST(self):
        """Handle POST requests for file uploads."""
        try:
            if self.path == '/upload':
                # Generate a unique ID for this upload
                upload_id = str(uuid.uuid4())
                
                # Parse the form data
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={'REQUEST_METHOD': 'POST'}
                )
                
                # Get the file data
                file_item = form['file']
                
                # Check if it's an MP3 file
                if not file_item.filename.lower().endswith('.mp3'):
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'Only MP3 files are supported'}).encode())
                    return
                
                # Create necessary directories if they don't exist
                custom_audio_dir = os.path.join(self.directory, 'audio/custom')
                custom_data_dir = os.path.join(self.directory, 'data/custom')
                
                os.makedirs(custom_audio_dir, exist_ok=True)
                os.makedirs(custom_data_dir, exist_ok=True)
                
                # Save the uploaded file with upload_id in filename
                mp3_path = os.path.join(custom_audio_dir, f"temp_{upload_id}.mp3")
                with open(mp3_path, 'wb') as f:
                    f.write(file_item.file.read())
                
                # Create a preview file
                preview_path = os.path.join(custom_audio_dir, "preview.mp3")
                if not os.path.exists(preview_path):
                    shutil.copy(mp3_path, preview_path)
                
                # Update status
                with status_lock:
                    processing_status[upload_id] = {
                        'status': 'processing',
                        'progress': 0,
                        'message': 'Starting analysis...',
                        'upload_id': upload_id
                    }
                
                # Process the audio file in a separate thread
                threading.Thread(
                    target=self.process_audio_file,
                    args=(mp3_path, upload_id)
                ).start()
                
                # Send response with upload ID
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'upload_id': upload_id,
                    'status': 'processing'
                }).encode())
                return
            
            # Handle unsupported paths
            self.send_response(404)
            self.end_headers()
            
        except Exception as e:
            self.send_error(500, f"Server error: {str(e)}")
            print(f"Error processing upload: {str(e)}", file=sys.stderr)
    
    def process_audio_file(self, mp3_path, upload_id):
        """Process the uploaded MP3 file and generate analysis data."""
        try:
            # Update status
            self.update_status(upload_id, 'processing', 10, 'Analyzing audio...')
            
            # Create unique directories for this upload
            custom_audio_dir = os.path.join(self.directory, 'audio/custom')
            custom_data_dir = os.path.join(self.directory, 'data/custom')
            
            # Create upload-specific subdirectories
            upload_audio_dir = os.path.join(custom_audio_dir, upload_id)
            upload_data_dir = os.path.join(custom_data_dir, upload_id)
            
            os.makedirs(upload_audio_dir, exist_ok=True)
            os.makedirs(upload_data_dir, exist_ok=True)
            
            # Move the uploaded file to its unique directory
            final_mp3_path = os.path.join(upload_audio_dir, 'custom.mp3')
            shutil.move(mp3_path, final_mp3_path)
            
            # Run the energy extraction with paths in the unique directory
            self.update_status(upload_id, 'processing', 20, 'Extracting energy data...')
            energy_curve = extract_energy_metric(
                final_mp3_path, 
                output_file=os.path.join(upload_data_dir, 'energy_values'),
                visualize=False
            )
            
            # Update status
            self.update_status(upload_id, 'processing', 60, 'Creating structure data...')
            
            # Create structure data (simplified for custom songs)
            # This creates a basic structure with sections every 30 seconds
            try:
                import pandas as pd
                import numpy as np
                
                # Load the energy data we just created
                energy_df = pd.read_csv(os.path.join(upload_data_dir, 'energy_values_energy.csv'))
                times = energy_df['time'].values
                
                # Create structure data with alternating sections every 30 seconds
                structure_data = []
                current_section = 0
                section_duration = 30  # seconds
                
                for time_val in times:
                    # Change section every 30 seconds
                    section = int(time_val / section_duration) % 4  # Cycle through 4 sections
                    structure_data.append({'time': time_val, 'section': section})
                
                # Save structure data
                pd.DataFrame(structure_data).to_csv(
                    os.path.join(upload_data_dir, 'energy_values_structure.csv'),
                    index=False
                )
                
                # Update status
                self.update_status(upload_id, 'processing', 80, 'Creating zone data...')
                
                # Create zone data based on energy levels
                zone_data = []
                for i, row in energy_df.iterrows():
                    time_val = row['time']
                    energy_val = row['energy']
                    
                    # Assign zone based on energy level
                    if energy_val < 0.33:
                        zone = 0  # low energy
                    elif energy_val < 0.66:
                        zone = 1  # medium energy
                    else:
                        zone = 2  # high energy
                    
                    zone_data.append({'time': time_val, 'zone': zone})
                
                # Save zone data
                pd.DataFrame(zone_data).to_csv(
                    os.path.join(upload_data_dir, 'energy_values_zones.csv'),
                    index=False
                )
                
            except Exception as e:
                print(f"Error creating additional data files: {str(e)}")
                # Continue despite error in additional files
            
            # Store upload_id in processing status for the client to use
            with status_lock:
                processing_status[upload_id]['upload_path'] = upload_id
            
            # Update status
            self.update_status(upload_id, 'complete', 100, 'Processing complete')
            
        except Exception as e:
            # Update status with error
            print(f"Error processing file: {str(e)}", file=sys.stderr)
            self.update_status(upload_id, 'error', 0, f'Error: {str(e)}')
    
    def update_status(self, upload_id, status, progress, message):
        """Update the processing status with thread safety."""
        with status_lock:
            processing_status[upload_id] = {
                'status': status,
                'progress': progress,
                'message': message
            }
    
    def cleanup_processed_files(self, upload_id):
        """Clean up processed files after they've been loaded by the client."""
        try:
            # Mark as cleaned up in status
            with status_lock:
                if upload_id in processing_status:
                    processing_status[upload_id]['status'] = 'cleaned'
            
            print(f"Cleanup initiated for upload ID: {upload_id}")
            
            # Schedule actual deletion after a delay (30 minutes)
            # This gives client time to load the data before removing it
            def delayed_cleanup():
                try:
                    # Wait for 30 minutes
                    time.sleep(1800)  # 30 minutes in seconds
                    
                    # Delete this specific upload's directories
                    upload_audio_dir = os.path.join(self.directory, 'audio/custom', upload_id)
                    upload_data_dir = os.path.join(self.directory, 'data/custom', upload_id)
                    
                    # Delete upload-specific directories if they exist
                    if os.path.exists(upload_audio_dir):
                        shutil.rmtree(upload_audio_dir)
                        print(f"Deleted audio directory: {upload_audio_dir}")
                    
                    if os.path.exists(upload_data_dir):
                        shutil.rmtree(upload_data_dir)
                        print(f"Deleted data directory: {upload_data_dir}")
                    
                    # Remove from status
                    with status_lock:
                        if upload_id in processing_status:
                            del processing_status[upload_id]
                    
                    print(f"Cleanup completed for upload ID: {upload_id}")
                except Exception as e:
                    print(f"Error during delayed cleanup: {str(e)}", file=sys.stderr)
            
            # Start cleanup thread
            threading.Thread(target=delayed_cleanup, daemon=True).start()
            
        except Exception as e:
            print(f"Error initiating cleanup: {str(e)}", file=sys.stderr)
    
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
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
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