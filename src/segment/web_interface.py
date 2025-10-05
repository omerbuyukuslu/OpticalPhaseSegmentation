"""
Flask-based web interface for LAB color space classification
"""

import os
import base64
import json
from io import BytesIO
from flask import Flask, render_template, request, jsonify
import cv2
from PIL import Image

# Try relative import first, fall back to absolute
try:
    from .pipeline import preprocess_image
except ImportError:
    from pipeline import preprocess_image


class WebInterface:
    def __init__(self, image_path, output_dir="src/out", port=8000):
        """
        Initialize web interface

        Args:
            image_path: Path to input image
            output_dir: Output directory for results
            port: Port for web server
        """
        self.image_path = image_path
        self.output_dir = output_dir
        self.port = port

        # Load and preprocess image
        self.original_image, self.gray_image = preprocess_image(image_path)
        self.phases = {}  # Store user-defined phases
        self.sampled_points = {}  # Store sampled RGB values per phase: {phase_id: [(x,y,r,g,b), ...]}

        # Create Flask app
        self.app = Flask(
            __name__,
            template_folder=os.path.join(os.path.dirname(__file__), "..", "web"),
            static_folder=os.path.join(os.path.dirname(__file__), "..", "web"),
            static_url_path="",
        )

        self.setup_routes()
        
        # Add cache-busting headers for static files
        @self.app.after_request
        def add_header(response):
            """Add headers to prevent caching of JavaScript and CSS"""
            if request.path.endswith('.js') or request.path.endswith('.css'):
                response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
                response.headers['Pragma'] = 'no-cache'
                response.headers['Expires'] = '-1'
            return response

    def setup_routes(self):
        """Setup Flask routes"""

        @self.app.route("/")
        def index():
            return render_template("index.html")

        @self.app.route("/get_image")
        def get_image():
            """Return base64 encoded image"""
            # Convert BGR to RGB for web display
            rgb_image = cv2.cvtColor(self.original_image, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_image)

            buffer = BytesIO()
            pil_image.save(buffer, format="PNG")
            img_base64 = base64.b64encode(buffer.getvalue()).decode()

            return jsonify(
                {
                    "image": f"data:image/png;base64,{img_base64}",
                    "width": self.original_image.shape[1],
                    "height": self.original_image.shape[0],
                }
            )

        @self.app.route("/sample_pixel", methods=["POST"])
        def sample_pixel():
            """Sample RGB pixel value from original image"""
            data = request.json
            x = int(data["x"])
            y = int(data["y"])
            phase_id = data.get("phase_id")

            print(f"[SAMPLE] Received: x={x}, y={y}, phase_id={phase_id}")

            # Get RGB pixel value from original image (BGR format in OpenCV)
            if 0 <= y < self.original_image.shape[0] and 0 <= x < self.original_image.shape[1]:
                bgr_pixel = self.original_image[y, x]
                # Convert BGR to RGB for display
                rgb_pixel = [int(bgr_pixel[2]), int(bgr_pixel[1]), int(bgr_pixel[0])]

                print(f"[SAMPLE] RGB at ({x},{y}): {rgb_pixel}")

                return jsonify(
                    {
                        "status": "success",
                        "rgb": rgb_pixel,
                        "hex": "#{:02x}{:02x}{:02x}".format(rgb_pixel[0], rgb_pixel[1], rgb_pixel[2]),
                    }
                )
            else:
                print(f"[SAMPLE] ERROR: Coordinates out of bounds: ({x},{y})")
                return jsonify({"status": "error", "message": "Coordinates out of bounds"})

        @self.app.route("/clear_samples", methods=["POST"])
        def clear_samples():
            """Clear sampled points for a phase (legacy endpoint for compatibility)"""
            return jsonify({"status": "success"})

        # Legacy endpoints for backward compatibility - return empty/success
        @self.app.route("/get_markers")
        def get_markers():
            """Legacy endpoint - LAB classification doesn't use markers"""
            return jsonify({})

        @self.app.route("/save_markers", methods=["POST"])
        def save_markers():
            """Legacy endpoint - phases are saved via XML export"""
            return jsonify({"status": "success", "message": 'Use "Save Classification" for LAB-based workflow'})

        @self.app.route("/load_markers", methods=["POST"])
        def load_markers():
            """Legacy endpoint - use XML import instead"""
            return jsonify({"status": "success", "message": 'Use "Load Classification" for LAB-based workflow'})

    def run(self):
        """Start the web server"""
        print(f"Starting web interface at http://localhost:{self.port}")
        print(f"Image: {self.image_path}")
        print(f"Output directory: {self.output_dir}")
        print(f"Classification algorithm: LAB color space thresholding with B/C zoning")
        self.app.run(host="0.0.0.0", port=self.port, debug=True)


def main():
    """Main entry point for web interface"""
    import argparse

    parser = argparse.ArgumentParser(description="Interactive Web Interface for LAB Color Space Classification")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--port", type=int, default=8000, help="Port for web server")
    parser.add_argument("--output", default="src/out", help="Output directory")

    args = parser.parse_args()

    web_interface = WebInterface(args.image, args.output, args.port)
    web_interface.run()


if __name__ == "__main__":
    main()
