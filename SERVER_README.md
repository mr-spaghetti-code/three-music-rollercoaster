# Music Rollercoaster Server

This is a simple Python server for the Music Rollercoaster Visualization.

## Requirements

- Python 3.6 or higher

## Setup

### Automatic Setup (Recommended)

The easiest way to set up everything is to run the setup script:

```bash
python setup.py
```

This script will:
1. Create the `web/data` directory if it doesn't exist
2. Copy all the required CSV files to the `web/data` directory
3. Make the server scripts executable on Unix-like systems (Linux/macOS)

### Manual Setup

#### Data Files

The visualization requires several CSV data files to be available in the `web/data/` directory:

- `energy_values.csv`
- `energy_values_energy.csv`
- `energy_values_spectral.csv`
- `energy_values_structure.csv`
- `energy_values_zones.csv`

If you're seeing 404 errors for these files, make sure they exist in the `web/data/` directory. You can copy them from the project root with:

```bash
mkdir -p web/data
cp energy_values*.csv web/data/
```

#### Making Scripts Executable (Unix/Linux/macOS)

To make the Python scripts executable:

```bash
chmod +x server.py advanced_server.py run_server.py
```

Or use the provided shell script:

```bash
bash make_executable.sh
```

## Running the Server

### Quick Start (Recommended)

Use the launcher script to run either the basic or advanced server:

```bash
# Run the basic server
python run_server.py

# Run the advanced server
python run_server.py --advanced

# Show advanced server options
python run_server.py --show-advanced-options

# Pass options to the advanced server
python run_server.py --advanced --port 9000 --no-browser
```

### Basic Server

1. Make sure you're in the project root directory (where `server.py` is located)
2. Run the server with:

```bash
python server.py
```

3. The server will start on port 8000 and automatically open your default web browser
4. If the browser doesn't open automatically, visit: http://localhost:8000

### Advanced Server

The advanced server provides more features and better error handling:

```bash
python advanced_server.py [options]
```

Available options:
- `-p PORT, --port PORT`: Port to run the server on (default: 8000)
- `-d DIRECTORY, --directory DIRECTORY`: Directory to serve (default: web)
- `--no-browser`: Do not open browser automatically

Examples:
```bash
# Run on port 9000
python advanced_server.py --port 9000

# Serve from a different directory
python advanced_server.py --directory my_web_files

# Don't open browser automatically
python advanced_server.py --no-browser
```

## Features

### Basic Server
- Serves the web-based Music Rollercoaster Visualization
- Automatically opens your browser when started
- Provides detailed logging of requests
- Includes CORS headers for loading external resources

### Advanced Server (additional features)
- Command-line options for customization
- Colored terminal output for better readability
- Proper MIME type handling
- Caching headers for better performance
- Better error handling and reporting
- Protection against directory traversal attacks

### Launcher Script
- Single entry point for both servers
- Easy switching between basic and advanced modes
- Passes through command-line arguments to the advanced server
- Provides help for available options

## Stopping the Server

- Press `Ctrl+C` in the terminal to stop the server

## Troubleshooting

- If you see "Address already in use" error, another service might be using port 8000. 
  You can modify the `PORT` variable in `server.py` or use the `--port` option with the advanced server.
- Make sure the `web` directory contains all necessary files (index.html, main.js, etc.)
- **404 Errors for CSV Files**: If you see 404 errors for files like `energy_values_structure.csv`, make sure you've copied the CSV files to the `web/data/` directory as described in the Setup section.
- **CORS Issues**: If you're seeing CORS errors in the browser console, the server is already configured to send CORS headers, but you might need to restart the server if you made changes.
- **Blank Page**: If you see a blank page, check the browser console for JavaScript errors. Make sure all paths in your HTML and JavaScript files are correct. 