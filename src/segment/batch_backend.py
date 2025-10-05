"""
Backend batch processing for high-resolution images
Handles server-side classification with progress tracking
"""

import io
import base64
import zipfile
import csv
import json
import tempfile
import uuid
from datetime import datetime
from typing import Dict, List, Tuple
import numpy as np
from PIL import Image
import cv2


class BatchBackend:
    """Server-side batch processing for high-resolution images"""

    def __init__(self):
        self.active_jobs = {}  # job_id -> job_data
        self.temp_dir = tempfile.gettempdir()

    def rgb_to_lab(self, r: int, g: int, b: int) -> Tuple[float, float, float]:
        """
        Convert RGB to LAB color space

        Args:
            r, g, b: RGB values (0-255)

        Returns:
            Tuple of (L, a, b) values
        """
        # Normalize RGB to 0-1
        r_norm = r / 255.0
        g_norm = g / 255.0
        b_norm = b / 255.0

        # Apply gamma correction
        def gamma_correct(channel):
            if channel > 0.04045:
                return ((channel + 0.055) / 1.055) ** 2.4
            else:
                return channel / 12.92

        r_linear = gamma_correct(r_norm)
        g_linear = gamma_correct(g_norm)
        b_linear = gamma_correct(b_norm)

        # RGB to XYZ (D65 illuminant)
        x = r_linear * 0.4124564 + g_linear * 0.3575761 + b_linear * 0.1804375
        y = r_linear * 0.2126729 + g_linear * 0.7151522 + b_linear * 0.0721750
        z = r_linear * 0.0193339 + g_linear * 0.1191920 + b_linear * 0.9503041

        # Normalize for D65 white point
        x = x / 0.95047
        y = y / 1.00000
        z = z / 1.08883

        # XYZ to LAB
        def f(t):
            if t > 0.008856:
                return t ** (1 / 3)
            else:
                return 7.787 * t + 16 / 116

        fx = f(x)
        fy = f(y)
        fz = f(z)

        L = 116 * fy - 16
        a = 500 * (fx - fy)
        b_val = 200 * (fy - fz)

        return L, a, b_val

    def classify_image(self, image: np.ndarray, classification: Dict) -> np.ndarray:
        """
        Classify image using LAB color space ranges or B/C zones

        Args:
            image: RGB image as numpy array (H, W, 3)
            classification: Classification config with phases and LAB ranges or B/C zones

        Returns:
            Classified image as numpy array (H, W) with phase IDs
        """
        print(f"[CLASSIFY] Image shape: {image.shape}, dtype: {image.dtype}")
        height, width = image.shape[:2]
        classified = np.zeros((height, width), dtype=np.uint8)

        phases = classification.get("phases", {})
        print(f"[CLASSIFY] Processing {height}x{width} image ({height * width:,} pixels) with {len(phases)} phases")

        # Determine classification method
        use_lab = any(p.get("labRanges") for p in phases.values())
        use_bc = any(p.get("bcZone") and len(p.get("bcZone", [])) > 0 for p in phases.values())

        if use_lab:
            print("[CLASSIFY] Using LAB color space classification")
        elif use_bc:
            print("[CLASSIFY] Using Brightness/Contrast zone classification")
        else:
            raise ValueError("No classification method available (neither LAB nor B/C)")

        # OPTIMIZED: Vectorized B/C calculation for entire image
        if use_bc:
            print("[CLASSIFY] Computing B/C values for all pixels (vectorized)...")
            # Calculate brightness and contrast for entire image at once
            brightness_img = np.mean(image, axis=2, dtype=np.float32)  # (H, W)
            contrast_img = np.ptp(image, axis=2).astype(np.float32)  # (H, W)
            print(
                f"[CLASSIFY] B/C computed. Brightness range: [{brightness_img.min():.1f}, {brightness_img.max():.1f}], Contrast range: [{contrast_img.min():.1f}, {contrast_img.max():.1f}]"
            )

        # Process each phase
        for phase_idx, (phase_id, phase_data) in enumerate(phases.items(), 1):
            print(
                f"\n[CLASSIFY] Processing Phase {phase_idx}/{len(phases)}: {phase_data.get('name', 'Unnamed')} (ID={phase_id})"
            )

            # Try LAB classification first
            lab_ranges = phase_data.get("labRanges")
            if lab_ranges and isinstance(lab_ranges, dict):
                print(f"[CLASSIFY]   Using LAB ranges...")
                # LAB processing (slower, pixel-by-pixel)
                for y in range(height):
                    if y % 100 == 0:
                        print(f"[CLASSIFY]     Row {y}/{height} ({100 * y / height:.1f}%)")
                    for x in range(width):
                        if classified[y, x] != 0:  # Already classified
                            continue

                        r, g, b = image[y, x]
                        L, a, b_val = self.rgb_to_lab(int(r), int(g), int(b))

                        L_range = lab_ranges.get("L", {})
                        a_range = lab_ranges.get("a", {})
                        b_range = lab_ranges.get("b", {})

                        if (
                            L_range.get("min", -100) <= L <= L_range.get("max", 100)
                            and a_range.get("min", -128) <= a <= a_range.get("max", 128)
                            and b_range.get("min", -128) <= b_val <= b_range.get("max", 128)
                        ):
                            classified[y, x] = int(phase_id)

            # Try B/C zone classification
            bc_zone = phase_data.get("bcZone")
            if bc_zone and isinstance(bc_zone, list) and len(bc_zone) > 0:
                print(f"[CLASSIFY]   Using B/C zone with {len(bc_zone)} vertices...")
                # OPTIMIZED: Vectorized point-in-polygon check
                mask = self.vectorized_point_in_polygon(brightness_img, contrast_img, bc_zone)
                # Only classify pixels that aren't already classified
                mask = mask & (classified == 0)
                classified[mask] = int(phase_id)
                pixel_count = np.sum(mask)
                print(f"[CLASSIFY]   Classified {pixel_count:,} pixels ({100 * pixel_count / (height * width):.2f}%)")

        total_classified = np.sum(classified > 0)
        print(
            f"\n[CLASSIFY] Classification complete! {total_classified:,}/{height * width:,} pixels classified ({100 * total_classified / (height * width):.1f}%)"
        )
        return classified

    def point_in_polygon(self, x: float, y: float, polygon: list) -> bool:
        """
        Check if point (x, y) is inside polygon using ray casting algorithm

        Args:
            x: brightness value
            y: contrast value
            polygon: List of vertices with 'brightness' and 'contrast' keys

        Returns:
            True if point is inside polygon
        """
        n = len(polygon)
        inside = False

        p1_x, p1_y = polygon[0]["brightness"], polygon[0]["contrast"]
        for i in range(1, n + 1):
            p2_x, p2_y = polygon[i % n]["brightness"], polygon[i % n]["contrast"]
            if y > min(p1_y, p2_y):
                if y <= max(p1_y, p2_y):
                    if x <= max(p1_x, p2_x):
                        if p1_y != p2_y:
                            x_inters = (y - p1_y) * (p2_x - p1_x) / (p2_y - p1_y) + p1_x
                        if p1_x == p2_x or x <= x_inters:
                            inside = not inside
            p1_x, p1_y = p2_x, p2_y

        return inside

    def vectorized_point_in_polygon(
        self, brightness_img: np.ndarray, contrast_img: np.ndarray, polygon: list
    ) -> np.ndarray:
        """
        Vectorized point-in-polygon check for entire image using ray casting algorithm
        Much faster than checking each pixel individually

        Args:
            brightness_img: 2D array of brightness values (H, W)
            contrast_img: 2D array of contrast values (H, W)
            polygon: List of vertices with 'brightness' and 'contrast' keys

        Returns:
            Boolean mask (H, W) where True = inside polygon
        """
        n = len(polygon)
        # Start with all False
        inside = np.zeros(brightness_img.shape, dtype=bool)

        # Extract polygon coordinates
        p_x = np.array([v["brightness"] for v in polygon])
        p_y = np.array([v["contrast"] for v in polygon])

        # Ray casting for each edge
        for i in range(n):
            p1_x, p1_y = p_x[i], p_y[i]
            p2_x, p2_y = p_x[(i + 1) % n], p_y[(i + 1) % n]

            # Check which pixels have y coordinates in range for this edge
            y_in_range = (contrast_img > min(p1_y, p2_y)) & (contrast_img <= max(p1_y, p2_y))

            if p1_y != p2_y:
                # Calculate x intersection for pixels in y range
                x_inters = (contrast_img - p1_y) * (p2_x - p1_x) / (p2_y - p1_y) + p1_x
                # Check if pixel x is to the left of intersection
                crosses = y_in_range & (brightness_img <= x_inters)
            else:
                # Horizontal edge
                crosses = y_in_range & (brightness_img <= max(p1_x, p2_x))

            # Toggle inside flag for pixels that cross this edge
            inside ^= crosses

        return inside

    def calculate_areal_fractions(self, classified: np.ndarray, classification: Dict) -> Dict[str, float]:
        """
        Calculate areal fraction for each phase

        Args:
            classified: Classified image array (H, W)
            classification: Classification config

        Returns:
            Dictionary of phase_id -> percentage
        """
        total_pixels = classified.size
        fractions = {}

        phases = classification.get("phases", {})

        for phase_id in phases.keys():
            count = np.sum(classified == int(phase_id))
            fractions[phase_id] = (count / total_pixels) * 100.0

        # Add unclassified
        unclassified_count = np.sum(classified == 0)
        fractions["0"] = (unclassified_count / total_pixels) * 100.0

        return fractions

    def calculate_x_distribution(
        self, classified: np.ndarray, classification: Dict, x0: float, x1: float, width: int, num_bins: int = 50
    ) -> Dict:
        """
        Calculate phase distribution across X-axis (for line plot)
        Divides image into vertical slices and calculates phase fraction in each slice

        Args:
            classified: Classified image array (H, W)
            classification: Classification config
            x0: Physical X coordinate of left edge
            x1: Physical X coordinate of right edge
            width: Image width in pixels
            num_bins: Number of vertical slices

        Returns:
            Dictionary with 'xPositions' and phase fractions for each position
        """
        height = classified.shape[0]
        actual_bins = min(num_bins, width)
        bin_width = width / actual_bins

        xPositions = []
        phaseFractions = {phase_id: [] for phase_id in classification.get("phases", {}).keys()}
        phaseFractions["0"] = []  # Unclassified

        for bin_idx in range(actual_bins):
            x_start = int(bin_idx * bin_width)
            x_end = int((bin_idx + 1) * bin_width)

            # Calculate physical X position (center of bin)
            pixel_x = (x_start + x_end) / 2
            physical_x = x0 + (pixel_x / width) * (x1 - x0)
            xPositions.append(physical_x)

            # Extract this vertical slice
            slice_data = classified[:, x_start:x_end]
            total_pixels = slice_data.size

            if total_pixels == 0:
                # Empty slice
                for phase_id in phaseFractions.keys():
                    phaseFractions[phase_id].append(0.0)
                continue

            # Count pixels for each phase in this slice
            for phase_id in classification.get("phases", {}).keys():
                count = np.sum(slice_data == int(phase_id))
                fraction = (count / total_pixels) * 100.0
                phaseFractions[phase_id].append(fraction)

            # Unclassified
            unclassified_count = np.sum(slice_data == 0)
            phaseFractions["0"].append((unclassified_count / total_pixels) * 100.0)

        return {"xPositions": xPositions, "phaseFractions": phaseFractions}

    def create_preview(self, image: np.ndarray, max_size: int = 800) -> str:
        """
        Create downsampled preview for browser display

        Args:
            image: Original image
            max_size: Maximum dimension for preview

        Returns:
            Base64 encoded PNG
        """
        height, width = image.shape[:2]

        # Calculate new dimensions maintaining aspect ratio
        if max(height, width) > max_size:
            if height > width:
                new_height = max_size
                new_width = int(width * (max_size / height))
            else:
                new_width = max_size
                new_height = int(height * (max_size / width))

            # Resize using high-quality method
            preview = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
        else:
            preview = image

        # Convert to PIL and encode
        pil_image = Image.fromarray(cv2.cvtColor(preview, cv2.COLOR_BGR2RGB))
        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG", optimize=True)

        return base64.b64encode(buffer.getvalue()).decode()

    def create_overlay_image(
        self, original: np.ndarray, classified: np.ndarray, classification: Dict, alpha: float = 0.6
    ) -> np.ndarray:
        """
        Create overlay of classification on original image

        Args:
            original: Original RGB image
            classified: Classified image (H, W)
            classification: Classification config with colors
            alpha: Overlay transparency

        Returns:
            Overlay image as RGB numpy array
        """
        overlay = original.copy()
        phases = classification.get("phases", {})

        for phase_id, phase_data in phases.items():
            # Get phase color (hex format)
            color_hex = phase_data.get("color", "#888888")
            # Convert hex to RGB
            color_hex = color_hex.lstrip("#")
            r = int(color_hex[0:2], 16)
            g = int(color_hex[2:4], 16)
            b = int(color_hex[4:6], 16)

            # Create mask for this phase
            mask = classified == int(phase_id)

            # Apply color with alpha blending
            overlay[mask] = (overlay[mask] * (1 - alpha) + np.array([b, g, r]) * alpha).astype(np.uint8)

        return overlay

    def process_single_image(self, image_data: Dict, classification: Dict, job_id: str, index: int, total: int) -> Dict:
        """
        Process a single image

        Args:
            image_data: Dict with 'file' (base64), 'name', 'x0', 'y0', 'x1', 'y1'
            classification: Classification config
            job_id: Job identifier for progress tracking
            index: Current image index
            total: Total number of images

        Returns:
            Result dictionary with metadata and analysis
        """
        print(f"\n[PROCESS] Starting image {index + 1}/{total}: {image_data['name']}")

        # Validate classification
        if not classification or "phases" not in classification:
            raise ValueError("Invalid classification: missing 'phases'")

        phases = classification.get("phases", {})
        if not phases:
            raise ValueError("Classification has no phases defined")

        # Validate that phases have LAB ranges or B/C zones
        valid_phases = 0
        lab_phases = 0
        bc_phases = 0
        for phase_id, phase_data in phases.items():
            has_classification = False
            if phase_data.get("labRanges") and isinstance(phase_data.get("labRanges"), dict):
                lab_phases += 1
                has_classification = True
            if (
                phase_data.get("bcZone")
                and isinstance(phase_data.get("bcZone"), list)
                and len(phase_data.get("bcZone")) > 0
            ):
                bc_phases += 1
                has_classification = True
            if has_classification:
                valid_phases += 1

        if valid_phases == 0:
            raise ValueError(
                "No phases have classification data. Each phase must have either LAB ranges or B/C zone defined."
            )

        print(
            f"[PROCESS] Classification has {len(phases)} phases: {lab_phases} with LAB ranges, {bc_phases} with B/C zones"
        )

        # Update progress
        self.active_jobs[job_id]["progress"] = {
            "current": index + 1,
            "total": total,
            "status": f"Processing {image_data['name']}...",
        }

        # Decode base64 image
        print("[PROCESS] Decoding base64 image...")
        image_b64 = image_data["file"].split(",")[1] if "," in image_data["file"] else image_data["file"]
        image_bytes = base64.b64decode(image_b64)
        print(f"[PROCESS] Decoded {len(image_bytes)} bytes")

        # Load image with PIL then convert to OpenCV format
        print("[PROCESS] Loading image with PIL...")
        pil_image = Image.open(io.BytesIO(image_bytes))
        image_rgb = np.array(pil_image)
        print(f"[PROCESS] Loaded image: {image_rgb.shape}, dtype: {image_rgb.dtype}")

        # Ensure image is RGB
        if len(image_rgb.shape) == 2:
            # Grayscale - convert to RGB
            print("[PROCESS] Converting grayscale to RGB...")
            image_rgb = cv2.cvtColor(image_rgb, cv2.COLOR_GRAY2RGB)
        elif image_rgb.shape[2] == 4:
            # RGBA - convert to RGB
            print("[PROCESS] Converting RGBA to RGB...")
            image_rgb = cv2.cvtColor(image_rgb, cv2.COLOR_RGBA2RGB)

        # Convert RGB to BGR for OpenCV
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        # Classify at full resolution
        print("[PROCESS] Starting classification...")
        classified = self.classify_image(image_rgb, classification)

        # Calculate areal fractions
        print("[PROCESS] Calculating areal fractions...")
        fractions = self.calculate_areal_fractions(classified, classification)

        # Create overlay at full resolution
        print("[PROCESS] Creating overlay...")
        overlay_bgr = self.create_overlay_image(image_bgr, classified, classification)

        # Create preview versions for browser display
        print("[PROCESS] Generating previews...")
        original_preview = self.create_preview(image_bgr, max_size=600)
        overlay_preview = self.create_preview(overlay_bgr, max_size=600)

        # Calculate metadata
        height, width = image_rgb.shape[:2]
        x0, y0 = image_data["x0"], image_data["y0"]
        x1, y1 = image_data["x1"], image_data["y1"]

        physical_width = abs(x1 - x0)
        physical_height = abs(y1 - y0)
        x_scale = width / physical_width if physical_width > 0 else 1
        y_scale = height / physical_height if physical_height > 0 else 1

        # Calculate X-axis distribution (for line plot across image)
        print("[PROCESS] Calculating X-axis distribution...")
        x_distribution = self.calculate_x_distribution(classified, classification, x0, x1, width)

        print(f"[PROCESS] Complete! Fractions: {fractions}")

        result = {
            "id": image_data.get("id", str(uuid.uuid4())),
            "name": image_data["name"],
            "metadata": {
                "name": image_data["name"],
                "width": width,
                "height": height,
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
                "x_center": (x0 + x1) / 2,
                "y_center": (y0 + y1) / 2,
                "physicalWidth": physical_width,
                "physicalHeight": physical_height,
                "xScale": x_scale,
                "yScale": y_scale,
            },
            "arealFractions": fractions,
            "xDistribution": x_distribution,  # For plotting distribution across image
            "previews": {
                "original": f"data:image/png;base64,{original_preview}",
                "overlay": f"data:image/png;base64,{overlay_preview}",
            },
            # Store full resolution images for export
            "_full_original": image_bgr,
            "_full_overlay": overlay_bgr,
            "_full_classified": classified,
        }

        return result

    def create_job(self) -> str:
        """Create a new batch processing job"""
        job_id = str(uuid.uuid4())
        self.active_jobs[job_id] = {
            "id": job_id,
            "status": "pending",
            "progress": {"current": 0, "total": 0, "status": "Initializing..."},
            "results": [],
            "created_at": datetime.now().isoformat(),
        }
        return job_id

    def get_job_status(self, job_id: str) -> Dict:
        """Get status of a batch processing job"""
        return self.active_jobs.get(job_id, {"status": "not_found"})

    def process_batch(self, job_id: str, images_data: List[Dict], classification: Dict) -> Dict:
        """
        Process batch of images

        Args:
            job_id: Job identifier
            images_data: List of image data dictionaries
            classification: Classification configuration

        Returns:
            Job results
        """
        try:
            # Ensure job exists (in case of server restart)
            if job_id not in self.active_jobs:
                print(f"[PROCESS] Job {job_id} not found in active_jobs, creating it...")
                self.active_jobs[job_id] = {
                    "id": job_id,
                    "status": "pending",
                    "progress": {"current": 0, "total": 0, "status": "Initializing..."},
                    "results": [],
                    "created_at": datetime.now().isoformat(),
                }

            self.active_jobs[job_id]["status"] = "processing"
            self.active_jobs[job_id]["progress"]["total"] = len(images_data)

            results = []
            results_for_client = []  # JSON-serializable results for client
            for i, image_data in enumerate(images_data):
                result = self.process_single_image(image_data, classification, job_id, i, len(images_data))
                results.append(result)  # Store full results (with arrays) server-side

                # Create client-safe version without NumPy arrays
                client_result = {k: v for k, v in result.items() if not k.startswith("_")}
                results_for_client.append(client_result)

            self.active_jobs[job_id]["status"] = "completed"
            self.active_jobs[job_id]["results"] = results  # Store full results with arrays
            self.active_jobs[job_id]["progress"]["status"] = "Complete!"

            return {"status": "success", "job_id": job_id, "results": results_for_client}

        except Exception as e:
            # Ensure job exists before updating it
            if job_id in self.active_jobs:
                self.active_jobs[job_id]["status"] = "failed"
                self.active_jobs[job_id]["error"] = str(e)
            print(f"[PROCESS] ERROR: {e}")
            import traceback

            traceback.print_exc()
            raise

    def create_export_zip(self, job_id: str, classification: Dict) -> bytes:
        """
        Create ZIP file with all results

        Args:
            job_id: Job identifier
            classification: Classification config (for metadata)

        Returns:
            ZIP file as bytes
        """
        job = self.active_jobs.get(job_id)
        if not job or job["status"] != "completed":
            raise ValueError("Job not found or not completed")

        results = job["results"]

        # Create ZIP in memory
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # Add CSV with areal fractions
            csv_data = self._create_csv_data(results, classification)
            zip_file.writestr("batch_results.csv", csv_data)

            # Add original images
            for result in results:
                img_name = result["name"]
                img_bgr = result["_full_original"]

                # Convert to PNG
                _, buffer = cv2.imencode(".png", img_bgr)
                zip_file.writestr(f"originals/{img_name}", buffer.tobytes())

            # Add overlay images
            for result in results:
                img_name = result["name"]
                img_bgr = result["_full_overlay"]

                # Convert to PNG
                _, buffer = cv2.imencode(".png", img_bgr)
                zip_file.writestr(f"classified/{img_name}", buffer.tobytes())

            # Add metadata JSON
            metadata = {
                "job_id": job_id,
                "processed_at": datetime.now().isoformat(),
                "num_images": len(results),
                "classification": classification,
                "results": [
                    {"name": r["name"], "metadata": r["metadata"], "arealFractions": r["arealFractions"]}
                    for r in results
                ],
            }
            zip_file.writestr("metadata.json", json.dumps(metadata, indent=2))

        return zip_buffer.getvalue()

    def _create_csv_data(self, results: List[Dict], classification: Dict) -> str:
        """Create CSV data from results"""
        output = io.StringIO()

        # Get phase names
        phases = classification.get("phases", {})
        phase_ids = sorted(phases.keys(), key=lambda x: int(x))

        # Write header
        writer = csv.writer(output)
        header = [
            "Image",
            "X_Center",
            "Y_Center",
            "X0",
            "Y0",
            "X1",
            "Y1",
            "Width_px",
            "Height_px",
            "Physical_Width",
            "Physical_Height",
        ]

        for phase_id in phase_ids:
            phase_name = phases[phase_id]["name"]
            header.append(f"{phase_name}_Fraction_%")

        header.append("Unclassified_%")
        writer.writerow(header)

        # Sort results by X center
        sorted_results = sorted(results, key=lambda r: r["metadata"]["x_center"])

        # Write data rows
        for result in sorted_results:
            meta = result["metadata"]
            fractions = result["arealFractions"]

            row = [
                meta["name"],
                f"{meta['x_center']:.4f}",
                f"{meta['y_center']:.4f}",
                f"{meta['x0']:.4f}",
                f"{meta['y0']:.4f}",
                f"{meta['x1']:.4f}",
                f"{meta['y1']:.4f}",
                meta["width"],
                meta["height"],
                f"{meta['physicalWidth']:.4f}",
                f"{meta['physicalHeight']:.4f}",
            ]

            for phase_id in phase_ids:
                row.append(f"{fractions.get(phase_id, 0.0):.2f}")

            row.append(f"{fractions.get('0', 0.0):.2f}")
            writer.writerow(row)

        return output.getvalue()

    def cleanup_job(self, job_id: str):
        """Remove job data to free memory"""
        if job_id in self.active_jobs:
            del self.active_jobs[job_id]


# Global instance
batch_backend = BatchBackend()
