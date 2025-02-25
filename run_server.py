#!/usr/bin/env python3
"""
Music Rollercoaster Server Launcher
This script provides a simple way to launch either the basic or advanced server.
Use the advanced server for custom song uploads.
"""

import argparse
import os
import sys
import importlib.util
import subprocess

def check_file_exists(file_path):
    """Check if a file exists and is readable."""
    return os.path.isfile(file_path) and os.access(file_path, os.R_OK)

def run_module(module_path, args):
    """Run a Python module with the given arguments."""
    if not check_file_exists(module_path):
        print(f"Error: {module_path} not found", file=sys.stderr)
        return False
    
    cmd = [sys.executable, module_path] + args
    try:
        subprocess.run(cmd)
        return True
    except KeyboardInterrupt:
        print("\nServer stopped by user")
        return True
    except Exception as e:
        print(f"Error running server: {str(e)}", file=sys.stderr)
        return False

def main():
    """Parse arguments and run the selected server."""
    parser = argparse.ArgumentParser(description='Music Rollercoaster Server Launcher')
    parser.add_argument('--advanced', action='store_true', help='Use the advanced server (required for custom song uploads)')
    
    # Add a special help for showing advanced server options
    parser.add_argument('--show-advanced-options', action='store_true', 
                        help='Show options for the advanced server')
    
    # Parse known args to handle our specific flags
    args, remaining = parser.parse_known_args()
    
    # Show advanced options if requested
    if args.show_advanced_options:
        print("Advanced Server Options:")
        subprocess.run([sys.executable, 'advanced_server.py', '--help'])
        return
    
    # Determine which server to run
    if args.advanced:
        print("Starting advanced server (supports custom song uploads)...")
        return run_module('advanced_server.py', remaining)
    else:
        print("Starting basic server (does NOT support custom song uploads)...")
        print("Use --advanced flag to enable custom song uploads")
        return run_module('server.py', remaining)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 