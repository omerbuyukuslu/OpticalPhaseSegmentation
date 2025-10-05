"""
Batch processing module for applying phase classification to multiple images
"""

import numpy as np
from typing import List, Dict
import cv2
from PIL import Image
from io import BytesIO
import base64


class BatchProcessor:
    def __init__(self, classification_config: Dict):
        """
        Initialize batch processor with classification configuration

        Args:
            classification_config: Dictionary containing phase definitions and LAB ranges
        """
        self.phases = classification_config.get("phases", {})
        self.unit = classification_config.get("unit", "pixels")
        self.scale = classification_config.get("scale", 1.0)  # pixels per unit

    def process_image_batch(self, images_data: List[Dict]) -> Dict:
        """
        Process multiple images with their metadata

        Args:
            images_data: List of dicts with keys: 'image', 'x1', 'x2', 'y1', 'y2', 'name'

        Returns:
            Dictionary containing processed results
        """
        results = {"images": [], "classifications": [], "metadata": [], "areal_fractions": []}

        # Sort images by position (x1, y1)
        sorted_images = sorted(images_data, key=lambda x: (x["x1"], x["y1"]))

        for img_data in sorted_images:
            # Process individual image
            result = self.process_single_image(img_data)
            results["images"].append(result["original"])
            results["classifications"].append(result["classified"])
            results["metadata"].append(result["metadata"])
            results["areal_fractions"].append(result["areal_fraction"])

        return results

    def process_single_image(self, img_data: Dict) -> Dict:
        """
        Process a single image with classification

        Args:
            img_data: Dictionary with image data and metadata

        Returns:
            Dictionary with processed results
        """
        # Decode image (assumed to be base64 encoded)
        image = self._decode_image(img_data["image"])

        # Apply classification (this will be done in JavaScript, but we prepare metadata)
        metadata = {
            "name": img_data.get("name", "Unknown"),
            "x1": float(img_data["x1"]),
            "x2": float(img_data["x2"]),
            "y1": float(img_data["y1"]),
            "y2": float(img_data["y2"]),
            "width": image.shape[1],
            "height": image.shape[0],
            "x_center": (float(img_data["x1"]) + float(img_data["x2"])) / 2,
            "y_center": (float(img_data["y1"]) + float(img_data["y2"])) / 2,
        }

        # Encode image back to base64
        encoded_image = self._encode_image(image)

        return {
            "original": encoded_image,
            "classified": None,  # Will be generated in frontend
            "metadata": metadata,
            "areal_fraction": None,  # Will be calculated in frontend
        }

    def _decode_image(self, img_data: str) -> np.ndarray:
        """Decode base64 image to numpy array"""
        if img_data.startswith("data:image"):
            img_data = img_data.split(",")[1]

        img_bytes = base64.b64decode(img_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img

    def _encode_image(self, img: np.ndarray) -> str:
        """Encode numpy array to base64"""
        # Convert BGR to RGB
        rgb_image = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb_image)

        buffer = BytesIO()
        pil_image.save(buffer, format="PNG")
        img_base64 = base64.b64encode(buffer.getvalue()).decode()

        return f"data:image/png;base64,{img_base64}"

    def calculate_spatial_distribution(self, images_metadata: List[Dict], areal_fractions: List[Dict]) -> Dict:
        """
        Calculate phase distribution across spatial positions

        Args:
            images_metadata: List of image metadata dicts
            areal_fractions: List of areal fraction data per image

        Returns:
            Dictionary with spatial distribution data
        """
        # Combine all data
        spatial_data = []

        for metadata, fractions in zip(images_metadata, areal_fractions):
            spatial_data.append(
                {
                    "x_center": metadata["x_center"],
                    "y_center": metadata["y_center"],
                    "x1": metadata["x1"],
                    "x2": metadata["x2"],
                    "y1": metadata["y1"],
                    "y2": metadata["y2"],
                    "fractions": fractions,
                }
            )

        return {"spatial_data": spatial_data, "unit": self.unit, "scale": self.scale}
