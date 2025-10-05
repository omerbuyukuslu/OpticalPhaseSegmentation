"""
Flask-based web interface for LAB color space classification
"""

import os
import base64
from io import BytesIO
from flask import Flask, render_template, request, jsonify, send_file
import cv2
import numpy as np
from PIL import Image

# Try relative import first, fall back to absolute
try:
    from .pipeline import preprocess_image
    from .batch_backend import batch_backend
except ImportError:
    from pipeline import preprocess_image
    from batch_backend import batch_backend


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
            if request.path.endswith(".js") or request.path.endswith(".css"):
                response.headers["Cache-Control"] = (
                    "no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0"
                )
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "-1"
            return response

    def setup_routes(self):
        """Setup Flask routes"""

        @self.app.route("/")
        def index():
            return render_template("index.html")

        @self.app.route("/batch.html")
        def batch_page():
            return render_template("batch.html")

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

        @self.app.route("/batch/process", methods=["POST"])
        def batch_process():
            """Process multiple images with saved classification settings (legacy - client-side)"""
            try:
                data = request.json
                images_data = data.get("images", [])
                classification_config = data.get("classification", {})

                from .batch_processor import BatchProcessor

                processor = BatchProcessor(classification_config)
                results = processor.process_image_batch(images_data)

                return jsonify({"status": "success", "results": results})
            except Exception as e:
                return jsonify({"status": "error", "message": str(e)}), 500

        @self.app.route("/batch/backend/create_job", methods=["POST"])
        def batch_create_job():
            """Create a new batch processing job"""
            try:
                job_id = batch_backend.create_job()
                return jsonify({"status": "success", "job_id": job_id})
            except Exception as e:
                return jsonify({"status": "error", "message": str(e)}), 500

        @self.app.route("/batch/backend/process", methods=["POST"])
        def batch_backend_process():
            """Process images on backend (for high-resolution images)"""
            try:
                print("\n[BACKEND] ======== BATCH PROCESS REQUEST RECEIVED ========")
                data = request.json
                job_id = data.get("job_id")
                images_data = data.get("images", [])
                classification = data.get("classification", {})

                print(f"[BACKEND] Job ID: {job_id}")
                print(f"[BACKEND] Number of images: {len(images_data)}")

                if not job_id:
                    return jsonify({"status": "error", "message": "job_id is required"}), 400

                # Debug: Log classification structure
                print("\n[BACKEND] Received classification:")
                print(f"  - Keys: {list(classification.keys())}")
                if "phases" in classification:
                    phases = classification["phases"]
                    print(f"  - Number of phases: {len(phases)}")
                    for phase_id, phase_data in phases.items():
                        print(f"  - Phase {phase_id}: {phase_data.get('name', 'unnamed')}")
                        if "labRanges" in phase_data and phase_data["labRanges"]:
                            print(f"    Has LAB ranges: YES")
                        else:
                            print(f"    Has LAB ranges: NO")
                        if "bcZone" in phase_data and phase_data["bcZone"]:
                            print(f"    Has B/C zone: YES ({len(phase_data['bcZone'])} vertices)")
                        else:
                            print(f"    Has B/C zone: NO")

                print(f"\n[BACKEND] Starting batch processing...")
                result = batch_backend.process_batch(job_id, images_data, classification)
                print(f"[BACKEND] Batch processing complete!")
                print(f"[BACKEND] ======== REQUEST COMPLETE ========\n")

                return jsonify(result)
            except Exception as e:
                import traceback

                traceback.print_exc()
                return jsonify({"status": "error", "message": str(e)}), 500

        @self.app.route("/batch/backend/status/<job_id>", methods=["GET"])
        def batch_get_status(job_id):
            """Get status of a batch processing job"""
            try:
                status = batch_backend.get_job_status(job_id)
                return jsonify(status)
            except Exception as e:
                return jsonify({"status": "error", "message": str(e)}), 500

        @self.app.route("/batch/backend/export/<job_id>", methods=["GET"])
        def batch_export(job_id):
            """Export batch results as ZIP file"""
            try:
                # Get classification from query params (JSON string)
                classification_json = request.args.get("classification", "{}")
                import json

                classification = json.loads(classification_json)

                zip_data = batch_backend.create_export_zip(job_id, classification)

                return send_file(
                    BytesIO(zip_data),
                    mimetype="application/zip",
                    as_attachment=True,
                    download_name=f"batch_results_{job_id[:8]}.zip",
                )
            except Exception as e:
                import traceback

                traceback.print_exc()
                return jsonify({"status": "error", "message": str(e)}), 500

        @self.app.route("/batch/calculate_distribution", methods=["POST"])
        def batch_calculate_distribution():
            """Calculate spatial distribution of phases across batch"""
            try:
                data = request.json
                metadata = data.get("metadata", [])
                fractions = data.get("fractions", [])
                classification_config = data.get("classification", {})

                from .batch_processor import BatchProcessor

                processor = BatchProcessor(classification_config)
                distribution = processor.calculate_spatial_distribution(metadata, fractions)

                return jsonify({"status": "success", "distribution": distribution})
            except Exception as e:
                return jsonify({"status": "error", "message": str(e)}), 500

        @self.app.route("/set_image", methods=["POST"])
        def set_image():
            """Set the current working image from base64 data (for grid tiles or uploaded images)"""
            try:
                data = request.json
                image_data = data.get("image")

                if not image_data:
                    return jsonify({"status": "error", "message": "No image data provided"}), 400

                print(f"[SET_IMAGE] Receiving image data...")

                # Remove data URL prefix if present
                if image_data.startswith("data:image"):
                    image_data = image_data.split(",", 1)[1]

                # Decode base64 image
                img_bytes = base64.b64decode(image_data)
                pil_image = Image.open(BytesIO(img_bytes))

                # Convert to OpenCV format (BGR)
                if pil_image.mode == "RGBA":
                    pil_image = pil_image.convert("RGB")
                elif pil_image.mode != "RGB":
                    pil_image = pil_image.convert("RGB")

                # Convert PIL to OpenCV (numpy array in BGR)
                rgb_array = np.array(pil_image)
                bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)

                # Update the backend's original image
                self.original_image = bgr_array

                print(f"[SET_IMAGE] Image updated: {bgr_array.shape}")

                return jsonify({"status": "success", "width": bgr_array.shape[1], "height": bgr_array.shape[0]})

            except Exception as e:
                print(f"[SET_IMAGE] Error: {e}")
                import traceback

                traceback.print_exc()
                return jsonify({"status": "error", "message": str(e)}), 500

        @self.app.route("/convert_large_image", methods=["POST"])
        def convert_large_image():
            """Convert uploaded image (including TIFF) to PNG for browser display"""
            try:
                # Get the uploaded file from request
                if "file" not in request.files:
                    return jsonify({"status": "error", "message": "No file uploaded"}), 400

                file = request.files["file"]
                if file.filename == "":
                    return jsonify({"status": "error", "message": "Empty filename"}), 400

                print(f"[CONVERT] Received file: {file.filename}")

                # Read the image using PIL (supports TIFF and many other formats)
                try:
                    pil_image = Image.open(file.stream)
                    print(f"[CONVERT] Image opened: {pil_image.size}, mode: {pil_image.mode}")

                    # Convert to RGB if necessary (TIFF can be in various modes)
                    if pil_image.mode not in ("RGB", "RGBA"):
                        pil_image = pil_image.convert("RGB")
                        print(f"[CONVERT] Converted to RGB mode")

                    # Convert to PNG and encode as base64
                    buffer = BytesIO()
                    pil_image.save(buffer, format="PNG")
                    img_base64 = base64.b64encode(buffer.getvalue()).decode()

                    print(f"[CONVERT] Successfully converted to PNG, size: {len(img_base64)} bytes (base64)")

                    return jsonify(
                        {
                            "status": "success",
                            "image": f"data:image/png;base64,{img_base64}",
                            "width": pil_image.width,
                            "height": pil_image.height,
                        }
                    )

                except Exception as img_error:
                    print(f"[CONVERT] Error opening/converting image: {img_error}")
                    import traceback

                    traceback.print_exc()
                    return jsonify({"status": "error", "message": f"Failed to process image: {str(img_error)}"}), 400

            except Exception as e:
                print(f"[CONVERT] Unexpected error: {e}")
                import traceback

                traceback.print_exc()
                return jsonify({"status": "error", "message": str(e)}), 500

    def run(self):
        """Start the web server"""
        print(f"Starting web interface at http://localhost:{self.port}")
        print(f"Image: {self.image_path}")
        print(f"Output directory: {self.output_dir}")
        print("Classification algorithm: LAB color space thresholding with B/C zoning")
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
