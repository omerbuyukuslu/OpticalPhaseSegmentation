# Optical Phase Segmentation Tool

An interactive **web-based application** for optical phase segmentation in confocal microscopy images.  
The tool uses **LAB color space classification** with optional **brightness/contrast (B/C) zoning** to enable precise and intuitive phase identification.

**NEW:** Includes **batch processing** for high-resolution images (40MB+) with backend processing, spatial distribution analysis, and automated export.

---

## Features

**Phase Segmentation Tab**
- Interactive phase definition with LAB color space thresholding
- Brightness/Contrast (B/C) zone drawing for refined classification
- Real-time histogram and ternary plot visualization
- Save/Load classification settings
- Grid-based navigation for large images (40MB+ TIFF files)

**Batch Processing Tab**
- Process multiple high-resolution images (tested with 40MB+ files)
- Stacked image visualization with original/classified toggle
- Export full results as ZIP (CSV, full-res images, overlays, metadata)

---

## Overview

This tool allows you to:
- Define and name material phases with custom colors
- Sample representative pixels interactively
- Adjust thresholds on LAB histograms (L*, a*, b*)
- Optionally apply Brightness/Contrast zones to refine boundaries
- Classify single or multiple images
- Analyze phase distribution across large images
- Export classification settings and results

---

## Quick Start

### Installation

Install dependencies using [uv](https://github.com/astral-sh/uv):

```bash
uv sync
```

### Run the Application

```bash
python start_web.py
```

Then open your browser at:

```
http://localhost:8000
```

By default, the server loads the sample image located at:
```
src/data/example.png
```

---

## Batch Processing Workflow

### 1. **Load Classification**
   - Option A: Click "Load Previous Classification" to import from Phase Segmentation tab
   - Option B: Click "Upload File" to load a saved classification XML

### 2. **Upload Images**
   - Upload one or more high-resolution images (supports 40MB+ files)
   - Each image gets a unique ID (IMG-1, IMG-2, etc.)

### 3. **Set Spatial Coordinates**
   - For each image, define physical coordinates:
     - **X₀, Y₀**: Top-left corner position (e.g., 0, 0 μm)
     - **X₁, Y₁**: Bottom-right corner position (e.g., 1500, 1000 μm)
   - Coordinates are used for spatial distribution analysis
   - Visual 2D plot shows relative image positions

### 4. **Process Batch**
   - Click "Process Batch"
   - Backend processes images using vectorized algorithms
   - Progress shown in real-time
   - Typical processing time: 10-15 seconds for 40MB image

### 5. **View Results**

**Stacked Images:**
- View all processed images in a vertical stack
- Toggle between "Show Original" and "Show Classified"
- Click any image to view full-size in modal popup

**Phase Distribution Plot:**
- **Single Image:** Shows line plot of phase distribution across X-axis
  - Image is sliced into 50 vertical bins
  - Each point shows phase fraction at that X position
  - Reveals spatial variation and gradients
- **Multiple Images:** Shows phase fraction at each image's center position

### 6. **Export Results**
   - Click "Export Results"
   - Downloads ZIP containing:
     - `batch_results.csv` - Areal fractions and metadata
     - `originals/` - Full-resolution original images
     - `classified/` - Full-resolution classified overlays
     - `metadata.json` - Processing parameters

---

## Phase Segmentation Workflow

1. **Create Phases**
   - Enter a phase name (e.g., “Matrix”, “Precipitate”)
   - Assign a display color
   - Click **Add Phase**

2. **Sample Pixels**
   - Select a phase from the list
   - Click representative pixels in the image
   - RGB values are automatically converted to LAB color space
   - LAB histograms and RGB ternary plots update in real time

3. **Set LAB Ranges**
   - Drag on each LAB histogram (L*, a*, b*) to define min/max thresholds
   - Ranges are shown interactively on the plots

4. **(Optional) Add Brightness/Contrast Zones**
   - Click **Draw B/C Zone** to create a polygon or circle
   - This adds an extra filtering condition to exclude ambiguous regions

5. **Classify Image**
   - Click **Classify Image**
   - The algorithm checks each pixel against all phase definitions and assigns it to the first match

6. **Analyze Results**
   - Toggle between original and classified views
   - View areal fraction charts showing phase distributions

7. **Save or Load Classifications**
   - **Save Classification** exports your settings as an XML file
   - **Load Classification** restores previous work

### Large Image Grid Navigation

For images too large to process at once (40MB+ TIFF files), use grid navigation:

1. **Upload Large Image**
   - Click **Upload Large Image** (amber button)
   - Select TIFF or other large image file
   - Automatic TIFF to PNG conversion (10-30 seconds for large files)

2. **Configure Grid**
   - Default: 30 tiles, adjustable 4-100
   - Automatic grid layout (e.g., 30 tiles = 6×5 grid)
   - Interactive navigator canvas

3. **Navigate and Annotate**
   - Click tiles in navigator to load
   - Current tile: green highlight
   - Annotated tiles: blue tint
   - Add markers, zones, classify per tile
   - Data auto-saved when switching tiles

4. **Export Grid Data**
   - Click **Export Grid Data**
   - XML with per-tile annotations
   - Local and global coordinates
   - All markers, zones, metadata

---

## Algorithm

### LAB Color Space Classification

1. **RGB → LAB Conversion**  
   Each pixel is converted to CIE LAB color space (D65 illuminant, sRGB gamma).  
   LAB provides perceptual uniformity — equal distances correspond to equal color differences.

2. **Thresholding**  
   For each phase, the tool checks whether a pixel's L*, a*, and b* values fall within the selected ranges.

3. **Brightness/Contrast Zone Filtering (Optional)**  
   If B/C zones are defined, pixels are additionally checked using:
   - **Brightness** = (R + G + B) / 3
   - **Contrast** = max(R, G, B) - min(R, G, B)
   - Point-in-polygon test using ray casting algorithm

4. **Classification Priority**  
   - For LAB ranges: Checks all channels (L*, a*, b*) are within bounds
   - For B/C zones: Uses vectorized point-in-polygon (100-1000x faster than pixel-by-pixel)
   - Pixel assigned to first matching phase

5. **Batch Processing Optimizations**
   - **Vectorized B/C calculation**: Computes brightness/contrast for entire image at once
   - **NumPy array operations**: Processes millions of pixels in milliseconds
   - **Backend processing**: No browser memory limits for large images
   - **Preview generation**: 600px downsampled images for fast display

---

## Why LAB Color Space?

- **Perceptually Uniform** – Equal color distances match human perception
- **Lighting Robustness** – Separates lightness (L*) from chromaticity (a*, b*)
- **Better for Microscopy** – More stable than RGB under illumination variation
- **Widely Used** – Standard in materials science, textiles, and image analysis

---

## When to Use Brightness/Contrast Zones

- To refine classification near **phase boundaries**
- To exclude **intermediate or ambiguous** pixels
- To constrain classification to specific illumination zones
- Works well in **optical microscopy**, **petrography**, and **metallography**

---

## Output Files

**Classification Settings**
- `classification_*.xml` — Complete phase definitions including LAB ranges, B/C zones, and sample data

**Phase Segmentation Results**
- Segmented overlay (viewed and saved directly from browser)
- Areal fraction statistics (displayed in charts)

**Batch Processing Results** (ZIP export)
- `batch_results.csv` — Image metadata, coordinates, and areal fractions per phase
- `originals/*.png` — Full-resolution original images
- `classified/*.png` — Full-resolution classified overlay images
- `metadata.json` — Processing parameters and classification settings

---

## Project Structure

```
OpticalPhaseSegmentation/
├── src/
│   ├── data/                      # Sample images and classifications
│   ├── segment/
│   │   ├── pipeline.py            # Image loading and preprocessing
│   │   ├── web_interface.py       # Flask server with batch endpoints
│   │   ├── batch_backend.py       # Backend batch processing engine
│   │   └── colors.py              # Color space conversions
│   └── web/
│       ├── index.html             # Web interface (tab-based)
│       ├── script.js              # Phase segmentation logic
│       ├── batch.js               # Batch processing frontend
│       └── style.css              # Styling
├── docs/                          # Additional documentation (gitignored)
├── start_web.py                   # Web server launcher
├── requirements.txt               # Dependencies
├── pyproject.toml                 # Project configuration
└── uv.lock                        # Dependency lock file
```

---

## Configuration

To customize image path or output directory, edit `start_web.py`:

```python
web_interface = WebInterface(
    image_path="path/to/your/image.png",
    output_dir="custom/output/path",
    port=8000  # Change port if needed
)
```

---

## Requirements

- Python 3.8+
- Flask (web server)
- OpenCV (image I/O)
- Pillow (image processing)
- NumPy (batch processing)

**Phase Segmentation:** Classification runs in JavaScript (client-side)  
**Batch Processing:** Classification runs in Python (server-side) for better performance with large images

---

## Performance

**Phase Segmentation Tab:**
- Real-time classification for images up to ~10MP
- Runs entirely in browser

**Batch Processing Tab:**
- Handles 40MB+ images (tested with 8122×2732 pixels)
- Vectorized B/C classification: ~10 seconds for 22M pixels
- Backend processing eliminates browser memory limits
- Automatic preview generation (600px) for fast visualization

---

## Technical Notes

- **Color Space**: CIE LAB (D65 illuminant, sRGB gamma correction)
- **B/C Zone Algorithm**: Ray casting point-in-polygon with vectorized operations
- **Coordinate System**: User-defined physical coordinates (e.g., μm, mm)
- **Distribution Analysis**: 50-bin vertical slicing for X-axis profiles
- **Export Format**: ZIP with CSV, PNG images, and JSON metadata
- **Browser Compatibility**: Tested on Chrome, Firefox, Edge

---

## Documentation

Additional documentation is available in the `docs/` folder (not tracked in git):
- Batch processing implementation details
- Backend architecture
- Classification algorithm specifics
- X-axis distribution analysis
- UI improvement guides

---

## License

MIT License — see `LICENSE` for details.

---

## Contributing

Contributions and improvements are welcome!  
Please submit a Pull Request or open an Issue on the repository.
