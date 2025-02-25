#!/bin/bash
# Make the Python server files executable

echo "Making server scripts executable..."

# Make the server scripts executable
chmod +x server.py
chmod +x advanced_server.py
chmod +x run_server.py

echo "Done! You can now run the servers directly:"
echo "./run_server.py"
echo "./server.py"
echo "./advanced_server.py" 