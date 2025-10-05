#!/usr/bin/env python3
"""
Simple startup script for the web interface
"""

import sys
import os

# Add current directory to path
sys.path.insert(0, os.getcwd())

from src.segment.web_interface import WebInterface


def main():
    """Start the web interface"""
    image_path = "src/data/example.png"

    if not os.path.exists(image_path):
        print(f"Error: Image file not found: {image_path}")
        return 1

    print("Starting Web Interface...")
    print(f"Image: {image_path}")
    print("Navigate to http://localhost:8000 in your browser")

    web_interface = WebInterface(image_path, output_dir="src/out", port=8000)
    web_interface.run()

    return 0


if __name__ == "__main__":
    sys.exit(main())
