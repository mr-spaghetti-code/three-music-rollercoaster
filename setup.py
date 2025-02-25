#!/usr/bin/env python3
"""
Music Rollercoaster Setup Script
This script sets up the necessary files and directories for the Music Rollercoaster Visualization.
"""

import os
import sys
import shutil
import platform
import subprocess

def print_colored(text, color):
    """Print colored text to the console."""
    colors = {
        'green': '\033[92m',
        'yellow': '\033[93m',
        'blue': '\033[94m',
        'red': '\033[91m',
        'bold': '\033[1m',
        'end': '\033[0m'
    }
    print(f"{colors.get(color, '')}{text}{colors['end']}")

def create_directory(path):
    """Create a directory if it doesn't exist."""
    if not os.path.exists(path):
        os.makedirs(path)
        print_colored(f"Created directory: {path}", "green")
        return True
    else:
        print_colored(f"Directory already exists: {path}", "yellow")
        return False

def copy_data_files():
    """Copy data files to the web/data directory."""
    # Get the project root directory
    root_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(root_dir, "web", "data")
    
    # Create the data directory if it doesn't exist
    create_directory(data_dir)
    
    # Find all energy_values*.csv files in the root directory
    csv_files = [f for f in os.listdir(root_dir) if f.startswith("energy_values") and f.endswith(".csv")]
    
    if not csv_files:
        print_colored("No energy_values*.csv files found in the project root!", "red")
        return False
    
    # Copy each file to the data directory
    for file in csv_files:
        src = os.path.join(root_dir, file)
        dst = os.path.join(data_dir, file)
        
        if os.path.exists(dst):
            # Check if the source file is newer
            src_mtime = os.path.getmtime(src)
            dst_mtime = os.path.getmtime(dst)
            
            if src_mtime <= dst_mtime:
                print_colored(f"File already up to date: {file}", "yellow")
                continue
        
        # Copy the file
        shutil.copy2(src, dst)
        print_colored(f"Copied file: {file}", "green")
    
    return True

def make_scripts_executable():
    """Make the Python scripts executable on Unix-like systems."""
    if platform.system() in ["Linux", "Darwin"]:  # Linux or macOS
        scripts = ["server.py", "advanced_server.py", "run_server.py"]
        for script in scripts:
            if os.path.exists(script):
                try:
                    # Make the script executable (chmod +x)
                    os.chmod(script, os.stat(script).st_mode | 0o111)
                    print_colored(f"Made executable: {script}", "green")
                except Exception as e:
                    print_colored(f"Error making {script} executable: {str(e)}", "red")
        return True
    else:
        print_colored("Skipping executable permissions on Windows", "yellow")
        return True

def main():
    """Run the setup process."""
    print_colored("🎢 Music Rollercoaster Setup", "bold")
    print("This script will set up the necessary files and directories for the Music Rollercoaster Visualization.")
    print()
    
    # Copy data files
    print_colored("Step 1: Copying data files...", "blue")
    if not copy_data_files():
        print_colored("Failed to copy data files!", "red")
        return False
    print()
    
    # Make scripts executable
    print_colored("Step 2: Making scripts executable...", "blue")
    if not make_scripts_executable():
        print_colored("Failed to make scripts executable!", "red")
        return False
    print()
    
    # Success message
    print_colored("✅ Setup completed successfully!", "bold")
    print("You can now run the server with:")
    print_colored("  python run_server.py", "green")
    print("Or on Unix-like systems:")
    print_colored("  ./run_server.py", "green")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 