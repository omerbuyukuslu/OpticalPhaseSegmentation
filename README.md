# Optical Phase Segmentation Tool

An interactive **web-based application** for optical phase segmentation in confocal microscopy images.  
The tool uses **LAB color space classification** with optional **brightness/contrast (B/C) zoning** to enable precise and intuitive phase identification.

---

## Overview

This tool allows you to:
- Define and name material phases with custom colors
- Sample representative pixels interactively
- Adjust thresholds on LAB histograms (L*, a*, b*)
- Optionally apply Brightness/Contrast zones to refine boundaries
- Classify the full image based on these criteria
- Export classification settings and results

All classification is performed **client-side in JavaScript**, ensuring fast, interactive feedback.  
The **Python backend** (Flask) is used only for image loading and serving the web interface.

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

## Workflow

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

---

## Algorithm

### LAB Color Space Classification

1. **RGB → LAB Conversion**  
   Each pixel is converted to CIE LAB color space (D65 illuminant, sRGB gamma).  
   LAB provides perceptual uniformity — equal distances correspond to equal color differences.

2. **Thresholding**  
   For each phase, the tool checks whether a pixel’s L*, a*, and b* values fall within the selected ranges.

3. **Optional Brightness/Contrast Zone Filtering**  
   Pixels are further checked against the B/C zone if defined.

4. **Classification**  
   A pixel is assigned to the first phase that satisfies:
   ```
   LAB_match AND BC_match
   ```

5. **Visualization and Analysis**
   - Classified pixels are displayed with transparency overlays
   - Areal fractions are calculated column-wise
   - Results are exportable as images and XML settings

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

**Results**
- Segmented overlay (viewed and saved directly from browser)
- **Areal fraction statistics** (displayed in charts)

---

## Project Structure

```
OpticalPhaseSegmentation/
├── src/
│   ├── data/                # Sample images
│   ├── segment/
│   │   ├── pipeline.py      # Image loading and preprocessing
│   │   └── web_interface.py # Flask server
│   └── web/
│       ├── index.html       # Web interface
│       ├── script.js        # LAB classification logic
│       └── style.css        # Styling
├── start_web.py             # Web server launcher
├── requirements.txt         # Dependencies
├── pyproject.toml           # Project configuration
└── uv.lock                  # Dependency lock file
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
- OpenCV (image I/O only)
- Pillow

> Note: The core classification algorithm runs entirely in JavaScript on the client side.  
> Python is used only for image loading and serving.

---

## Technical Notes

- **Frontend**: LAB color space classification (JavaScript, see `src/web/script.js`)
- **Backend**: Flask server for image hosting only
- **No external ML libraries**: No K-means, no scikit-learn
- **Color Conversion**: D65 illuminant, sRGB gamma correction
- **Performance**: All computation runs in browser

---

## License

MIT License — see `LICENSE` for details.

---

## Contributing

Contributions and improvements are welcome!  
Please submit a Pull Request or open an Issue on the repository.
