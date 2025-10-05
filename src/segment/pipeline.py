"""
Image loading and preprocessing for web interface
"""

import cv2


def preprocess_image(image_path, denoise=False):
    """
    Load and preprocess image

    Args:
        image_path: Path to input image
        denoise: Apply bilateral filter for noise reduction (not used by web interface)

    Returns:
        Tuple of (original_bgr, grayscale)
    """
    # Load image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load image from {image_path}")

    # Convert to grayscale (required for compatibility)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    return img, gray
