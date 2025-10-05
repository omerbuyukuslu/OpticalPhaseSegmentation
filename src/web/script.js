// Interactive Watershed Segmentation JavaScript

class InteractiveSegmentation {
    constructor() {
        console.log('Constructor called');
        
        this.canvas = document.getElementById('image-canvas');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        
        if (!this.canvas || !this.overlayCanvas) {
            console.error('Canvas elements not found!');
            console.log('image-canvas:', this.canvas);
            console.log('overlay-canvas:', this.overlayCanvas);
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        
        this.brushSize = document.getElementById('brush-size');
        this.brushSizeValue = document.getElementById('brush-size-value');
        this.statusMessage = document.getElementById('status-message');
        this.statusIcon = document.getElementById('status-icon');
        this.statusContainer = document.getElementById('status-container');
        
        console.log('All DOM elements found');
        
        this.image = null; // Original RGB image
        this.phases = new Map(); // Map of phase ID to {name, color, targetRGB, tolerance, samples: []}
        this.currentPhaseId = null;
        this.isDrawing = false;
        this.phaseIdCounter = 1;
        this.cursorCanvas = null; // For brush preview
        this.samplingMode = false; // Toggle between sampling and painting
        this.markers = []; // Store all drawn markers for redrawing
        
        // RGB color filter properties
        this.sampledRGB = null;
        this.colorTolerance = 30;
        this.ternaryPlotVisible = false;
        this.ternaryCanvas = null;
        this.ternaryCtx = null;
        
        // Ternary plot interactive features
        this.ternaryZoom = 1.0;
        this.ternaryPanX = 0;
        this.ternaryPanY = 0;
        this.ternaryDragging = false;
        this.ternaryDragStart = { x: 0, y: 0 };
        this.ternaryDataBounds = null;
        
        // Zone drawing on ternary plot
        this.drawingZone = false;
        this.currentZoneVertices = [];
        this.zoneDrawingPhaseId = null;
        this.zoneDrawingMode = 'circle'; // 'polygon' or 'circle'
        this.circleCenter = null; // For circle mode
        this.circleRadius = 0; // For circle mode
        this.currentDrawingMode = 'polygon'; // Centralized drawing mode for both RGB and B/C
        
        // Classification results
        this.classifiedImage = null; // Canvas with color-coded pixels
        this.classificationStats = null; // Areal fraction by X position
        this.currentView = 'original'; // 'original' or 'classified'
        
        // Brightness/Contrast plot
        this.bcCanvas = null;
        this.bcCtx = null;
        this.bcZoom = 1.0;
        this.bcPanX = 0;
        this.bcPanY = 0;
        this.bcDragging = false;
        this.bcDragStart = { x: 0, y: 0 };
        this.drawingBCZone = false;
        this.bcZoneDrawingMode = 'polygon'; // 'polygon' or 'circle'
        this.bcCurrentZoneVertices = [];
        this.bcCircleCenter = null;
        this.bcCircleRadius = 0;
        
        // LAB color space properties
        this.labLCanvas = null;
        this.labACanvas = null;
        this.labBCanvas = null;
        this.labLCtx = null;
        this.labACtx = null;
        this.labBCtx = null;
        this.labDragging = false;
        this.labDragChannel = null; // 'L', 'a', or 'b'
        this.labDragStart = null;
        this.labDragBoundary = null; // 'min', 'max', or 'range' (drag both)
        this.cachedLABDataRanges = null; // Cache to prevent axis recalculation
        this.labHoveredLine = null; // { channel, type: 'min'|'max' } for hover effect
        
        // Zoom and pan properties
        this.zoomLevel = 1.0;
        this.minZoom = 0.1;
        this.maxZoom = 5.0;
        this.zoomStep = 0.2;
        this.panMode = false;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.canvasWrapper = document.getElementById('canvas-wrapper');
        
        // Large Image Grid Navigation
        this.largeImage = null; // Full resolution large image
        this.largeImageData = null; // ImageData of full image
        this.largeImageOriginalFilename = null; // Store original filename
        this.gridSize = 30; // Number of tiles (default)
        this.gridCols = 0;
        this.gridRows = 0;
        this.gridTileWidth = 0;
        this.gridTileHeight = 0;
        this.currentGridTile = null; // {row, col}
        this.gridNavigatorCanvas = null;
        this.gridNavigatorCtx = null;
        this.gridNavigationActive = false;
        this.gridHoverTile = null; // {row, col} for cursor preview
        
        // Store markers, zones, and B/C zones per tile
        // Key: "row_col" (e.g., "0_1"), Value: {markers: [], zones: [], bcZones: []}
        this.gridTileData = new Map();
        
        this.init();
    }
    
    init() {
        console.log('Initializing application...');
        
        // Setup event listeners and controls first
        this.setupEventListeners();
        this.setupRGBFilterControls();
        this.setupTernaryPlot();
        this.setupBrightnessContrastPlot();
        this.setupLABGraphs();
        this.setupViewToggle();
        this.setupCursorPreview();
        this.setupZoomAndPan();
        this.setupGridNavigation();
        
        // Clear cache after DOM is ready
        this.clearCacheOnLoad();
        
        // Don't auto-load image - wait for user to upload or load example
        // this.loadImage();
    }
    
    clearCacheOnLoad() {
        // Clear all phase data
        this.phases.clear();
        this.currentPhaseId = null;
        this.phaseIdCounter = 1;
        this.markers = [];
        this.sampledRGB = null;
        this.classifiedImage = null;
        this.classificationStats = null;
        
        // Clear localStorage if used
        if (typeof(Storage) !== 'undefined') {
            localStorage.removeItem('phases');
            localStorage.removeItem('markers');
        }
        
        // Reset ternary plot
        this.ternaryZoom = 1.0;
        this.ternaryPanX = 0;
        this.ternaryPanY = 0;
        this.drawingZone = false;
        this.currentZoneVertices = [];
        
        // Clear UI elements
        setTimeout(() => {
            const samplingStats = document.getElementById('sampling-stats');
            if (samplingStats) {
                samplingStats.innerHTML = '<p class="text-gray-500 italic">No samples yet. Click on image to sample pixels.</p>';
            }
            
            const phaseStats = document.getElementById('phase-statistics-container');
            if (phaseStats) {
                phaseStats.innerHTML = '<p class="text-gray-500 italic text-center">No phases yet. Add phases to see statistics.</p>';
            }
            
            const arealChart = document.getElementById('areal-fraction-chart');
            if (arealChart) {
                arealChart.style.display = 'none';
            }
        }, 100);
        
        console.log('Cache cleared on page load');
    }
    
    setupCursorPreview() {
        // Add mousemove event to show brush preview
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.currentPhaseId || !this.phases.has(this.currentPhaseId)) return;
            
            const pos = this.getMousePos(e);
            const brushSize = parseInt(this.brushSize.value);
            
            // Create temporary canvas context for preview
            const rect = this.canvas.getBoundingClientRect();
            const displayX = (pos.x / this.canvas.width) * rect.width;
            const displayY = (pos.y / this.canvas.height) * rect.height;
            
            // Update canvas cursor style
            this.canvas.style.cursor = 'crosshair';
        });
    }
    
    setupRGBFilterControls() {
        // Clear samples button
        const clearSamplesBtn = document.getElementById('clear-samples-btn');
        if (clearSamplesBtn) {
            clearSamplesBtn.addEventListener('click', () => {
                this.clearSamples();
            });
        }
        
        // Save classification button
        const saveBtn = document.getElementById('save-classification-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveClassification();
            });
        }
        
        // Load classification file input
        const loadInput = document.getElementById('load-classification-input');
        if (loadInput) {
            loadInput.addEventListener('change', (e) => {
                this.loadClassification(e);
            });
        }
    }
    
    setupTernaryPlot() {
        this.ternaryCanvas = document.getElementById('rgb-ternary-plot');
        if (!this.ternaryCanvas) {
            console.error('Ternary canvas not found!');
            return;
        }
        
        this.ternaryCtx = this.ternaryCanvas.getContext('2d');
        this.ternaryPlotVisible = true; // Always visible now
        
        console.log('Ternary canvas setup:', this.ternaryCanvas.width, 'x', this.ternaryCanvas.height);
        
        // Draw initial empty ternary plot
        this.drawTernaryPlot();
        
        // Mouse wheel for zoom
        this.ternaryCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.ternaryCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.max(0.5, Math.min(10, this.ternaryZoom * zoomFactor));
            
            // Zoom towards mouse position
            const zoomChange = newZoom / this.ternaryZoom;
            this.ternaryPanX = mouseX - (mouseX - this.ternaryPanX) * zoomChange;
            this.ternaryPanY = mouseY - (mouseY - this.ternaryPanY) * zoomChange;
            
            this.ternaryZoom = newZoom;
            this.drawTernaryPlot();
            
            // Update zoom display
            const zoomDisplay = document.getElementById('ternary-zoom-level');
            if (zoomDisplay) {
                zoomDisplay.textContent = Math.round(this.ternaryZoom * 100) + '%';
            }
        });
        
        // Mouse drag for pan (only when NOT drawing zone)
        this.ternaryCanvas.addEventListener('mousedown', (e) => {
            if (this.drawingZone) return; // Don't pan while drawing zone
            
            this.ternaryDragging = true;
            this.ternaryDragStart = {
                x: e.clientX - this.ternaryPanX,
                y: e.clientY - this.ternaryPanY
            };
            this.ternaryCanvas.style.cursor = 'grabbing';
        });
        
        this.ternaryCanvas.addEventListener('mousemove', (e) => {
            if (this.ternaryDragging && !this.drawingZone) {
                this.ternaryPanX = e.clientX - this.ternaryDragStart.x;
                this.ternaryPanY = e.clientY - this.ternaryDragStart.y;
                this.drawTernaryPlot();
            } else if (this.drawingZone) {
                // Show preview of current vertex position or circle
                this.drawTernaryPlot();
                const rect = this.ternaryCanvas.getBoundingClientRect();
                const canvasX = e.clientX - rect.left;
                const canvasY = e.clientY - rect.top;
                
                // Transform to world coordinates
                const mouseX = (canvasX - this.ternaryPanX) / this.ternaryZoom;
                const mouseY = (canvasY - this.ternaryPanY) / this.ternaryZoom;
                
                const ctx = this.ternaryCtx;
                ctx.save();
                ctx.translate(this.ternaryPanX, this.ternaryPanY);
                ctx.scale(this.ternaryZoom, this.ternaryZoom);
                
                if (this.zoneDrawingMode === 'circle' && this.circleCenter) {
                    // Draw preview circle
                    const dx = mouseX - this.circleCenter.x;
                    const dy = mouseY - this.circleCenter.y;
                    const previewRadius = Math.sqrt(dx * dx + dy * dy);
                    
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 2 / this.ternaryZoom;
                    ctx.setLineDash([5 / this.ternaryZoom, 5 / this.ternaryZoom]);
                    ctx.beginPath();
                    ctx.arc(this.circleCenter.x, this.circleCenter.y, previewRadius, 0, 2 * Math.PI);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    // Draw center marker
                    ctx.fillStyle = '#ff0000';
                    ctx.beginPath();
                    ctx.arc(this.circleCenter.x, this.circleCenter.y, 3 / this.ternaryZoom, 0, 2 * Math.PI);
                    ctx.fill();
                } else if (this.zoneDrawingMode === 'polygon' && this.currentZoneVertices.length > 0) {
                    // Draw preview line from last vertex to mouse (polygon mode)
                    const lastVertex = this.currentZoneVertices[this.currentZoneVertices.length - 1];
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 2 / this.ternaryZoom;
                    ctx.setLineDash([5 / this.ternaryZoom, 5 / this.ternaryZoom]);
                    ctx.beginPath();
                    ctx.moveTo(lastVertex.x, lastVertex.y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                
                ctx.restore();
            }
        });
        
        this.ternaryCanvas.addEventListener('mouseup', () => {
            if (!this.drawingZone) {
                this.ternaryDragging = false;
                this.ternaryCanvas.style.cursor = 'crosshair';
            }
        });
        
        this.ternaryCanvas.addEventListener('mouseleave', () => {
            if (!this.drawingZone) {
                this.ternaryDragging = false;
                this.ternaryCanvas.style.cursor = 'crosshair';
            }
        });
        
        // Click to add zone vertices or circle points
        this.ternaryCanvas.addEventListener('click', (e) => {
            if (!this.drawingZone) return;
            
            const rect = this.ternaryCanvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            
            // Transform canvas coordinates to account for zoom and pan
            const x = (canvasX - this.ternaryPanX) / this.ternaryZoom;
            const y = (canvasY - this.ternaryPanY) / this.ternaryZoom;
            
            if (this.zoneDrawingMode === 'circle') {
                if (!this.circleCenter) {
                    // First click: set center
                    this.circleCenter = { x, y };
                    this.setStatus(`Circle center set at (${Math.round(x)}, ${Math.round(y)}). Click again to set radius.`, 'info');
                    this.drawTernaryPlot();
                } else {
                    // Second click: calculate radius and create circle as polygon
                    const dx = x - this.circleCenter.x;
                    const dy = y - this.circleCenter.y;
                    this.circleRadius = Math.sqrt(dx * dx + dy * dy);
                    
                    // Convert circle to polygon (36 vertices for smooth circle)
                    const numVertices = 36;
                    this.currentZoneVertices = [];
                    for (let i = 0; i < numVertices; i++) {
                        const angle = (i / numVertices) * 2 * Math.PI;
                        const vx = this.circleCenter.x + this.circleRadius * Math.cos(angle);
                        const vy = this.circleCenter.y + this.circleRadius * Math.sin(angle);
                        this.currentZoneVertices.push({ x: vx, y: vy });
                    }
                    
                    // Finish zone drawing
                    this.finishZoneDrawing();
                }
            } else {
                // Polygon mode (original behavior)
                // Check if clicking near first vertex to close polygon (within 10px in screen space)
                if (this.currentZoneVertices.length >= 3) {
                    const firstVertex = this.currentZoneVertices[0];
                    const screenDist = Math.sqrt(
                        ((x - firstVertex.x) * this.ternaryZoom) ** 2 + 
                        ((y - firstVertex.y) * this.ternaryZoom) ** 2
                    );
                    if (screenDist < 10) {
                        this.finishZoneDrawing();
                        return;
                    }
                }
                
                // Add vertex
                this.currentZoneVertices.push({ x, y });
                this.drawTernaryPlot();
            }
        });
        
        // Right-click to cancel zone drawing
        this.ternaryCanvas.addEventListener('contextmenu', (e) => {
            if (this.drawingZone) {
                e.preventDefault();
                this.cancelZoneDrawing();
            }
        });
        
        // Auto-zoom button
        const autoZoomBtn = document.getElementById('auto-zoom-ternary-btn');
        if (autoZoomBtn) {
            autoZoomBtn.addEventListener('click', () => this.autoZoomTernaryPlot());
        }
        
        // Reset button  
        const resetBtn = document.getElementById('reset-ternary-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.ternaryZoom = 1.0;
                this.ternaryPanX = 0;
                this.ternaryPanY = 0;
                this.drawTernaryPlot();
                const zoomDisplay = document.getElementById('ternary-zoom-level');
                if (zoomDisplay) {
                    zoomDisplay.textContent = '100%';
                }
            });
        }
        
        // Initial draw
        this.drawTernaryPlot();
    }
    
    setupBrightnessContrastPlot() {
        this.bcCanvas = document.getElementById('brightness-contrast-plot');
        if (!this.bcCanvas) {
            console.error('Brightness/Contrast canvas not found!');
            return;
        }
        
        this.bcCtx = this.bcCanvas.getContext('2d');
        console.log('Brightness/Contrast canvas setup:', this.bcCanvas.width, 'x', this.bcCanvas.height);
        
        // Draw initial empty plot
        this.drawBrightnessContrastPlot();
        
        // Mouse wheel for zoom
        this.bcCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.bcCanvas.getBoundingClientRect();
            // Scale coordinates to match canvas internal resolution
            const scaleX = this.bcCanvas.width / rect.width;
            const scaleY = this.bcCanvas.height / rect.height;
            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;
            
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.max(0.5, Math.min(10, this.bcZoom * zoomFactor));
            
            const zoomChange = newZoom / this.bcZoom;
            this.bcPanX = mouseX - (mouseX - this.bcPanX) * zoomChange;
            this.bcPanY = mouseY - (mouseY - this.bcPanY) * zoomChange;
            
            this.bcZoom = newZoom;
            this.drawBrightnessContrastPlot();
        });
        
        // Mouse drag for pan
        this.bcCanvas.addEventListener('mousedown', (e) => {
            if (this.drawingBCZone) return;
            
            this.bcDragging = true;
            this.bcDragStart = {
                x: e.clientX - this.bcPanX,
                y: e.clientY - this.bcPanY
            };
            this.bcCanvas.style.cursor = 'grabbing';
        });
        
        this.bcCanvas.addEventListener('mousemove', (e) => {
            if (this.bcDragging && !this.drawingBCZone) {
                this.bcPanX = e.clientX - this.bcDragStart.x;
                this.bcPanY = e.clientY - this.bcDragStart.y;
                this.drawBrightnessContrastPlot();
            } else if (this.drawingBCZone) {
                // Show circle or polygon preview
                this.drawBrightnessContrastPlot();
                const rect = this.bcCanvas.getBoundingClientRect();
                // Scale coordinates to match canvas internal resolution
                const scaleX = this.bcCanvas.width / rect.width;
                const scaleY = this.bcCanvas.height / rect.height;
                const canvasX = (e.clientX - rect.left) * scaleX;
                const canvasY = (e.clientY - rect.top) * scaleY;
                const mouseX = (canvasX - this.bcPanX) / this.bcZoom;
                const mouseY = (canvasY - this.bcPanY) / this.bcZoom;
                
                const ctx = this.bcCtx;
                ctx.save();
                ctx.translate(this.bcPanX, this.bcPanY);
                ctx.scale(this.bcZoom, this.bcZoom);
                
                if (this.bcZoneDrawingMode === 'circle' && this.bcCircleCenter) {
                    // Draw circle preview
                    const dx = mouseX - this.bcCircleCenter.x;
                    const dy = mouseY - this.bcCircleCenter.y;
                    const previewRadius = Math.sqrt(dx * dx + dy * dy);
                    
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 2 / this.bcZoom;
                    ctx.setLineDash([5 / this.bcZoom, 5 / this.bcZoom]);
                    ctx.beginPath();
                    ctx.arc(this.bcCircleCenter.x, this.bcCircleCenter.y, previewRadius, 0, 2 * Math.PI);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    ctx.fillStyle = '#ff0000';
                    ctx.beginPath();
                    ctx.arc(this.bcCircleCenter.x, this.bcCircleCenter.y, 3 / this.bcZoom, 0, 2 * Math.PI);
                    ctx.fill();
                } else if (this.bcZoneDrawingMode === 'polygon' && this.bcCurrentZoneVertices.length > 0) {
                    // Draw polygon preview line
                    const lastVertex = this.bcCurrentZoneVertices[this.bcCurrentZoneVertices.length - 1];
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 2 / this.bcZoom;
                    ctx.setLineDash([5 / this.bcZoom, 5 / this.bcZoom]);
                    ctx.beginPath();
                    ctx.moveTo(lastVertex.x, lastVertex.y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                
                ctx.restore();
            }
        });
        
        this.bcCanvas.addEventListener('mouseup', () => {
            if (!this.drawingBCZone) {
                this.bcDragging = false;
                this.bcCanvas.style.cursor = 'crosshair';
            }
        });
        
        this.bcCanvas.addEventListener('mouseleave', () => {
            if (!this.drawingBCZone) {
                this.bcDragging = false;
                this.bcCanvas.style.cursor = 'crosshair';
            }
        });
        
        // Click to add BC zone vertices or circle points
        this.bcCanvas.addEventListener('click', (e) => {
            console.log(`B/C canvas clicked - drawingBCZone: ${this.drawingBCZone}`);
            
            if (!this.drawingBCZone) {
                console.log(`B/C click ignored - not in drawing mode`);
                return;
            }
            
            const rect = this.bcCanvas.getBoundingClientRect();
            // Scale coordinates to match canvas internal resolution
            const scaleX = this.bcCanvas.width / rect.width;
            const scaleY = this.bcCanvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            
            console.log(`B/C canvas click - clientX: ${e.clientX}, clientY: ${e.clientY}, rect.left: ${rect.left}, rect.top: ${rect.top}`);
            console.log(`Scaled coords - canvasX: ${canvasX.toFixed(1)}, canvasY: ${canvasY.toFixed(1)}, scaleX: ${scaleX.toFixed(2)}, scaleY: ${scaleY.toFixed(2)}`);
            
            // Transform canvas coordinates to account for zoom and pan
            const x = (canvasX - this.bcPanX) / this.bcZoom;
            const y = (canvasY - this.bcPanY) / this.bcZoom;
            
            console.log(`After zoom/pan - x: ${x.toFixed(1)}, y: ${y.toFixed(1)}, zoom: ${this.bcZoom.toFixed(2)}, panX: ${this.bcPanX.toFixed(1)}, panY: ${this.bcPanY.toFixed(1)}`);
            
            // Get current data ranges
            const ranges = this.calculateBCDataRanges();
            
            // Convert canvas coordinates to data coordinates (brightness/contrast)
            const dataPoint = this.bcCanvasToData({ x, y }, ranges);
            
            if (this.bcZoneDrawingMode === 'circle') {
                if (!this.bcCircleCenter) {
                    this.bcCircleCenter = dataPoint;
                    console.log(`Circle center set at B=${dataPoint.brightness.toFixed(1)}, C=${dataPoint.contrast.toFixed(1)}`);
                    this.setStatus(`B/C circle center set at (B=${dataPoint.brightness.toFixed(0)}, C=${dataPoint.contrast.toFixed(0)}). Click again to set radius.`, 'info');
                    this.drawBrightnessContrastPlot();
                } else {
                    const dx = dataPoint.brightness - this.bcCircleCenter.brightness;
                    const dy = dataPoint.contrast - this.bcCircleCenter.contrast;
                    this.bcCircleRadius = Math.sqrt(dx * dx + dy * dy);
                    console.log(`Circle radius set to ${this.bcCircleRadius.toFixed(1)}`);
                    
                    // Convert circle to polygon (in data coordinates)
                    const numVertices = 36;
                    this.bcCurrentZoneVertices = [];
                    for (let i = 0; i < numVertices; i++) {
                        const angle = (i / numVertices) * 2 * Math.PI;
                        const vBrightness = this.bcCircleCenter.brightness + this.bcCircleRadius * Math.cos(angle);
                        const vContrast = this.bcCircleCenter.contrast + this.bcCircleRadius * Math.sin(angle);
                        this.bcCurrentZoneVertices.push({ brightness: vBrightness, contrast: vContrast });
                    }
                    
                    // Store BC zone in current phase
                    const phase = this.phases.get(this.zoneDrawingPhaseId);
                    phase.bcZone = [...this.bcCurrentZoneVertices];
                    console.log(`B/C circle zone saved for phase ${phase.name}`);
                    
                    this.drawingBCZone = false;
                    this.bcCurrentZoneVertices = [];
                    this.bcCircleCenter = null;
                    this.bcCircleRadius = 0;
                    
                    // Hide B/C drawing status panel
                    this.hideBCDrawingStatus();
                    
                    this.drawBrightnessContrastPlot();
                    this.renderPhasesList();
                    this.setStatus(`B/C zone defined for ${phase.name}.`, 'success');
                }
            } else {
                // Polygon mode
                // Check if clicking near first vertex to close polygon (within 10px in screen space)
                if (this.bcCurrentZoneVertices.length >= 3) {
                    const firstVertex = this.bcCurrentZoneVertices[0];
                    const firstCanvasPoint = this.bcDataToCanvas(firstVertex, ranges);
                    const screenDist = Math.sqrt(
                        ((x - firstCanvasPoint.x) * this.bcZoom) ** 2 + 
                        ((y - firstCanvasPoint.y) * this.bcZoom) ** 2
                    );
                    if (screenDist < 10) {
                        // Close the polygon
                        const phase = this.phases.get(this.zoneDrawingPhaseId);
                        phase.bcZone = [...this.bcCurrentZoneVertices];
                        
                        this.drawingBCZone = false;
                        this.bcCurrentZoneVertices = [];
                        
                        // Hide B/C drawing status panel
                        this.hideBCDrawingStatus();
                        
                        this.drawBrightnessContrastPlot();
                        this.renderPhasesList();
                        this.setStatus(`B/C zone defined for ${phase.name}.`, 'success');
                        return;
                    }
                }
                
                // Add vertex (in data coordinates)
                this.bcCurrentZoneVertices.push(dataPoint);
                console.log(`Added B/C vertex #${this.bcCurrentZoneVertices.length}: B=${dataPoint.brightness.toFixed(1)}, C=${dataPoint.contrast.toFixed(1)}`);
                this.setStatus(`B/C zone: ${this.bcCurrentZoneVertices.length} vertices. Right-click or press Enter to finish.`, 'info');
                this.drawBrightnessContrastPlot();
            }
        });
        
        // Reset button
        const resetBtn = document.getElementById('reset-bc-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.bcZoom = 1.0;
                this.bcPanX = 0;
                this.bcPanY = 0;
                this.drawBrightnessContrastPlot();
            });
        }
        
        // BC zone mode selector
        const bcModeSelector = document.getElementById('bc-zone-mode');
        if (bcModeSelector) {
            bcModeSelector.addEventListener('change', (e) => {
                this.bcZoneDrawingMode = e.target.value;
            });
        }
        
        // Areal plot mode selector
        const arealPlotModeSelector = document.getElementById('areal-plot-mode');
        if (arealPlotModeSelector) {
            arealPlotModeSelector.addEventListener('change', () => {
                this.displayArealFractionChart();
            });
        }
        
        // Right-click to cancel BC zone drawing
        this.bcCanvas.addEventListener('contextmenu', (e) => {
            if (this.drawingBCZone) {
                e.preventDefault();
                this.cancelBCZoneDrawing();
            }
        });
    }
    
    // RGB to LAB color space conversion
    rgbToLab(r, g, b) {
        // Normalize RGB values to 0-1
        r = r / 255.0;
        g = g / 255.0;
        b = b / 255.0;
        
        // Apply gamma correction (sRGB to linear RGB)
        r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
        
        // Convert to XYZ (using D65 illuminant)
        let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
        let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
        let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
        
        // Normalize by D65 white point
        x = x / 0.95047;
        y = y / 1.00000;
        z = z / 1.08883;
        
        // Apply LAB transformation
        const epsilon = 0.008856;
        const kappa = 903.3;
        
        x = x > epsilon ? Math.pow(x, 1/3) : (kappa * x + 16) / 116;
        y = y > epsilon ? Math.pow(y, 1/3) : (kappa * y + 16) / 116;
        z = z > epsilon ? Math.pow(z, 1/3) : (kappa * z + 16) / 116;
        
        // Calculate LAB values
        const L = 116 * y - 16;  // Lightness: 0-100
        const a = 500 * (x - y);  // a: -128 to +127 (green to red)
        const bVal = 200 * (y - z);  // b: -128 to +127 (blue to yellow)
        
        return { L, a, b: bVal };
    }
    
    setupLABGraphs() {
        // Get canvas elements
        this.labLCanvas = document.getElementById('lab-l-canvas');
        this.labACanvas = document.getElementById('lab-a-canvas');
        this.labBCanvas = document.getElementById('lab-b-canvas');
        
        if (!this.labLCanvas || !this.labACanvas || !this.labBCanvas) {
            console.error('LAB canvas elements not found!');
            return;
        }
        
        // Get 2D contexts
        this.labLCtx = this.labLCanvas.getContext('2d');
        this.labACtx = this.labACanvas.getContext('2d');
        this.labBCtx = this.labBCanvas.getContext('2d');
        
        console.log('LAB canvases setup:', this.labLCanvas.width, 'x', this.labLCanvas.height);
        
        // Draw initial empty graphs
        this.drawLABGraphs();
        
        // Mouse event handlers for L channel
        this.labLCanvas.addEventListener('mousedown', (e) => this.handleLABMouseDown(e, 'L'));
        this.labLCanvas.addEventListener('mousemove', (e) => this.handleLABMouseMove(e, 'L'));
        this.labLCanvas.addEventListener('mouseup', (e) => this.handleLABMouseUp(e, 'L'));
        this.labLCanvas.addEventListener('mouseleave', (e) => this.handleLABMouseUp(e, 'L'));
        
        // Mouse event handlers for a channel
        this.labACanvas.addEventListener('mousedown', (e) => this.handleLABMouseDown(e, 'a'));
        this.labACanvas.addEventListener('mousemove', (e) => this.handleLABMouseMove(e, 'a'));
        this.labACanvas.addEventListener('mouseup', (e) => this.handleLABMouseUp(e, 'a'));
        this.labACanvas.addEventListener('mouseleave', (e) => this.handleLABMouseUp(e, 'a'));
        
        // Mouse event handlers for b channel
        this.labBCanvas.addEventListener('mousedown', (e) => this.handleLABMouseDown(e, 'b'));
        this.labBCanvas.addEventListener('mousemove', (e) => this.handleLABMouseMove(e, 'b'));
        this.labBCanvas.addEventListener('mouseup', (e) => this.handleLABMouseUp(e, 'b'));
        this.labBCanvas.addEventListener('mouseleave', (e) => this.handleLABMouseUp(e, 'b'));
    }
    
    handleLABMouseDown(e, channel) {
        if (!this.currentPhaseId) return;
        
        const canvas = channel === 'L' ? this.labLCanvas : (channel === 'a' ? this.labACanvas : this.labBCanvas);
        const rect = canvas.getBoundingClientRect();
        // Scale mouse coordinate to match canvas internal resolution
        const scaleX = canvas.width / rect.width;
        const x = (e.clientX - rect.left) * scaleX;
        
        const phase = this.phases.get(this.currentPhaseId);
        
        // Check if phase has LAB ranges already set
        if (phase.labRanges && phase.labRanges[channel]) {
            // Get cached data ranges
            if (!this.cachedLABDataRanges) {
                this.cachedLABDataRanges = this.calculateLABDataRanges();
            }
            const ranges = this.cachedLABDataRanges;
            const dataRange = channel === 'L' ? ranges.L : (channel === 'a' ? ranges.a : ranges.b);
            const minVal = dataRange.min;
            const maxVal = dataRange.max;
            const valueRange = maxVal - minVal;
            
            const width = canvas.width;
            const margin = 50;
            const graphWidth = width - 2 * margin;
            
            // Calculate pixel positions of current min/max lines
            const currentMin = phase.labRanges[channel].min;
            const currentMax = phase.labRanges[channel].max;
            const minX = margin + ((currentMin - minVal) / valueRange) * graphWidth;
            const maxX = margin + ((currentMax - minVal) / valueRange) * graphWidth;
            
            const threshold = 30; // pixels - large for easy clicking
            
            // Calculate distances to each line
            const distToMin = Math.abs(x - minX);
            const distToMax = Math.abs(x - maxX);
            
            // Choose the CLOSEST line if within threshold
            if (distToMin < threshold || distToMax < threshold) {
                if (distToMin < distToMax) {
                    // Closer to min line
                    this.labDragBoundary = 'min';
                    this.labDragging = true;
                    this.labDragChannel = channel;
                    this.labDragStart = x;
                    canvas.style.cursor = 'ew-resize';
                    console.log(`Dragging MIN line for ${channel}, distance: ${distToMin.toFixed(1)}px`);
                    return;
                } else {
                    // Closer to max line
                    this.labDragBoundary = 'max';
                    this.labDragging = true;
                    this.labDragChannel = channel;
                    this.labDragStart = x;
                    canvas.style.cursor = 'ew-resize';
                    console.log(`Dragging MAX line for ${channel}, distance: ${distToMax.toFixed(1)}px`);
                    return;
                }
            }
        }
        
        // Otherwise, start a new range selection (drag both)
        this.labDragBoundary = 'range';
        this.labDragging = true;
        this.labDragChannel = channel;
        this.labDragStart = x;
        canvas.style.cursor = 'crosshair';
        console.log(`Starting new range selection for ${channel}`);
    }
    
    handleLABMouseMove(e, channel) {
        if (!this.currentPhaseId) return;
        
        const canvas = channel === 'L' ? this.labLCanvas : (channel === 'a' ? this.labACanvas : this.labBCanvas);
        const rect = canvas.getBoundingClientRect();
        // Scale mouse coordinate to match canvas internal resolution
        const scaleX = canvas.width / rect.width;
        const x = (e.clientX - rect.left) * scaleX;
        
        // If not dragging, update cursor based on proximity to min/max lines
        if (!this.labDragging) {
            const phase = this.phases.get(this.currentPhaseId);
            // Only show hover if we have cached ranges (avoid recalculation)
            if (phase.labRanges && phase.labRanges[channel] && this.cachedLABDataRanges) {
                const ranges = this.cachedLABDataRanges;
                const dataRange = channel === 'L' ? ranges.L : (channel === 'a' ? ranges.a : ranges.b);
                const minVal = dataRange.min;
                const maxVal = dataRange.max;
                const valueRange = maxVal - minVal;
                
                const width = canvas.width;
                const margin = 50;
                const graphWidth = width - 2 * margin;
                
                const currentMin = phase.labRanges[channel].min;
                const currentMax = phase.labRanges[channel].max;
                const minX = margin + ((currentMin - minVal) / valueRange) * graphWidth;
                const maxX = margin + ((currentMax - minVal) / valueRange) * graphWidth;
                
                const threshold = 30; // Match click threshold
                const distToMin = Math.abs(x - minX);
                const distToMax = Math.abs(x - maxX);
                
                // Show resize cursor if close to either line
                if (distToMin < threshold || distToMax < threshold) {
                    canvas.style.cursor = 'ew-resize';
                    
                    // Store which line is hovered for visual feedback
                    if (distToMin < distToMax) {
                        this.labHoveredLine = { channel, type: 'min' };
                    } else {
                        this.labHoveredLine = { channel, type: 'max' };
                    }
                    this.drawLABGraphs(); // Redraw to show hover effect
                } else {
                    canvas.style.cursor = 'crosshair';
                    if (this.labHoveredLine) {
                        this.labHoveredLine = null;
                        this.drawLABGraphs(); // Redraw to remove hover effect
                    }
                }
            } else {
                canvas.style.cursor = 'crosshair';
            }
            return;
        }
        
        // Handle dragging
        if (this.labDragChannel !== channel) return;
        
        // IMPORTANT: Use CACHED ranges - do NOT recalculate!
        const ranges = this.cachedLABDataRanges;
        if (!ranges) {
            console.error('No cached LAB ranges available during drag!');
            return;
        }
        
        const dataRange = channel === 'L' ? ranges.L : (channel === 'a' ? ranges.a : ranges.b);
        const minVal = dataRange.min;
        const maxVal = dataRange.max;
        const valueRange = maxVal - minVal;
        
        // Update the range selection
        const phase = this.phases.get(this.currentPhaseId);
        if (!phase.labRanges) {
            phase.labRanges = {
                L: { min: 0, max: 100 },
                a: { min: -128, max: 127 },
                b: { min: -128, max: 127 }
            };
        }
        
        const width = canvas.width;
        const margin = 50;
        const graphWidth = width - 2 * margin;
        
        // Convert current mouse position to value
        const currentVal = minVal + ((x - margin) / graphWidth) * valueRange;
        const clampedVal = Math.max(minVal, Math.min(maxVal, currentVal));
        
        if (this.labDragBoundary === 'min') {
            // Only update min, ensure it doesn't exceed max
            phase.labRanges[channel].min = Math.min(clampedVal, phase.labRanges[channel].max - 0.1);
        } else if (this.labDragBoundary === 'max') {
            // Only update max, ensure it doesn't go below min
            phase.labRanges[channel].max = Math.max(clampedVal, phase.labRanges[channel].min + 0.1);
        } else {
            // Range selection (both min and max)
            const startVal = minVal + ((this.labDragStart - margin) / graphWidth) * valueRange;
            const clampedStart = Math.max(minVal, Math.min(maxVal, startVal));
            
            phase.labRanges[channel].min = Math.min(clampedStart, clampedVal);
            phase.labRanges[channel].max = Math.max(clampedStart, clampedVal);
        }
        
        this.drawLABGraphs();
    }
    
    handleLABMouseUp(e, channel) {
        if (this.labDragging && this.labDragChannel === channel) {
            this.labDragging = false;
            this.labDragChannel = null;
            this.labDragStart = null;
            this.labDragBoundary = null;
            
            const canvas = channel === 'L' ? this.labLCanvas : (channel === 'a' ? this.labACanvas : this.labBCanvas);
            canvas.style.cursor = 'crosshair';
            
            // Redraw to finalize
            this.drawLABGraphs();
            this.renderPhasesList();
        }
    }
    
    drawLABGraphs() {
        // Use cached ranges if available, otherwise calculate them
        if (!this.cachedLABDataRanges) {
            console.log('🔄 Calculating NEW LAB data ranges (cache was empty)');
            this.cachedLABDataRanges = this.calculateLABDataRanges();
        }
        const ranges = this.cachedLABDataRanges;
        
        this.drawLABGraph('L', this.labLCanvas, this.labLCtx, ranges.L.min, ranges.L.max);
        this.drawLABGraph('a', this.labACanvas, this.labACtx, ranges.a.min, ranges.a.max);
        this.drawLABGraph('b', this.labBCanvas, this.labBCtx, ranges.b.min, ranges.b.max);
        
        // Update range labels in HTML
        const lRangeLabel = document.getElementById('lab-l-range');
        const aRangeLabel = document.getElementById('lab-a-range');
        const bRangeLabel = document.getElementById('lab-b-range');
        
        if (lRangeLabel) lRangeLabel.textContent = `(${ranges.L.min.toFixed(1)} to ${ranges.L.max.toFixed(1)})`;
        if (aRangeLabel) aRangeLabel.textContent = `(${ranges.a.min.toFixed(1)} to ${ranges.a.max.toFixed(1)})`;
        if (bRangeLabel) bRangeLabel.textContent = `(${ranges.b.min.toFixed(1)} to ${ranges.b.max.toFixed(1)})`;
    }
    
    calculateLABDataRanges() {
        let minL = Infinity, maxL = -Infinity;
        let minA = Infinity, maxA = -Infinity;
        let minB = Infinity, maxB = -Infinity;
        let hasData = false;
        
        // Calculate ranges from all phase samples
        for (const [phaseId, phase] of this.phases) {
            if (!phase.samples || phase.samples.length === 0) continue;
            
            for (const sample of phase.samples) {
                hasData = true;
                const lab = this.rgbToLab(sample.rgb[0], sample.rgb[1], sample.rgb[2]);
                
                minL = Math.min(minL, lab.L);
                maxL = Math.max(maxL, lab.L);
                minA = Math.min(minA, lab.a);
                maxA = Math.max(maxA, lab.a);
                minB = Math.min(minB, lab.b);
                maxB = Math.max(maxB, lab.b);
            }
        }
        
        // If no data, use default full ranges
        if (!hasData) {
            return {
                L: { min: 0, max: 100 },
                a: { min: -128, max: 127 },
                b: { min: -128, max: 127 }
            };
        }
        
        // Add 10% padding to ranges
        const lRange = maxL - minL;
        const aRange = maxA - minA;
        const bRange = maxB - minB;
        
        const lPadding = Math.max(lRange * 0.15, 5);
        const aPadding = Math.max(aRange * 0.15, 10);
        const bPadding = Math.max(bRange * 0.15, 10);
        
        return {
            L: { 
                min: Math.max(0, minL - lPadding), 
                max: Math.min(100, maxL + lPadding) 
            },
            a: { 
                min: Math.max(-128, minA - aPadding), 
                max: Math.min(127, maxA + aPadding) 
            },
            b: { 
                min: Math.max(-128, minB - bPadding), 
                max: Math.min(127, maxB + bPadding) 
            }
        };
    }
    
    drawLABGraph(channel, canvas, ctx, minVal, maxVal) {
        const width = canvas.width;
        const height = canvas.height;
        const margin = 50;
        const graphWidth = width - 2 * margin;
        const graphHeight = height - 40;
        
        // Clear canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Draw axes
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin, 20);
        ctx.lineTo(margin, 20 + graphHeight);
        ctx.lineTo(margin + graphWidth, 20 + graphHeight);
        ctx.stroke();
        
        // Draw tick marks and labels
        ctx.fillStyle = '#333333';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        
        const numTicks = 10;
        for (let i = 0; i <= numTicks; i++) {
            const x = margin + (i / numTicks) * graphWidth;
            const value = minVal + (i / numTicks) * (maxVal - minVal);
            
            ctx.beginPath();
            ctx.moveTo(x, 20 + graphHeight);
            ctx.lineTo(x, 20 + graphHeight + 5);
            ctx.stroke();
            
            ctx.fillText(value.toFixed(0), x, 20 + graphHeight + 18);
        }
        
        // Draw grid lines
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= numTicks; i++) {
            const x = margin + (i / numTicks) * graphWidth;
            ctx.beginPath();
            ctx.moveTo(x, 20);
            ctx.lineTo(x, 20 + graphHeight);
            ctx.stroke();
        }
        
        // Plot samples for each phase
        for (const [phaseId, phase] of this.phases) {
            if (!phase.samples || phase.samples.length === 0) continue;
            
            ctx.fillStyle = phase.color + '80'; // Semi-transparent
            
            for (let sampleIdx = 0; sampleIdx < phase.samples.length; sampleIdx++) {
                const sample = phase.samples[sampleIdx];
                const lab = this.rgbToLab(sample.rgb[0], sample.rgb[1], sample.rgb[2]);
                const value = lab[channel];
                
                // Convert value to x position
                const x = margin + ((value - minVal) / (maxVal - minVal)) * graphWidth;
                
                // Stable random y position based on sample index and RGB values
                // This creates a seeded random number that stays the same for each sample
                const seed = sampleIdx * 1000 + sample.rgb[0] + sample.rgb[1] * 256 + sample.rgb[2] * 65536;
                const seededRandom = (Math.sin(seed) * 10000) % 1; // Value between 0 and 1
                const y = 20 + Math.abs(seededRandom) * graphHeight;
                
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Draw selection range for current phase
            if (phaseId === this.currentPhaseId && phase.labRanges && phase.labRanges[channel]) {
                const range = phase.labRanges[channel];
                const xMin = margin + ((range.min - minVal) / (maxVal - minVal)) * graphWidth;
                const xMax = margin + ((range.max - minVal) / (maxVal - minVal)) * graphWidth;
                
                // Draw filled range area
                ctx.fillStyle = phase.color + '30'; // Very transparent
                ctx.fillRect(xMin, 20, xMax - xMin, graphHeight);
                
                // Draw min and max boundary lines with enhanced visibility
                ctx.strokeStyle = phase.color;
                ctx.lineWidth = 3;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 4;
                
                // Min line
                ctx.beginPath();
                ctx.moveTo(xMin, 20);
                ctx.lineTo(xMin, 20 + graphHeight);
                ctx.stroke();
                
                // Max line
                ctx.beginPath();
                ctx.moveTo(xMax, 20);
                ctx.lineTo(xMax, 20 + graphHeight);
                ctx.stroke();
                
                // Reset shadow
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                
                // Draw interactive handles at the top of each line
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                
                // Check if either handle is being hovered for visual feedback
                const isMinHovered = this.labHoveredLine && this.labHoveredLine.channel === channel && this.labHoveredLine.type === 'min';
                const isMaxHovered = this.labHoveredLine && this.labHoveredLine.channel === channel && this.labHoveredLine.type === 'max';
                
                // Min handle (larger circle at top for easier clicking)
                ctx.fillStyle = isMinHovered ? '#ffffff' : phase.color;
                ctx.beginPath();
                ctx.arc(xMin, 20, isMinHovered ? 14 : 12, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = isMinHovered ? phase.color : '#ffffff';
                ctx.lineWidth = isMinHovered ? 3 : 2;
                ctx.stroke();
                
                // Max handle (larger circle at top for easier clicking)
                ctx.fillStyle = isMaxHovered ? '#ffffff' : phase.color;
                ctx.beginPath();
                ctx.arc(xMax, 20, isMaxHovered ? 14 : 12, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = isMaxHovered ? phase.color : '#ffffff';
                ctx.lineWidth = isMaxHovered ? 3 : 2;
                ctx.stroke();
                
                // Draw range values with background
                ctx.font = 'bold 11px sans-serif';
                
                // Min value label
                const minText = `${range.min.toFixed(1)}`;
                ctx.textAlign = 'left';
                const minTextWidth = ctx.measureText(minText).width;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(xMin + 2, 30, minTextWidth + 4, 14);
                ctx.fillStyle = phase.color;
                ctx.fillText(minText, xMin + 4, 40);
                
                // Max value label
                const maxText = `${range.max.toFixed(1)}`;
                ctx.textAlign = 'right';
                const maxTextWidth = ctx.measureText(maxText).width;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(xMax - maxTextWidth - 6, 30, maxTextWidth + 4, 14);
                ctx.fillStyle = phase.color;
                ctx.fillText(maxText, xMax - 4, 40);
            }
        }
    }

    calculateBCDataRanges() {
        let minBrightness = Infinity;
        let maxBrightness = -Infinity;
        let minContrast = Infinity;
        let maxContrast = -Infinity;
        let hasData = false;
        
        // Calculate ranges from all samples
        for (const [phaseId, phase] of this.phases) {
            if (!phase.samples || phase.samples.length === 0) continue;
            
            for (const sample of phase.samples) {
                hasData = true;
                const brightness = (sample.rgb[0] + sample.rgb[1] + sample.rgb[2]) / 3;
                const mean = brightness;
                const variance = (
                    Math.pow(sample.rgb[0] - mean, 2) +
                    Math.pow(sample.rgb[1] - mean, 2) +
                    Math.pow(sample.rgb[2] - mean, 2)
                ) / 3;
                const contrast = Math.sqrt(variance);
                
                minBrightness = Math.min(minBrightness, brightness);
                maxBrightness = Math.max(maxBrightness, brightness);
                minContrast = Math.min(minContrast, contrast);
                maxContrast = Math.max(maxContrast, contrast);
            }
        }
        
        // If no data, use default ranges
        if (!hasData) {
            return {
                minBrightness: 0,
                maxBrightness: 255,
                minContrast: 0,
                maxContrast: 128
            };
        }
        
        // Add 10% padding to ranges
        const brightnessRange = maxBrightness - minBrightness;
        const contrastRange = maxContrast - minContrast;
        const brightnessPadding = Math.max(brightnessRange * 0.1, 10); // At least 10 units
        const contrastPadding = Math.max(contrastRange * 0.1, 5); // At least 5 units
        
        minBrightness = Math.max(0, minBrightness - brightnessPadding);
        maxBrightness = Math.min(255, maxBrightness + brightnessPadding);
        minContrast = Math.max(0, minContrast - contrastPadding);
        maxContrast = Math.min(128, maxContrast + contrastPadding);
        
        return {
            minBrightness: Math.floor(minBrightness),
            maxBrightness: Math.ceil(maxBrightness),
            minContrast: Math.floor(minContrast),
            maxContrast: Math.ceil(maxContrast)
        };
    }
    
    // Convert canvas coordinates to brightness/contrast data values
    bcCanvasToData(canvasPoint, ranges) {
        const margin = 50;
        const plotWidth = this.bcCanvas.width - 2 * margin;
        const plotHeight = this.bcCanvas.height - 2 * margin;
        
        const normalizedX = (canvasPoint.x - margin) / plotWidth;
        const normalizedY = (margin + plotHeight - canvasPoint.y) / plotHeight;
        
        const brightness = ranges.minBrightness + normalizedX * (ranges.maxBrightness - ranges.minBrightness);
        const contrast = ranges.minContrast + normalizedY * (ranges.maxContrast - ranges.minContrast);
        
        return { brightness, contrast };
    }
    
    // Convert brightness/contrast data values to canvas coordinates
    bcDataToCanvas(dataPoint, ranges) {
        const margin = 50;
        const plotWidth = this.bcCanvas.width - 2 * margin;
        const plotHeight = this.bcCanvas.height - 2 * margin;
        
        const normalizedX = (dataPoint.brightness - ranges.minBrightness) / (ranges.maxBrightness - ranges.minBrightness);
        const normalizedY = (dataPoint.contrast - ranges.minContrast) / (ranges.maxContrast - ranges.minContrast);
        
        const x = margin + normalizedX * plotWidth;
        const y = margin + plotHeight - normalizedY * plotHeight;
        
        return { x, y };
    }
    
    
    drawBrightnessContrastPlot() {
        const canvas = this.bcCanvas;
        if (!canvas) return;
        
        const ctx = this.bcCtx;
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, width, height);
        
        ctx.save();
        ctx.translate(this.bcPanX, this.bcPanY);
        ctx.scale(this.bcZoom, this.bcZoom);
        
        // Get dynamic ranges based on data
        const ranges = this.calculateBCDataRanges();
        const minBrightness = ranges.minBrightness;
        const maxBrightness = ranges.maxBrightness;
        const minContrast = ranges.minContrast;
        const maxContrast = ranges.maxContrast;
        const brightnessRange = maxBrightness - minBrightness;
        const contrastRange = maxContrast - minContrast;
        
        // Plot setup
        const margin = 50;
        const plotWidth = width - 2 * margin;
        const plotHeight = height - 2 * margin;
        
        // Draw axes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2 / this.bcZoom;
        ctx.beginPath();
        ctx.moveTo(margin, margin);
        ctx.lineTo(margin, margin + plotHeight);
        ctx.lineTo(margin + plotWidth, margin + plotHeight);
        ctx.stroke();
        
        // Grid and labels
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1 / this.bcZoom;
        ctx.font = `${10 / this.bcZoom}px Arial`;
        ctx.fillStyle = '#666';
        
        // X-axis (Brightness: dynamic range)
        const numXTicks = 6;
        for (let i = 0; i < numXTicks; i++) {
            const brightness = minBrightness + (i / (numXTicks - 1)) * brightnessRange;
            const normalizedX = (brightness - minBrightness) / brightnessRange;
            const x = margin + normalizedX * plotWidth;
            
            ctx.beginPath();
            ctx.moveTo(x, margin);
            ctx.lineTo(x, margin + plotHeight);
            ctx.stroke();
            
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(brightness).toString(), x, margin + plotHeight + 20 / this.bcZoom);
        }
        
        // Y-axis (Contrast: dynamic range)
        const numYTicks = 5;
        for (let i = 0; i < numYTicks; i++) {
            const contrast = minContrast + (i / (numYTicks - 1)) * contrastRange;
            const normalizedY = (contrast - minContrast) / contrastRange;
            const y = margin + plotHeight - normalizedY * plotHeight;
            
            ctx.beginPath();
            ctx.moveTo(margin, y);
            ctx.lineTo(margin + plotWidth, y);
            ctx.stroke();
            
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(contrast).toString(), margin - 10 / this.bcZoom, y + 4 / this.bcZoom);
        }
        
        // Axis labels
        ctx.font = `bold ${12 / this.bcZoom}px Arial`;
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText('Brightness (avg intensity)', margin + plotWidth / 2, margin + plotHeight + 40 / this.bcZoom);
        
        ctx.save();
        ctx.translate(margin - 35 / this.bcZoom, margin + plotHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Contrast (RGB std dev)', 0, 0);
        ctx.restore();
        
        // Plot sample points
        for (const [phaseId, phase] of this.phases) {
            if (!phase.samples || phase.samples.length === 0) continue;
            
            const color = this.hexToRgb(phase.color);
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`;
            
            for (const sample of phase.samples) {
                const brightness = (sample.rgb[0] + sample.rgb[1] + sample.rgb[2]) / 3;
                const mean = brightness;
                const variance = (
                    Math.pow(sample.rgb[0] - mean, 2) +
                    Math.pow(sample.rgb[1] - mean, 2) +
                    Math.pow(sample.rgb[2] - mean, 2)
                ) / 3;
                const contrast = Math.sqrt(variance);
                
                // Use dynamic range scaling
                const normalizedX = (brightness - minBrightness) / brightnessRange;
                const normalizedY = (contrast - minContrast) / contrastRange;
                const x = margin + normalizedX * plotWidth;
                const y = margin + plotHeight - normalizedY * plotHeight;
                
                ctx.beginPath();
                ctx.arc(x, y, 3 / this.bcZoom, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Draw BC zones if they exist (convert from data coordinates to canvas)
            if (phase.bcZone && phase.bcZone.length > 0) {
                ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
                ctx.lineWidth = 2 / this.bcZoom;
                ctx.setLineDash([]);
                
                // Convert zone vertices from data coordinates to canvas coordinates
                const canvasVertices = phase.bcZone.map(v => {
                    const normalizedX = (v.brightness - minBrightness) / brightnessRange;
                    const normalizedY = (v.contrast - minContrast) / contrastRange;
                    return {
                        x: margin + normalizedX * plotWidth,
                        y: margin + plotHeight - normalizedY * plotHeight
                    };
                });
                
                // Draw the polygon
                ctx.beginPath();
                ctx.moveTo(canvasVertices[0].x, canvasVertices[0].y);
                for (let i = 1; i < canvasVertices.length; i++) {
                    ctx.lineTo(canvasVertices[i].x, canvasVertices[i].y);
                }
                ctx.closePath();
                
                // Fill with semi-transparent color
                ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.1)`;
                ctx.fill();
                
                // Stroke the border
                ctx.stroke();
                
                // Draw vertices
                ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
                for (const vertex of canvasVertices) {
                    ctx.beginPath();
                    ctx.arc(vertex.x, vertex.y, 3 / this.bcZoom, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }
        
        // Draw current zone being drawn (convert from data coordinates to canvas)
        if (this.drawingBCZone && this.bcCurrentZoneVertices.length > 0) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2 / this.bcZoom;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            
            // Convert vertices from data to canvas coordinates
            const canvasVertices = this.bcCurrentZoneVertices.map(v => {
                const normalizedX = (v.brightness - minBrightness) / brightnessRange;
                const normalizedY = (v.contrast - minContrast) / contrastRange;
                return {
                    x: margin + normalizedX * plotWidth,
                    y: margin + plotHeight - normalizedY * plotHeight
                };
            });
            
            // Draw lines between vertices
            ctx.beginPath();
            ctx.moveTo(canvasVertices[0].x, canvasVertices[0].y);
            for (let i = 1; i < canvasVertices.length; i++) {
                ctx.lineTo(canvasVertices[i].x, canvasVertices[i].y);
            }
            ctx.stroke();
            
            // Draw vertices
            for (const vertex of canvasVertices) {
                ctx.beginPath();
                ctx.arc(vertex.x, vertex.y, 4 / this.bcZoom, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Highlight first vertex if we can close
            if (canvasVertices.length >= 3) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3 / this.bcZoom;
                ctx.beginPath();
                ctx.arc(canvasVertices[0].x, canvasVertices[0].y, 8 / this.bcZoom, 0, 2 * Math.PI);
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
    
    autoZoomTernaryPlot() {
        // Calculate bounding box of all samples
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let hasData = false;
        
        for (const [phaseId, phase] of this.phases) {
            if (!phase.samples || phase.samples.length === 0) continue;
            
            for (const sample of phase.samples) {
                const total = sample.rgb[0] + sample.rgb[1] + sample.rgb[2];
                if (total === 0) continue;
                
                const r = sample.rgb[0] / total;
                const g = sample.rgb[1] / total;
                const b = sample.rgb[2] / total;
                
                // Convert to triangle position
                const x = r + g * 0.5;
                const y = g * (Math.sqrt(3) / 2);
                
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                hasData = true;
            }
        }
        
        if (!hasData) {
            this.setStatus('No sample data to zoom to', 'warning');
            return;
        }
        
        // Add padding (20%)
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = 0.2;
        
        minX -= width * padding;
        maxX += width * padding;
        minY -= height * padding;
        maxY += height * padding;
        
        // Calculate zoom to fit data
        const canvas = this.ternaryCanvas;
        const margin = 50;
        const size = Math.min(canvas.width, canvas.height) - 2 * margin;
        
        const dataWidth = maxX - minX;
        const dataHeight = maxY - minY;
        
        this.ternaryZoom = Math.min(1 / dataWidth, 1 / dataHeight) * 0.8;
        
        // Center on data
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        this.ternaryPanX = canvas.width / 2 - centerX * this.ternaryZoom * size;
        this.ternaryPanY = canvas.height / 2 - centerY * this.ternaryZoom * size;
        
        this.drawTernaryPlot();
        const zoomDisplay = document.getElementById('ternary-zoom-level');
        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(this.ternaryZoom * 100) + '%';
        }
        this.setStatus('Zoomed to data bounds', 'success');
    }
    
    drawTernaryPlot() {
        const canvas = this.ternaryCanvas;
        if (!canvas) {
            console.error('drawTernaryPlot: canvas is null');
            return;
        }
        
        const ctx = this.ternaryCtx;
        if (!ctx) {
            console.error('drawTernaryPlot: context is null');
            return;
        }
        
        const width = canvas.width;
        const height = canvas.height;
        
        console.log('Drawing ternary plot:', width, 'x', height);
        
        // Clear canvas
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, width, height);
        
        // Save context for transforms
        ctx.save();
        
        // Apply zoom and pan
        ctx.translate(this.ternaryPanX, this.ternaryPanY);
        ctx.scale(this.ternaryZoom, this.ternaryZoom);
        
        // Triangle setup
        const margin = 50;
        const size = Math.min(width, height) - 2 * margin;
        const triangleHeight = (Math.sqrt(3) / 2) * size;
        
        // Vertices
        const vertices = {
            R: { x: margin, y: height - margin },
            G: { x: margin + size, y: height - margin },
            B: { x: margin + size / 2, y: height - margin - triangleHeight }
        };
        
        // Draw triangle
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2 / this.ternaryZoom;
        ctx.beginPath();
        ctx.moveTo(vertices.R.x, vertices.R.y);
        ctx.lineTo(vertices.G.x, vertices.G.y);
        ctx.lineTo(vertices.B.x, vertices.B.y);
        ctx.closePath();
        ctx.stroke();
        
        // Draw grid with VALUE LABELS
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 0.5 / this.ternaryZoom;
        ctx.font = `${10 / this.ternaryZoom}px Arial`;
        ctx.fillStyle = '#666';
        
        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            
            // Grid lines
            if (i > 0 && i < 10) {
                // Lines parallel to R-G
                const p1 = {
                    x: vertices.R.x + t * (vertices.B.x - vertices.R.x),
                    y: vertices.R.y + t * (vertices.B.y - vertices.R.y)
                };
                const p2 = {
                    x: vertices.G.x + t * (vertices.B.x - vertices.G.x),
                    y: vertices.G.y + t * (vertices.B.y - vertices.G.y)
                };
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                
                // Lines parallel to R-B
                const p3 = {
                    x: vertices.R.x + t * (vertices.G.x - vertices.R.x),
                    y: vertices.R.y + t * (vertices.G.y - vertices.R.y)
                };
                const p4 = {
                    x: vertices.B.x + t * (vertices.G.x - vertices.B.x),
                    y: vertices.B.y + t * (vertices.G.y - vertices.B.y)
                };
                ctx.beginPath();
                ctx.moveTo(p3.x, p3.y);
                ctx.lineTo(p4.x, p4.y);
                ctx.stroke();
                
                // Lines parallel to G-B
                const p5 = {
                    x: vertices.G.x + t * (vertices.B.x - vertices.G.x),
                    y: vertices.G.y + t * (vertices.B.y - vertices.G.y)
                };
                const p6 = {
                    x: vertices.R.x + t * (vertices.B.x - vertices.R.x),
                    y: vertices.R.y + t * (vertices.B.y - vertices.R.y)
                };
                ctx.beginPath();
                ctx.moveTo(p5.x, p5.y);
                ctx.lineTo(p6.x, p6.y);
                ctx.stroke();
            }
            
            // AXIS VALUE LABELS (every 20%)
            if (i % 2 === 0) {
                const percent = Math.round(t * 100);
                ctx.textAlign = 'center';
                
                // R axis labels (bottom edge)
                const rLabelPos = {
                    x: vertices.R.x + t * (vertices.G.x - vertices.R.x),
                    y: vertices.R.y + 15 / this.ternaryZoom
                };
                ctx.fillText(`${percent}`, rLabelPos.x, rLabelPos.y);
                
                // G axis labels (right edge)
                const gLabelPos = {
                    x: vertices.G.x + t * (vertices.B.x - vertices.G.x) + 10 / this.ternaryZoom,
                    y: vertices.G.y + t * (vertices.B.y - vertices.G.y)
                };
                ctx.fillText(`${percent}`, gLabelPos.x, gLabelPos.y);
                
                // B axis labels (left edge)
                const bLabelPos = {
                    x: vertices.B.x + t * (vertices.R.x - vertices.B.x) - 10 / this.ternaryZoom,
                    y: vertices.B.y + t * (vertices.R.y - vertices.B.y)
                };
                ctx.fillText(`${percent}`, bLabelPos.x, bLabelPos.y);
            }
        }
        
        // Vertex labels
        ctx.font = `bold ${14 / this.ternaryZoom}px Arial`;
        ctx.fillStyle = '#d00';
        ctx.textAlign = 'center';
        ctx.fillText('R (Red) 100%', vertices.R.x, vertices.R.y + 35 / this.ternaryZoom);
        
        ctx.fillStyle = '#0d0';
        ctx.fillText('G (Green) 100%', vertices.G.x, vertices.G.y + 35 / this.ternaryZoom);
        
        ctx.fillStyle = '#00d';
        ctx.fillText('B (Blue) 100%', vertices.B.x, vertices.B.y - 25 / this.ternaryZoom);
        
        // Helper function
        const rgbToTernary = (rgb) => {
            const total = rgb[0] + rgb[1] + rgb[2];
            if (total === 0) return { x: vertices.R.x, y: vertices.R.y };
            
            const r = rgb[0] / total;
            const g = rgb[1] / total;
            const b = rgb[2] / total;
            
            const x = vertices.R.x * r + vertices.G.x * g + vertices.B.x * b;
            const y = vertices.R.y * r + vertices.G.y * g + vertices.B.y * b;
            
            return { x, y };
        };
        
        // Draw samples
        for (const [phaseId, phase] of this.phases) {
            if (!phase.samples || phase.samples.length === 0) continue;
            
            const phaseColor = phase.color;
            
            // Individual samples
            for (const sample of phase.samples) {
                const pos = rgbToTernary(sample.rgb);
                
                ctx.fillStyle = phaseColor;
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 3 / this.ternaryZoom, 0, 2 * Math.PI);
                ctx.fill();
                ctx.globalAlpha = 1.0;
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 0.5 / this.ternaryZoom;
                ctx.stroke();
            }
            
            // Mean point
            if (phase.targetRGB) {
                const meanPos = rgbToTernary(phase.targetRGB);
                
                ctx.fillStyle = phaseColor;
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(meanPos.x, meanPos.y, 12 / this.ternaryZoom, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = phaseColor;
                ctx.beginPath();
                ctx.arc(meanPos.x, meanPos.y, 8 / this.ternaryZoom, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2 / this.ternaryZoom;
                ctx.stroke();
                
                ctx.fillStyle = '#000';
                ctx.font = `bold ${10 / this.ternaryZoom}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(phase.name, meanPos.x, meanPos.y - 15 / this.ternaryZoom);
            }
            
            // Draw zone polygon if exists
            if (phase.zone && phase.zone.length >= 3) {
                ctx.strokeStyle = phase.color;
                ctx.fillStyle = phase.color;
                ctx.globalAlpha = 0.2;
                ctx.lineWidth = 3 / this.ternaryZoom;
                
                ctx.beginPath();
                ctx.moveTo(phase.zone[0].x, phase.zone[0].y);
                for (let i = 1; i < phase.zone.length; i++) {
                    ctx.lineTo(phase.zone[i].x, phase.zone[i].y);
                }
                ctx.closePath();
                ctx.fill();
                
                ctx.globalAlpha = 1.0;
                ctx.stroke();
                
                // Draw vertices
                for (const vertex of phase.zone) {
                    ctx.fillStyle = phase.color;
                    ctx.beginPath();
                    ctx.arc(vertex.x, vertex.y, 4 / this.ternaryZoom, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 1 / this.ternaryZoom;
                    ctx.stroke();
                }
            }
        }
        
        // Draw current zone being drawn
        if (this.drawingZone && this.currentZoneVertices.length > 0) {
            const phase = this.phases.get(this.zoneDrawingPhaseId);
            const color = phase ? phase.color : '#ff0000';
            
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / this.ternaryZoom;
            ctx.setLineDash([5, 5]);
            
            ctx.beginPath();
            ctx.moveTo(this.currentZoneVertices[0].x, this.currentZoneVertices[0].y);
            for (let i = 1; i < this.currentZoneVertices.length; i++) {
                ctx.lineTo(this.currentZoneVertices[i].x, this.currentZoneVertices[i].y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw vertices
            for (const [idx, vertex] of this.currentZoneVertices.entries()) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(vertex.x, vertex.y, 5 / this.ternaryZoom, 0, 2 * Math.PI);
                ctx.fill();
                
                // Highlight first vertex (for closing polygon)
                if (idx === 0 && this.currentZoneVertices.length >= 3) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2 / this.ternaryZoom;
                    ctx.beginPath();
                    ctx.arc(vertex.x, vertex.y, 8 / this.ternaryZoom, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            }
        }
        
        ctx.restore();
    }
    
    setupZoomAndPan() {
        // Zoom buttons
        document.getElementById('zoom-in-btn').addEventListener('click', () => {
            this.zoomIn();
        });
        
        document.getElementById('zoom-out-btn').addEventListener('click', () => {
            this.zoomOut();
        });
        
        document.getElementById('reset-view-btn').addEventListener('click', () => {
            this.resetView();
        });
        
        // Pan mode checkbox
        const panModeCheckbox = document.getElementById('pan-mode');
        panModeCheckbox.addEventListener('change', (e) => {
            this.panMode = e.target.checked;
            this.updateCursor();
        });
        
        // Space key for temporary pan
        let spacePressed = false;
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !spacePressed) {
                spacePressed = true;
                this.panMode = true;
                panModeCheckbox.checked = true;
                this.updateCursor();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                spacePressed = false;
                this.panMode = false;
                panModeCheckbox.checked = false;
                this.updateCursor();
            }
        });
        
        // Mouse wheel zoom - zoom towards cursor
        this.canvasWrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // Get cursor position relative to wrapper
            const rect = this.canvasWrapper.getBoundingClientRect();
            const cursorX = e.clientX - rect.left + this.canvasWrapper.scrollLeft;
            const cursorY = e.clientY - rect.top + this.canvasWrapper.scrollTop;
            
            // Calculate cursor position as fraction of current canvas size
            const canvasWidth = this.canvas.offsetWidth;
            const canvasHeight = this.canvas.offsetHeight;
            const cursorRatioX = cursorX / canvasWidth;
            const cursorRatioY = cursorY / canvasHeight;
            
            // Store old zoom
            const oldZoom = this.zoomLevel;
            
            // Apply zoom
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
            
            // Calculate new canvas size and adjust scroll to keep cursor position
            const newCanvasWidth = this.canvas.offsetWidth;
            const newCanvasHeight = this.canvas.offsetHeight;
            
            // Calculate where the cursor should be after zoom
            const newCursorX = cursorRatioX * newCanvasWidth;
            const newCursorY = cursorRatioY * newCanvasHeight;
            
            // Adjust scroll to maintain cursor position
            this.canvasWrapper.scrollLeft = newCursorX - (e.clientX - rect.left);
            this.canvasWrapper.scrollTop = newCursorY - (e.clientY - rect.top);
        }, { passive: false });
        
        // Pan functionality
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.panMode) {
                this.isPanning = true;
                this.panStart = {
                    x: e.clientX - this.canvasWrapper.scrollLeft,
                    y: e.clientY - this.canvasWrapper.scrollTop
                };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                const dx = e.clientX - this.panStart.x;
                const dy = e.clientY - this.panStart.y;
                this.canvasWrapper.scrollLeft = -dx;
                this.canvasWrapper.scrollTop = -dy;
                e.preventDefault();
                return;
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.updateCursor();
            }
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.updateCursor();
            }
        });
    }
    
    zoomIn() {
        this.setZoom(this.zoomLevel + this.zoomStep);
    }
    
    zoomOut() {
        this.setZoom(this.zoomLevel - this.zoomStep);
    }
    
    setZoom(newZoom) {
        // Clamp zoom level
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
        
        // Update canvas display size
        if (this.image) {
            const newWidth = this.image.width * this.zoomLevel;
            const newHeight = this.image.height * this.zoomLevel;
            
            this.canvas.style.width = newWidth + 'px';
            this.canvas.style.height = newHeight + 'px';
            this.overlayCanvas.style.width = newWidth + 'px';
            this.overlayCanvas.style.height = newHeight + 'px';
            
            // Update zoom level display
            document.getElementById('zoom-level').textContent = Math.round(this.zoomLevel * 100) + '%';
        }
    }
    
    resetView() {
        this.setZoom(1.0);
        this.canvasWrapper.scrollLeft = 0;
        this.canvasWrapper.scrollTop = 0;
        this.setStatus('View reset to 100%', 'info');
    }
    
    updateCursor() {
        if (this.panMode) {
            this.canvas.style.cursor = 'grab';
        } else if (this.currentPhaseId) {
            this.canvas.style.cursor = 'crosshair';
        } else {
            this.canvas.style.cursor = 'default';
        }
    }
    
    setupViewToggle() {
        const originalBtn = document.getElementById('view-original-btn');
        const classifiedBtn = document.getElementById('view-classified-btn');
        
        if (!originalBtn || !classifiedBtn) return;
        
        originalBtn.addEventListener('click', () => {
            this.currentView = 'original';
            this.switchView();
            originalBtn.className = 'px-3 py-1 bg-blue-500 text-white rounded-md text-sm font-medium transition-colors';
            classifiedBtn.className = 'px-3 py-1 bg-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-400 transition-colors';
        });
        
        classifiedBtn.addEventListener('click', () => {
            this.currentView = 'classified';
            this.switchView();
            originalBtn.className = 'px-3 py-1 bg-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-400 transition-colors';
            classifiedBtn.className = 'px-3 py-1 bg-blue-500 text-white rounded-md text-sm font-medium transition-colors';
        });
    }
    
    switchView() {
        if (this.currentView === 'original') {
            // Show original image with markers
            if (this.image) {
                this.ctx.drawImage(this.image, 0, 0);
            }
            this.overlayCanvas.style.display = 'block';
        } else if (this.currentView === 'classified') {
            // Show classified image
            if (this.classifiedImage) {
                // Draw original first as background
                if (this.image) {
                    this.ctx.drawImage(this.image, 0, 0);
                }
                // Then overlay classified image
                this.ctx.drawImage(this.classifiedImage, 0, 0);
            }
            this.overlayCanvas.style.display = 'none';
        }
    }
    
    setupEventListeners() {
        // Add new phase
        document.getElementById('add-phase-btn').addEventListener('click', () => {
            this.addNewPhase();
        });
        
        // Enter key in phase name input
        document.getElementById('new-phase-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addNewPhase();
            }
        });
        
        // Brush size
        this.brushSize.addEventListener('input', () => {
            this.brushSizeValue.textContent = this.brushSize.value;
        });
        
        // Canvas events - Handle all mouse interactions
        this.canvas.addEventListener('click', async (e) => {
            // Skip if in pan mode
            if (this.panMode) {
                return;
            }
            
            if (this.currentPhaseId === null) {
                this.setStatus('Please select a phase first', 'warning');
                return;
            }
            
            // Regular click = Add a marker point
            if (!this.isDrawing) {
                e.preventDefault();
                await this.addPoint(e);
                return;
            }
        });
        
        // Canvas events for drawing (painting with drag)
        this.canvas.addEventListener('mousedown', (e) => {
            // Skip if in pan mode - handled by setupZoomAndPan
            if (this.panMode) {
                return;
            }
            
            if (this.currentPhaseId === null) {
                this.setStatus('Please select a phase first', 'warning');
                return;
            }
            
            // Shift key = painting mode (drag to paint multiple markers)
            if (e.shiftKey) {
                this.isDrawing = true;
                this.addPoint(e);
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            // Skip if panning - handled by setupZoomAndPan
            if (this.isPanning) {
                return;
            }
            
            const pos = this.getMousePos(e);
            
            // Always redraw overlay to show brush cursor and all markers
            if (!this.panMode) {
                this.redrawOverlay(pos);
            }
            
            if (this.isDrawing && this.currentPhaseId !== null) {
                this.addPoint(e);
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isDrawing = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.isDrawing = false;
        });
        
        // Right click to erase
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.currentPhaseId !== null) {
                this.erasePoint(e);
            }
        });
        
        // Button events (only if they exist - removed from UI)
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearMarkers();
            });
        }
        
        const watershedBtn = document.getElementById('watershed-btn');
        if (watershedBtn) {
            watershedBtn.addEventListener('click', () => {
                this.runWatershed();
            });
        }
        
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveMarkers();
            });
        }
        
        const loadBtn = document.getElementById('load-btn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                this.loadMarkers();
            });
        }
        
        // Zone drawing controls
        const drawZoneBtn = document.getElementById('draw-zone-btn');
        if (drawZoneBtn) {
            drawZoneBtn.addEventListener('click', () => this.startZoneDrawing());
        }
        
        // New B/C zone drawing button
        const drawBCZoneBtn = document.getElementById('draw-bc-zone-btn');
        if (drawBCZoneBtn) {
            drawBCZoneBtn.addEventListener('click', () => this.startBCZoneDrawing());
        }
        
        // Drawing style toggle buttons
        const polygonModeBtn = document.getElementById('polygon-mode-btn');
        const circleModeBtn = document.getElementById('circle-mode-btn');
        if (polygonModeBtn && circleModeBtn) {
            polygonModeBtn.addEventListener('click', () => {
                this.currentDrawingMode = 'polygon';
                polygonModeBtn.classList.remove('bg-gray-300', 'text-gray-700');
                polygonModeBtn.classList.add('bg-green-600', 'text-white');
                circleModeBtn.classList.remove('bg-green-600', 'text-white');
                circleModeBtn.classList.add('bg-gray-300', 'text-gray-700');
            });
            circleModeBtn.addEventListener('click', () => {
                this.currentDrawingMode = 'circle';
                circleModeBtn.classList.remove('bg-gray-300', 'text-gray-700');
                circleModeBtn.classList.add('bg-green-600', 'text-white');
                polygonModeBtn.classList.remove('bg-green-600', 'text-white');
                polygonModeBtn.classList.add('bg-gray-300', 'text-gray-700');
            });
        }
        
        const clearZoneBtn = document.getElementById('clear-zone-btn');
        if (clearZoneBtn) {
            clearZoneBtn.addEventListener('click', () => this.clearAllZonesForCurrentPhase());
        }
        
        const classifyBtn = document.getElementById('classify-image-btn');
        if (classifyBtn) {
            classifyBtn.addEventListener('click', () => this.classifyImage());
        }
        
        // Global keyboard handler for zone drawing
        document.addEventListener('keydown', (e) => {
            if (this.drawingZone && e.key === 'Enter') {
                e.preventDefault();
                this.finishZoneDrawing();
            } else if (this.drawingZone && e.key === 'Escape') {
                e.preventDefault();
                this.cancelZoneDrawing();
            } else if (this.drawingBCZone && e.key === 'Enter' && this.bcCurrentZoneVertices.length >= 3) {
                e.preventDefault();
                this.finishBCZoneDrawing();
            } else if (this.drawingBCZone && e.key === 'Escape') {
                e.preventDefault();
                this.cancelBCZoneDrawing();
            }
        });
    }
    
    setupGridNavigation() {
        console.log('setupGridNavigation called');
        
        // Get grid navigation DOM elements
        this.gridNavigatorCanvas = document.getElementById('grid-navigator-canvas');
        if (this.gridNavigatorCanvas) {
            this.gridNavigatorCtx = this.gridNavigatorCanvas.getContext('2d');
            console.log('Grid navigator canvas found');
        } else {
            console.error('Grid navigator canvas not found!');
        }
        
        // Upload large image handler
        const uploadLargeInput = document.getElementById('upload-large-image-input');
        if (uploadLargeInput) {
            console.log('Upload large image input found, adding event listener');
            uploadLargeInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    console.log('Upload large image - File selected:', file.name, 'Type:', file.type, 'Size:', file.size);
                    
                    // Check if it's an image (either by MIME type or file extension)
                    const isImage = file.type.startsWith('image/') || 
                                   file.name.match(/\.(png|jpg|jpeg|gif|bmp|tif|tiff|webp)$/i);
                    
                    if (isImage) {
                        this.loadLargeImage(file);
                    } else {
                        alert('Please select a valid image file (PNG, JPG, TIF, etc.).');
                    }
                }
                e.target.value = '';
            });
        } else {
            console.error('Upload large image input not found!');
        }
        
        // Grid size apply button
        const applyGridBtn = document.getElementById('apply-grid-size-btn');
        if (applyGridBtn) {
            applyGridBtn.addEventListener('click', () => {
                const gridSizeInput = document.getElementById('grid-size-input');
                if (gridSizeInput) {
                    this.gridSize = parseInt(gridSizeInput.value) || 30;
                    this.calculateGridDimensions();
                    this.renderGridNavigator();
                }
            });
        }
        
        // Export grid data button
        const exportGridDataBtn = document.getElementById('export-grid-data-btn');
        if (exportGridDataBtn) {
            exportGridDataBtn.addEventListener('click', () => {
                this.exportGridData();
            });
        }
        
        // Close grid mode button
        const closeGridBtn = document.getElementById('close-grid-btn');
        if (closeGridBtn) {
            closeGridBtn.addEventListener('click', () => {
                this.closeGridMode();
            });
        }
        
        // Grid navigator canvas mouse events
        if (this.gridNavigatorCanvas) {
            this.gridNavigatorCanvas.addEventListener('mousemove', (e) => {
                if (this.gridNavigationActive) {
                    this.handleGridHover(e);
                }
            });
            
            this.gridNavigatorCanvas.addEventListener('mouseleave', () => {
                if (this.gridNavigationActive) {
                    this.gridHoverTile = null;
                    this.updateGridCursorInfo();
                    this.renderGridNavigator();
                }
            });
            
            this.gridNavigatorCanvas.addEventListener('click', (e) => {
                if (this.gridNavigationActive) {
                    this.handleGridClick(e);
                }
            });
        }
    }
    
    loadLargeImage(file) {
        console.log('loadLargeImage called with file:', file.name);
        this.setStatus('Loading large image...', 'info');
        
        // Show loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
            this.updateLoadingText('Loading Large Image', 'Preparing to process ' + file.name);
        }
        
        // Store original filename for export
        this.largeImageOriginalFilename = file.name;
        
        // Check if it's a TIFF file or any format that might need server-side conversion
        const needsConversion = file.name.match(/\.(tif|tiff)$/i) || file.size > 10 * 1024 * 1024; // TIFF or large files
        
        if (needsConversion) {
            console.log('File needs server-side conversion (TIFF or large file)');
            this.convertAndLoadLargeImage(file);
        } else {
            // Handle regular image formats (PNG, JPG, etc.) directly in browser
            console.log('Loading image directly in browser');
            
            const reader = new FileReader();
            reader.onload = (event) => {
                console.log('FileReader loaded, creating Image object...');
                const img = new Image();
                img.onload = () => {
                    console.log('Image loaded successfully:', img.width, 'x', img.height);
                    this.processLoadedImage(img);
                };
                img.onerror = () => {
                    console.error('Error loading image');
                    const loadingIndicator = document.getElementById('loading-indicator');
                    if (loadingIndicator) loadingIndicator.style.display = 'flex';
                    this.setStatus('Error loading image. Trying server-side conversion...', 'warning');
                    // Fallback to server-side conversion
                    this.convertAndLoadLargeImage(file);
                };
                img.src = event.target.result;
            };
            reader.onerror = () => {
                console.error('Error reading file');
                this.setStatus('Error reading file', 'error');
            };
            reader.readAsDataURL(file);
        }
    }
    
    convertAndLoadLargeImage(file) {
        console.log('Converting image on server:', file.name);
        this.setStatus('Converting image on server (this may take a moment for large files)...', 'info');
        
        // Show loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
            this.updateLoadingText('Converting Image on Server', 'Processing TIFF format - this may take 10-30 seconds for large files');
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/convert_large_image', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                console.log('Server conversion successful:', data.width, 'x', data.height);
                
                this.updateLoadingText('Loading Converted Image', `Image size: ${data.width}x${data.height} pixels`);
                
                // Create image from the converted data URL
                const img = new Image();
                img.onload = () => {
                    console.log('Converted image loaded in browser');
                    this.processLoadedImage(img);
                };
                img.onerror = () => {
                    console.error('Error loading converted image');
                    const loadingIndicator = document.getElementById('loading-indicator');
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                    this.setStatus('Error loading converted image', 'error');
                };
                img.src = data.image;
            } else {
                console.error('Server conversion failed:', data.message);
                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                this.setStatus('Error converting image: ' + data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error during server conversion:', error);
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            this.setStatus('Error communicating with server: ' + error.message, 'error');
        });
    }
    
    processLoadedImage(img) {
        console.log('Processing loaded image:', img.width, 'x', img.height);
        
        // Store the large image
        this.largeImage = img;
        
        // Create ImageData for the full image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        this.largeImageData = tempCtx.getImageData(0, 0, img.width, img.height);
        
        console.log('ImageData created');
        
        // Calculate grid dimensions
        this.calculateGridDimensions();
        console.log('Grid dimensions calculated:', this.gridCols, 'x', this.gridRows);
        
        // Show grid navigation container
        const gridContainer = document.getElementById('grid-navigation-container');
        if (gridContainer) {
            gridContainer.style.display = 'block';
            console.log('Grid container shown');
        } else {
            console.error('Grid container not found!');
        }
        
        // Activate grid mode
        this.gridNavigationActive = true;
        
        // Render the grid navigator
        this.renderGridNavigator();
        console.log('Grid navigator rendered');
        
        // Load the first tile (0, 0) into the main canvas
        this.currentGridTile = { row: 0, col: 0 };
        this.loadGridTile(0, 0);
        
        // Hide loading indicator (will be shown again by loadGridTile)
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        
        this.setStatus(`Large image loaded (${img.width}x${img.height}px). Grid: ${this.gridCols}x${this.gridRows} tiles.`, 'success');
    }
    
    calculateGridDimensions() {
        if (!this.largeImage) return;
        
        // Calculate grid layout (as square as possible)
        const totalTiles = this.gridSize;
        this.gridCols = Math.ceil(Math.sqrt(totalTiles));
        this.gridRows = Math.ceil(totalTiles / this.gridCols);
        
        // Calculate tile dimensions
        this.gridTileWidth = Math.floor(this.largeImage.width / this.gridCols);
        this.gridTileHeight = Math.floor(this.largeImage.height / this.gridRows);
    }
    
    renderGridNavigator() {
        if (!this.gridNavigatorCanvas || !this.largeImage) return;
        
        const canvas = this.gridNavigatorCanvas;
        const ctx = this.gridNavigatorCtx;
        
        // Set canvas to a fixed size to prevent resizing
        const parentWidth = canvas.parentElement.clientWidth;
        canvas.width = Math.min(parentWidth - 4, 800); // Max 800px width
        canvas.height = 150; // Fixed height
        
        // Calculate scale to fit the large image in the navigator
        const scaleX = canvas.width / this.largeImage.width;
        const scaleY = canvas.height / this.largeImage.height;
        const scale = Math.min(scaleX, scaleY);
        
        const displayWidth = this.largeImage.width * scale;
        const displayHeight = this.largeImage.height * scale;
        const offsetX = (canvas.width - displayWidth) / 2;
        const offsetY = (canvas.height - displayHeight) / 2;
        
        // Clear canvas
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the large image (scaled down)
        ctx.drawImage(this.largeImage, offsetX, offsetY, displayWidth, displayHeight);
        
        // Draw grid lines
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        
        const cellWidth = displayWidth / this.gridCols;
        const cellHeight = displayHeight / this.gridRows;
        
        // Vertical lines
        for (let col = 0; col <= this.gridCols; col++) {
            const x = offsetX + col * cellWidth;
            ctx.beginPath();
            ctx.moveTo(x, offsetY);
            ctx.lineTo(x, offsetY + displayHeight);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let row = 0; row <= this.gridRows; row++) {
            const y = offsetY + row * cellHeight;
            ctx.beginPath();
            ctx.moveTo(offsetX, y);
            ctx.lineTo(offsetX + displayWidth, y);
            ctx.stroke();
        }
        
        // Draw indicators for tiles with saved data
        ctx.fillStyle = 'rgba(59, 130, 246, 0.4)'; // Blue tint for tiles with data
        for (const [tileKey, tileData] of this.gridTileData) {
            const [row, col] = tileKey.split('_').map(Number);
            if (row < this.gridRows && col < this.gridCols) {
                const hasData = (tileData.markers && tileData.markers.length > 0) ||
                               (tileData.zones && tileData.zones.length > 0) ||
                               (tileData.bcZones && tileData.bcZones.length > 0);
                
                if (hasData) {
                    const x = offsetX + col * cellWidth;
                    const y = offsetY + row * cellHeight;
                    ctx.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
                    
                    // Add a small data indicator dot in corner
                    ctx.fillStyle = '#3b82f6';
                    ctx.beginPath();
                    ctx.arc(x + 8, y + 8, 3, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
                }
            }
        }
        
        // Highlight current tile
        if (this.currentGridTile) {
            const { row, col } = this.currentGridTile;
            const x = offsetX + col * cellWidth;
            const y = offsetY + row * cellHeight;
            
            ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
            ctx.fillRect(x, y, cellWidth, cellHeight);
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellWidth, cellHeight);
        }
        
        // Highlight hover tile
        if (this.gridHoverTile && (!this.currentGridTile || 
            this.gridHoverTile.row !== this.currentGridTile.row || 
            this.gridHoverTile.col !== this.currentGridTile.col)) {
            const { row, col } = this.gridHoverTile;
            const x = offsetX + col * cellWidth;
            const y = offsetY + row * cellHeight;
            
            ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
            ctx.fillRect(x, y, cellWidth, cellHeight);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellWidth, cellHeight);
        }
        
        // Store scale and offset for mouse interaction
        this.gridNavigatorScale = scale;
        this.gridNavigatorOffsetX = offsetX;
        this.gridNavigatorOffsetY = offsetY;
        this.gridNavigatorDisplayWidth = displayWidth;
        this.gridNavigatorDisplayHeight = displayHeight;
    }
    
    handleGridHover(e) {
        const rect = this.gridNavigatorCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Check if mouse is within the image bounds
        if (mouseX < this.gridNavigatorOffsetX || 
            mouseX > this.gridNavigatorOffsetX + this.gridNavigatorDisplayWidth ||
            mouseY < this.gridNavigatorOffsetY || 
            mouseY > this.gridNavigatorOffsetY + this.gridNavigatorDisplayHeight) {
            this.gridHoverTile = null;
            this.updateGridCursorInfo();
            this.renderGridNavigator();
            return;
        }
        
        // Calculate which tile the mouse is over
        const cellWidth = this.gridNavigatorDisplayWidth / this.gridCols;
        const cellHeight = this.gridNavigatorDisplayHeight / this.gridRows;
        
        const col = Math.floor((mouseX - this.gridNavigatorOffsetX) / cellWidth);
        const row = Math.floor((mouseY - this.gridNavigatorOffsetY) / cellHeight);
        
        // Validate row and col
        if (row >= 0 && row < this.gridRows && col >= 0 && col < this.gridCols) {
            this.gridHoverTile = { row, col };
        } else {
            this.gridHoverTile = null;
        }
        
        this.updateGridCursorInfo();
        this.renderGridNavigator();
    }
    
    handleGridClick(e) {
        if (!this.gridHoverTile) return;
        
        const { row, col } = this.gridHoverTile;
        this.loadGridTile(row, col);
    }
    
    loadGridTile(row, col) {
        if (!this.largeImageData) return;
        
        // Show loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
            this.updateLoadingText(`Loading Tile [${row}, ${col}]`, 'Extracting region from large image...');
        }
        this.setStatus(`Loading tile [${row}, ${col}]...`, 'info');
        
        // Use setTimeout to allow UI to update before processing
        setTimeout(() => {
            this.processTileLoading(row, col);
        }, 10);
    }
    
    processTileLoading(row, col) {
        // Save current tile data before switching (if we have a current tile)
        if (this.currentGridTile !== null) {
            this.saveTileData(this.currentGridTile.row, this.currentGridTile.col);
        }
        
        // Calculate pixel coordinates for this tile
        const startX = col * this.gridTileWidth;
        const startY = row * this.gridTileHeight;
        
        // Calculate actual tile dimensions (handle edge tiles that might be smaller)
        const actualWidth = Math.min(this.gridTileWidth, this.largeImage.width - startX);
        const actualHeight = Math.min(this.gridTileHeight, this.largeImage.height - startY);
        
        // Extract the tile from the large image
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = actualWidth;
        tileCanvas.height = actualHeight;
        const tileCtx = tileCanvas.getContext('2d');
        
        // Draw the tile portion
        tileCtx.drawImage(
            this.largeImage,
            startX, startY, actualWidth, actualHeight,
            0, 0, actualWidth, actualHeight
        );
        
        // Load this tile as the current image
        const tileDataURL = tileCanvas.toDataURL();
        
        // Update current tile
        this.currentGridTile = { row, col };
        
        // Clear existing data
        this.markers = [];
        this.zones = [];
        this.bcZones = [];
        
        // Upload tile to backend for pixel sampling
        this.uploadImageToBackend(tileDataURL);
        
        // Load the tile into the main canvas
        this.loadImage(tileDataURL);
        
        // Ensure canvas container is visible
        const canvasContainer = document.getElementById('canvas-container');
        const noImagePlaceholder = document.getElementById('no-image-placeholder');
        if (canvasContainer) {
            canvasContainer.style.display = 'inline-block';
        }
        if (noImagePlaceholder) {
            noImagePlaceholder.style.display = 'none';
        }
        
        // Restore tile data after image is loaded (use setTimeout to ensure image is loaded)
        setTimeout(() => {
            this.restoreTileData(row, col);
        }, 100);
        
        // Update grid navigator to show new current tile
        this.renderGridNavigator();
        
        // Update cursor info
        this.updateGridCursorInfo();
        
        // Hide loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        
        this.setStatus(`Loaded tile [${row}, ${col}] (${actualWidth}x${actualHeight}px)`, 'success');
    }
    
    saveTileData(row, col) {
        const tileKey = `${row}_${col}`;
        
        // Ensure arrays exist before accessing length
        const markers = this.markers || [];
        const zones = this.zones || [];
        const bcZones = this.bcZones || [];
        
        console.log(`Saving data for tile [${row}, ${col}]`, {
            markers: markers.length,
            zones: zones.length,
            bcZones: bcZones.length
        });
        
        // Deep copy the data to avoid references
        this.gridTileData.set(tileKey, {
            markers: JSON.parse(JSON.stringify(markers)),
            zones: JSON.parse(JSON.stringify(zones)),
            bcZones: JSON.parse(JSON.stringify(bcZones))
        });
    }
    
    restoreTileData(row, col) {
        const tileKey = `${row}_${col}`;
        const tileData = this.gridTileData.get(tileKey);
        
        if (tileData) {
            console.log(`Restoring data for tile [${row}, ${col}]`, {
                markers: tileData.markers.length,
                zones: tileData.zones.length,
                bcZones: tileData.bcZones.length
            });
            
            // Restore the data
            this.markers = JSON.parse(JSON.stringify(tileData.markers));
            this.zones = JSON.parse(JSON.stringify(tileData.zones));
            this.bcZones = JSON.parse(JSON.stringify(tileData.bcZones));
            
            // Redraw everything
            this.redrawCanvas();
        } else {
            console.log(`No saved data for tile [${row}, ${col}], starting fresh`);
        }
    }
    
    updateGridCursorInfo() {
        const cursorInfo = document.getElementById('grid-cursor-info');
        if (!cursorInfo) return;
        
        if (this.gridHoverTile) {
            const { row, col } = this.gridHoverTile;
            cursorInfo.textContent = `Hover: Tile [${row}, ${col}]`;
        } else if (this.currentGridTile) {
            const { row, col } = this.currentGridTile;
            cursorInfo.textContent = `Current: Tile [${row}, ${col}]`;
        } else {
            cursorInfo.textContent = 'Hover over grid to preview';
        }
    }
    
    closeGridMode() {
        // Save current tile data before closing
        if (this.currentGridTile !== null) {
            this.saveTileData(this.currentGridTile.row, this.currentGridTile.col);
        }
        
        // Hide grid navigation container
        const gridContainer = document.getElementById('grid-navigation-container');
        if (gridContainer) {
            gridContainer.style.display = 'none';
        }
        
        // Deactivate grid mode
        this.gridNavigationActive = false;
        
        // Clear grid data (but keep gridTileData for potential re-opening)
        this.largeImage = null;
        this.largeImageData = null;
        this.currentGridTile = null;
        this.gridHoverTile = null;
        
        // Clear the grid navigator canvas
        if (this.gridNavigatorCanvas) {
            this.gridNavigatorCtx.clearRect(0, 0, this.gridNavigatorCanvas.width, this.gridNavigatorCanvas.height);
        }
        
        this.setStatus('Grid mode closed', 'info');
    }
    
    exportGridData() {
        // Save current tile data first
        if (this.currentGridTile !== null) {
            this.saveTileData(this.currentGridTile.row, this.currentGridTile.col);
        }
        
        console.log('Exporting grid data...', {
            tiles: this.gridTileData.size,
            phases: this.phases.size
        });
        
        // Create XML document
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<GridDataExport>\n';
        xml += `  <ImageInfo>\n`;
        xml += `    <Filename>${this.escapeXml(this.largeImageOriginalFilename || 'unknown')}</Filename>\n`;
        xml += `    <GridSize>${this.gridSize}</GridSize>\n`;
        xml += `    <GridCols>${this.gridCols}</GridCols>\n`;
        xml += `    <GridRows>${this.gridRows}</GridRows>\n`;
        xml += `    <TileWidth>${this.gridTileWidth}</TileWidth>\n`;
        xml += `    <TileHeight>${this.gridTileHeight}</TileHeight>\n`;
        xml += `    <ExportDate>${new Date().toISOString()}</ExportDate>\n`;
        xml += `  </ImageInfo>\n`;
        
        // Export phase definitions
        xml += '  <Phases>\n';
        for (const [id, phase] of this.phases) {
            xml += `    <Phase id="${id}">\n`;
            xml += `      <Name>${this.escapeXml(phase.name)}</Name>\n`;
            xml += `      <Color>${this.escapeXml(phase.color)}</Color>\n`;
            xml += `    </Phase>\n`;
        }
        xml += '  </Phases>\n';
        
        // Export tile data
        xml += '  <Tiles>\n';
        for (const [tileKey, tileData] of this.gridTileData) {
            const [row, col] = tileKey.split('_').map(Number);
            
            // Calculate global pixel coordinates for this tile
            const startX = col * this.gridTileWidth;
            const startY = row * this.gridTileHeight;
            
            xml += `    <Tile row="${row}" col="${col}" startX="${startX}" startY="${startY}">\n`;
            
            // Export markers
            if (tileData.markers && tileData.markers.length > 0) {
                xml += '      <Markers>\n';
                for (const marker of tileData.markers) {
                    // Convert local tile coordinates to global image coordinates
                    const globalX = startX + marker.x;
                    const globalY = startY + marker.y;
                    
                    xml += `        <Marker phaseId="${marker.phaseId}" `;
                    xml += `localX="${marker.x}" localY="${marker.y}" `;
                    xml += `globalX="${globalX}" globalY="${globalY}" />\n`;
                }
                xml += '      </Markers>\n';
            }
            
            // Export LAB zones
            if (tileData.zones && tileData.zones.length > 0) {
                xml += '      <LABZones>\n';
                for (let i = 0; i < tileData.zones.length; i++) {
                    const zone = tileData.zones[i];
                    xml += `        <Zone index="${i}" phaseId="${zone.phaseId}" type="${zone.type}">\n`;
                    
                    if (zone.type === 'polygon' && zone.vertices) {
                        xml += '          <Vertices>\n';
                        for (const vertex of zone.vertices) {
                            const globalX = startX + vertex.x;
                            const globalY = startY + vertex.y;
                            xml += `            <Vertex localX="${vertex.x}" localY="${vertex.y}" globalX="${globalX}" globalY="${globalY}" />\n`;
                        }
                        xml += '          </Vertices>\n';
                    } else if (zone.type === 'circle') {
                        const globalCenterX = startX + zone.centerX;
                        const globalCenterY = startY + zone.centerY;
                        xml += `          <Circle localCenterX="${zone.centerX}" localCenterY="${zone.centerY}" `;
                        xml += `globalCenterX="${globalCenterX}" globalCenterY="${globalCenterY}" radius="${zone.radius}" />\n`;
                    }
                    
                    xml += '        </Zone>\n';
                }
                xml += '      </LABZones>\n';
            }
            
            // Export B/C zones
            if (tileData.bcZones && tileData.bcZones.length > 0) {
                xml += '      <BCZones>\n';
                for (let i = 0; i < tileData.bcZones.length; i++) {
                    const zone = tileData.bcZones[i];
                    xml += `        <BCZone index="${i}" type="${zone.type || 'B'}">\n`;
                    xml += '          <Vertices>\n';
                    for (const vertex of zone.vertices) {
                        const globalX = startX + vertex.x;
                        const globalY = startY + vertex.y;
                        xml += `            <Vertex localX="${vertex.x}" localY="${vertex.y}" globalX="${globalX}" globalY="${globalY}" />\n`;
                    }
                    xml += '          </Vertices>\n';
                    xml += '        </BCZone>\n';
                }
                xml += '      </BCZones>\n';
            }
            
            xml += '    </Tile>\n';
        }
        xml += '  </Tiles>\n';
        xml += '</GridDataExport>';
        
        // Download the XML file
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = (this.largeImageOriginalFilename || 'image').replace(/\.[^.]+$/, '');
        a.download = `${filename}_grid_data_${timestamp}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.setStatus(`Grid data exported: ${this.gridTileData.size} tiles with data`, 'success');
    }
    
    escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    addNewPhase() {
        const nameInput = document.getElementById('new-phase-name');
        const colorInput = document.getElementById('new-phase-color');
        
        const name = nameInput.value.trim();
        const color = colorInput.value;
        
        if (!name) {
            this.setStatus('Please enter a phase name', 'error');
            return;
        }
        
        // Check if name already exists
        for (const [id, phase] of this.phases) {
            if (phase.name.toLowerCase() === name.toLowerCase()) {
                this.setStatus('Phase name already exists', 'error');
                return;
            }
        }
        
        const phaseId = this.phaseIdCounter++;
        this.phases.set(phaseId, { 
            name, 
            color,
            zone: null  // Will store polygon vertices in ternary coordinates
        });
        
        this.renderPhasesList();
        this.selectPhase(phaseId);
        
        // Clear inputs
        nameInput.value = '';
        colorInput.value = this.getRandomColor();
        
        // Update phase statistics display
        this.updatePhaseStatistics();
        
        this.setStatus(`Added new phase: ${name}`, 'success');
    }
    
    selectPhase(phaseId) {
        this.currentPhaseId = phaseId;
        this.updateCurrentPhaseDisplay();
        this.updatePhasesListSelection();
        this.highlightPhaseMarkers(phaseId);
        this.updateCursor();
        
        // Update LAB graphs to show selection for current phase
        // (Don't invalidate cache - we're just changing selection, not data)
        this.drawLABGraphs();
        
        // Clear sampling stats when switching phases
        document.getElementById('sampling-stats').innerHTML = '<p class="text-gray-500 italic">No samples yet. Click on image to sample pixels.</p>';
        
        // If phase has stored targetRGB, show it
        const phase = this.phases.get(phaseId);
        if (phase.targetRGB) {
            const hex = `#${phase.targetRGB[0].toString(16).padStart(2,'0')}${phase.targetRGB[1].toString(16).padStart(2,'0')}${phase.targetRGB[2].toString(16).padStart(2,'0')}`;
            document.getElementById('sampled-rgb').textContent = `(${phase.targetRGB[0]}, ${phase.targetRGB[1]}, ${phase.targetRGB[2]})`;
            document.getElementById('sampled-hex').textContent = hex;
            document.getElementById('sampled-color-preview').style.backgroundColor = hex;
            
            if (phase.tolerance) {
                document.getElementById('color-tolerance').value = phase.tolerance;
                document.getElementById('color-tolerance-value').textContent = phase.tolerance;
                this.colorTolerance = phase.tolerance;
            }
        } else {
            document.getElementById('sampled-rgb').textContent = '-';
            document.getElementById('sampled-hex').textContent = '-';
            document.getElementById('sampled-color-preview').style.backgroundColor = '#e5e7eb';
        }
    }
    
    deletePhase(phaseId) {
        if (this.phases.has(phaseId)) {
            const phaseName = this.phases.get(phaseId).name;
            this.phases.delete(phaseId);
            
            if (this.currentPhaseId === phaseId) {
                this.currentPhaseId = null;
            }
            
            this.renderPhasesList();
            this.updateCurrentPhaseDisplay();
            this.setStatus(`Deleted phase: ${phaseName}`, 'info');
        }
    }
    
    renderPhasesList() {
        const container = document.getElementById('phases-list');
        container.innerHTML = '';
        
        if (this.phases.size === 0) {
            container.innerHTML = '<p class="text-gray-500 italic">No phases added yet</p>';
            return;
        }
        
        for (const [phaseId, phase] of this.phases) {
            const phaseElement = document.createElement('div');
            phaseElement.className = `phase-item flex flex-col p-3 border-2 rounded-md transition-all cursor-pointer hover:shadow-md ${
                this.currentPhaseId === phaseId ? 'bg-blue-50 border-blue-400 shadow-lg' : 'border-gray-200'
            }`;
            
            // Zone status indicators
            const hasRGBRanges = phase.hasRGBRanges || false;
            const hasBCZone = phase.bcZone && phase.bcZone.length > 0;
            
            phaseElement.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3 flex-1" onclick="segmentation.selectPhase(${phaseId})">
                        <div class="w-8 h-8 rounded-full border-2 border-gray-400 shadow-sm" style="background-color: ${phase.color}"></div>
                        <div class="flex-1">
                            <div class="font-semibold text-gray-800">${phase.name}</div>
                            <div class="text-xs text-gray-600 mt-1">
                                <span class="mr-3">RGB: ${hasRGBRanges ? '<span class="text-green-600 font-bold">✓</span>' : '<span class="text-gray-400">○</span>'}</span>
                                <span>B/C: ${hasBCZone ? '<span class="text-purple-600 font-bold">✓</span>' : '<span class="text-gray-400">○</span>'}</span>
                            </div>
                        </div>
                    </div>
                    <button onclick="segmentation.deletePhase(${phaseId}); event.stopPropagation();" 
                            class="text-red-500 hover:text-red-700 p-1 ml-2">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
                        </svg>
                    </button>
                </div>
            `;
            
            container.appendChild(phaseElement);
        }
        
        // Also update phase zone controls
        this.renderPhaseZoneControls();
        // And RGB channel controls
        this.renderRGBChannelControls();
    }
    
    renderPhaseZoneControls() {
        const container = document.getElementById('phase-zone-controls-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.phases.size === 0) {
            container.innerHTML = '<p class="text-gray-500 italic text-xs">No phases yet. Add phases to see controls.</p>';
            return;
        }
        
        for (const [phaseId, phase] of this.phases) {
            const isSelected = this.currentPhaseId === phaseId;
            const hasBCZone = phase.bcZone && phase.bcZone.length > 0;
            const hasLABRanges = phase.labRanges ? true : false;
            
            const phaseBox = document.createElement('div');
            phaseBox.className = `border-2 rounded-lg p-2 transition-all ${
                isSelected ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-gray-300 bg-white'
            }`;
            
            // Get LAB range display text
            let labRangeText = '';
            if (hasLABRanges) {
                labRangeText = `
                    <div class="text-xs mt-2 p-1.5 bg-purple-50 rounded border border-purple-200">
                        <div class="font-semibold text-purple-800 mb-0.5">LAB Ranges:</div>
                        <div class="text-xs text-gray-700 space-y-0.5">
                            <div>L: ${phase.labRanges.L.min.toFixed(1)} - ${phase.labRanges.L.max.toFixed(1)}</div>
                            <div>a: ${phase.labRanges.a.min.toFixed(1)} - ${phase.labRanges.a.max.toFixed(1)}</div>
                            <div>b: ${phase.labRanges.b.min.toFixed(1)} - ${phase.labRanges.b.max.toFixed(1)}</div>
                        </div>
                    </div>
                `;
            }
            
            phaseBox.innerHTML = `
                <div class="flex items-center justify-between mb-2 cursor-pointer" onclick="segmentation.selectPhase(${phaseId})">
                    <div class="flex items-center gap-1.5">
                        <div class="w-4 h-4 rounded-full border-2 border-gray-400" style="background-color: ${phase.color}"></div>
                        <span class="font-semibold text-sm text-gray-800">${phase.name}</span>
                        ${isSelected ? '<span class="ml-1 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">SELECTED</span>' : ''}
                    </div>
                    <div class="text-xs text-gray-600">
                        LAB: ${hasLABRanges ? '<span class="text-purple-600 font-bold">✓</span>' : '<span class="text-gray-400">○</span>'}
                        B/C: ${hasBCZone ? '<span class="text-yellow-600 font-bold">✓</span>' : '<span class="text-gray-400">○</span>'}
                    </div>
                </div>
                
                <div class="space-y-1.5">
                    <!-- LAB Zone Controls -->
                    <div class="bg-purple-50 border border-purple-200 rounded p-1.5">
                        <div class="text-xs font-semibold text-purple-800 mb-1">LAB Zone (Drag on graphs):</div>
                        <div class="grid grid-cols-2 gap-1">
                            <button onclick="segmentation.setDefaultLABRangesForPhase(${phaseId}); event.stopPropagation();" 
                                    class="px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors text-xs font-medium">
                                🎨 Set from Samples
                            </button>
                            <button onclick="segmentation.clearLABRangesForPhase(${phaseId}); event.stopPropagation();" 
                                    class="px-2 py-1 ${hasLABRanges ? 'bg-orange-400' : 'bg-gray-300'} text-white rounded hover:opacity-90 transition-colors text-xs">
                                Clear LAB
                            </button>
                        </div>
                        ${labRangeText}
                    </div>
                    
                    <!-- B/C Zone Controls -->
                    <div class="bg-yellow-50 border border-yellow-200 rounded p-1.5">
                        <div class="text-xs font-semibold text-yellow-800 mb-1">B/C Zone Mode:</div>
                        <div class="grid grid-cols-2 gap-1 mb-1">
                            <button onclick="segmentation.selectPhaseAndDrawBC(${phaseId}, 'polygon'); event.stopPropagation();" 
                                    class="px-2 py-1 ${phase.bcZoneMode === 'polygon' || !phase.bcZoneMode ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'} rounded text-xs hover:opacity-90 transition-all font-medium">
                                📐 Polygon
                            </button>
                            <button onclick="segmentation.selectPhaseAndDrawBC(${phaseId}, 'circle'); event.stopPropagation();" 
                                    class="px-2 py-1 ${phase.bcZoneMode === 'circle' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'} rounded text-xs hover:opacity-90 transition-all font-medium">
                                ⭕ Circle
                            </button>
                        </div>
                        <button onclick="segmentation.startBCZoneDrawingForPhase(${phaseId}); event.stopPropagation();" 
                                class="w-full px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-xs font-medium">
                            💡 Draw B/C Zone
                        </button>
                        ${hasBCZone ? `
                        <button onclick="segmentation.clearBCZoneForPhase(${phaseId}); event.stopPropagation();" 
                                class="w-full px-2 py-1 mt-1 bg-orange-400 text-white rounded hover:bg-orange-500 transition-colors text-xs">
                            Clear B/C Zone
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
            
            container.appendChild(phaseBox);
        }
    }
    
    renderRGBChannelControls() {
        const container = document.getElementById('rgb-channels-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.phases.size === 0) {
            container.innerHTML = '<p class="text-gray-500 italic text-sm text-center">No phases yet. Add phases to set RGB ranges.</p>';
            return;
        }
        
        for (const [phaseId, phase] of this.phases) {
            const isSelected = this.currentPhaseId === phaseId;
            
            // Initialize RGB ranges if not set
            if (!phase.rgbRanges) {
                phase.rgbRanges = {
                    r: { min: 0, max: 255 },
                    g: { min: 0, max: 255 },
                    b: { min: 0, max: 255 }
                };
            }
            
            const phaseBox = document.createElement('div');
            phaseBox.className = `border-2 rounded-lg p-3 transition-all ${
                isSelected ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-gray-300 bg-white'
            }`;
            
            phaseBox.innerHTML = `
                <div class="flex items-center justify-between mb-3 cursor-pointer" onclick="segmentation.selectPhase(${phaseId})">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full border-2 border-gray-400" style="background-color: ${phase.color}"></div>
                        <span class="font-semibold text-gray-800">${phase.name}</span>
                        ${isSelected ? '<span class="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded">SELECTED</span>' : ''}
                    </div>
                </div>
                
                <!-- Red Channel -->
                <div class="mb-3">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-red-600">🔴 Red (R)</span>
                        <span class="text-xs font-mono text-gray-700">${phase.rgbRanges.r.min} - ${phase.rgbRanges.r.max}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <input type="number" min="0" max="255" value="${phase.rgbRanges.r.min}" 
                               onchange="segmentation.updateRGBRange(${phaseId}, 'r', 'min', this.value)"
                               class="px-2 py-1 border border-gray-300 rounded text-xs w-full" placeholder="Min">
                        <input type="number" min="0" max="255" value="${phase.rgbRanges.r.max}" 
                               onchange="segmentation.updateRGBRange(${phaseId}, 'r', 'max', this.value)"
                               class="px-2 py-1 border border-gray-300 rounded text-xs w-full" placeholder="Max">
                    </div>
                </div>
                
                <!-- Green Channel -->
                <div class="mb-3">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-green-600">🟢 Green (G)</span>
                        <span class="text-xs font-mono text-gray-700">${phase.rgbRanges.g.min} - ${phase.rgbRanges.g.max}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <input type="number" min="0" max="255" value="${phase.rgbRanges.g.min}" 
                               onchange="segmentation.updateRGBRange(${phaseId}, 'g', 'min', this.value)"
                               class="px-2 py-1 border border-gray-300 rounded text-xs w-full" placeholder="Min">
                        <input type="number" min="0" max="255" value="${phase.rgbRanges.g.max}" 
                               onchange="segmentation.updateRGBRange(${phaseId}, 'g', 'max', this.value)"
                               class="px-2 py-1 border border-gray-300 rounded text-xs w-full" placeholder="Max">
                    </div>
                </div>
                
                <!-- Blue Channel -->
                <div class="mb-2">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-blue-600">🔵 Blue (B)</span>
                        <span class="text-xs font-mono text-gray-700">${phase.rgbRanges.b.min} - ${phase.rgbRanges.b.max}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <input type="number" min="0" max="255" value="${phase.rgbRanges.b.min}" 
                               onchange="segmentation.updateRGBRange(${phaseId}, 'b', 'min', this.value)"
                               class="px-2 py-1 border border-gray-300 rounded text-xs w-full" placeholder="Min">
                        <input type="number" min="0" max="255" value="${phase.rgbRanges.b.max}" 
                               onchange="segmentation.updateRGBRange(${phaseId}, 'b', 'max', this.value)"
                               class="px-2 py-1 border border-gray-300 rounded text-xs w-full" placeholder="Max">
                    </div>
                </div>
            `;
            
            container.appendChild(phaseBox);
        }
    }
    
    updateRGBRange(phaseId, channel, type, value) {
        const phase = this.phases.get(phaseId);
        if (!phase) return;
        
        const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
        phase.rgbRanges[channel][type] = numValue;
        
        // Mark that this phase has RGB ranges defined
        phase.hasRGBRanges = true;
        
        this.renderRGBChannelControls();
        this.renderPhasesList();
    }
    
    selectPhaseAndDrawBC(phaseId, mode) {
        this.selectPhase(phaseId);
        const phase = this.phases.get(phaseId);
        if (phase) {
            phase.bcZoneMode = mode;
            this.currentDrawingMode = mode;
        }
        this.renderPhaseZoneControls();
    }
    
    clearBCZoneForPhase(phaseId) {
        const phase = this.phases.get(phaseId);
        if (phase) {
            phase.bcZone = null;
            this.renderPhaseZoneControls();
            this.renderPhasesList();
            this.drawBrightnessContrastPlot();
            this.setStatus(`B/C zone cleared for ${phase.name}`, 'info');
        }
    }
    
    updateCurrentPhaseDisplay() {
        const colorElement = document.getElementById('current-phase-color');
        const nameElement = document.getElementById('current-phase-name');
        
        if (this.currentPhaseId && this.phases.has(this.currentPhaseId)) {
            const phase = this.phases.get(this.currentPhaseId);
            colorElement.style.backgroundColor = phase.color;
            nameElement.textContent = phase.name;
        } else {
            colorElement.style.backgroundColor = '#gray';
            nameElement.textContent = 'No phase selected';
        }
    }
    
    updatePhasesListSelection() {
        this.renderPhasesList();
    }
    
    getRandomColor() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    async loadImage(imageSource = null) {
        console.log('Loading image...');
        
        // Show loading indicator, hide placeholder
        const loadingIndicator = document.getElementById('loading-indicator');
        const placeholder = document.getElementById('no-image-placeholder');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
        if (placeholder) {
            placeholder.style.display = 'none';
        }
        
        try {
            let img = new Image();
            
            if (imageSource) {
                // Load from uploaded file
                console.log('Loading uploaded image');
                img.onload = () => {
                    this.setupImageOnCanvas(img);
                };
                img.onerror = (error) => {
                    console.error('Error loading uploaded image:', error);
                    alert('Failed to load the uploaded image. Please try a different file.');
                    // Show placeholder again on error
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                    if (placeholder) placeholder.style.display = 'flex';
                };
                img.src = imageSource;
            } else {
                // Load from server (example image)
                console.log('Fetching image from /get_image');
                const response = await fetch('/get_image');
                console.log('Response received:', response.status);
                const data = await response.json();
                console.log('Data parsed:', data);
                
                img.onload = () => {
                    this.setupImageOnCanvas(img);
                };
                img.onerror = (error) => {
                    console.error('Error loading image:', error);
                    this.setStatus('Failed to load image', 'error');
                    // Show placeholder again on error
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                    if (placeholder) placeholder.style.display = 'flex';
                };
                // data.image already contains the full data URL
                img.src = data.image;
            }
        } catch (error) {
            console.error('Error in loadImage:', error);
            this.setStatus('Error loading image', 'error');
            // Show placeholder again on error
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
        }
    }
    
    setupImageOnCanvas(img) {
        console.log('Image loaded successfully');
        this.image = img;
        
        // Set canvas dimensions to match image exactly
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.overlayCanvas.width = img.width;
        this.overlayCanvas.height = img.height;
        
        console.log(`Canvas size set to: ${img.width}x${img.height}`);
        
        // Calculate initial zoom to fit viewport
        const maxWidth = window.innerWidth * 0.7;
        const maxHeight = window.innerHeight * 0.7;
        
        let initialZoom = 1.0;
        
        // Scale down if image is too large
        if (img.width > maxWidth || img.height > maxHeight) {
            const scaleX = maxWidth / img.width;
            const scaleY = maxHeight / img.height;
            initialZoom = Math.min(scaleX, scaleY);
        }
        
        // Set initial zoom
        this.zoomLevel = initialZoom;
        this.setZoom(initialZoom);
        
        // Draw image
        this.ctx.drawImage(img, 0, 0);
        console.log('Image drawn to canvas');
        
        // Hide loading indicator and placeholder
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        
        const placeholder = document.getElementById('no-image-placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }
        
        // Make canvas visible
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.style.display = 'block';
        }
        
        this.setStatus('Image loaded successfully. Add phases to start annotating.', 'success');
    }

    
    drawSampleMarker(x, y, color) {
        const ctx = this.overlayCtx;
        
        // Draw cross marker
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Vertical line
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x, y + 8);
        
        // Horizontal line
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x + 8, y);
        
        ctx.stroke();
        
        // Draw circle around it
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.stroke();
    }
    
    async samplePixel(e) {
        if (!this.currentPhaseId) {
            this.setStatus('⚠️ Please select a phase first before sampling', 'warning');
            return;
        }
        
        const pos = this.getMousePos(e);
        
        try {
            const response = await fetch('/sample_pixel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    x: pos.x, 
                    y: pos.y,
                    phase_id: this.currentPhaseId
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                this.sampledRGB = data.rgb;
                
                // Store sample in phase
                const phase = this.phases.get(this.currentPhaseId);
                if (!phase.samples) {
                    phase.samples = [];
                }
                phase.samples.push({
                    x: pos.x,
                    y: pos.y,
                    rgb: data.rgb
                });
                
                // Draw visual marker on overlay
                this.drawSampleMarker(pos.x, pos.y, phase.color);
                
                // Update last sampled color display
                document.getElementById('sampled-rgb').textContent = `(${data.rgb[0]}, ${data.rgb[1]}, ${data.rgb[2]})`;
                document.getElementById('sampled-hex').textContent = data.hex;
                document.getElementById('sampled-color-preview').style.backgroundColor = data.hex;
                
                // Update statistics display
                if (data.stats) {
                    this.updateSamplingStats(data.stats);
                    
                    // Auto-suggest tolerance based on color variance
                    const suggestedTolerance = Math.max(15, Math.min(50, Math.ceil(data.stats.color_variance * 2)));
                    const suggestionText = `Suggested: ${suggestedTolerance} (based on color variation: ${data.stats.color_variance.toFixed(1)})`;
                    document.getElementById('tolerance-suggestion').textContent = suggestionText;
                    
                    // Auto-set tolerance
                    document.getElementById('color-tolerance').value = suggestedTolerance;
                    document.getElementById('color-tolerance-value').textContent = suggestedTolerance;
                    this.colorTolerance = suggestedTolerance;
                    
                    // Store in phase
                    phase.targetRGB = data.stats.mean_rgb;
                    phase.tolerance = suggestedTolerance;
                } else {
                    phase.targetRGB = data.rgb;
                    phase.tolerance = this.colorTolerance;
                }
                
                // Update ternary plot
                this.drawTernaryPlot();
                
                // Invalidate cached LAB ranges since we added new samples
                console.log('❌ LAB cache invalidated: new sample added');
                this.cachedLABDataRanges = null;
                
                // Update LAB graphs
                this.drawLABGraphs();
                
                this.setStatus(`✓ Sample #${phase.samples.length}: ${data.hex} at (${pos.x}, ${pos.y})`, 'success');
            } else {
                this.setStatus(`❌ ${data.message || 'Error sampling pixel'}`, 'error');
            }
        } catch (error) {
            console.error('Error sampling pixel:', error);
            this.setStatus('❌ Error sampling pixel', 'error');
        }
    }
    
    updateSamplingStats(stats) {
        const container = document.getElementById('sampling-stats');
        
        const meanHex = `#${stats.mean_rgb[0].toString(16).padStart(2,'0')}${stats.mean_rgb[1].toString(16).padStart(2,'0')}${stats.mean_rgb[2].toString(16).padStart(2,'0')}`;
        const phase = this.phases.get(this.currentPhaseId);
        const phaseName = phase ? phase.name : 'Unknown Phase';
        const phaseColor = phase ? phase.color : '#666';
        
        container.innerHTML = `
            <div class="grid grid-cols-2 gap-2">
                <div class="col-span-2 pb-2 border-b border-purple-300 flex items-center justify-between">
                    <p class="font-semibold text-purple-900">Samples: ${stats.count}</p>
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded border-2" style="background-color: ${phaseColor}; border-color: ${phaseColor}"></div>
                        <span class="text-sm font-semibold" style="color: ${phaseColor}">${phaseName}</span>
                    </div>
                </div>
                
                <div class="col-span-2">
                    <p class="font-semibold text-gray-700">Mean Color:</p>
                    <div class="flex items-center gap-2 mt-1">
                        <div class="w-10 h-10 rounded border-2 border-gray-400" style="background-color: ${meanHex}"></div>
                        <div class="text-xs">
                            <p class="font-mono">RGB: (${stats.mean_rgb[0]}, ${stats.mean_rgb[1]}, ${stats.mean_rgb[2]})</p>
                            <p class="font-mono">${meanHex}</p>
                        </div>
                    </div>
                </div>
                
                <div class="col-span-2 pt-2 border-t border-purple-200">
                    <p class="font-semibold text-gray-700">Color Variation:</p>
                    <div class="text-xs space-y-1 mt-1">
                        <p>Std Dev: <span class="font-mono">R:${stats.std_rgb[0].toFixed(1)} G:${stats.std_rgb[1].toFixed(1)} B:${stats.std_rgb[2].toFixed(1)}</span></p>
                        <p>Range: <span class="font-mono">R:${stats.min_rgb[0]}-${stats.max_rgb[0]} G:${stats.min_rgb[1]}-${stats.max_rgb[1]} B:${stats.min_rgb[2]}-${stats.max_rgb[2]}</span></p>
                        <p class="text-purple-700"><strong>Avg Variation: ${stats.color_variance.toFixed(1)}</strong></p>
                    </div>
                </div>
            </div>
        `;
        
        // Also update phase statistics display
        this.updatePhaseStatistics();
    }
    
    updatePhaseStatistics() {
        const container = document.getElementById('phase-statistics-container');
        if (!container) return;
        
        if (this.phases.size === 0) {
            container.innerHTML = '<p class="text-gray-500 italic text-center">No phases yet. Add phases to see statistics.</p>';
            return;
        }
        
        let html = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
        
        for (const [phaseId, phase] of this.phases) {
            const sampleCount = phase.samples ? phase.samples.length : 0;
            const hasData = sampleCount > 0 && phase.targetRGB;
            
            let statsContent = '';
            if (hasData) {
                const meanRGB = phase.targetRGB;
                const meanHex = `#${meanRGB[0].toString(16).padStart(2,'0')}${meanRGB[1].toString(16).padStart(2,'0')}${meanRGB[2].toString(16).padStart(2,'0')}`;
                const tolerance = phase.tolerance || this.colorTolerance;
                
                statsContent = `
                    <div class="flex items-center gap-2 mb-2">
                        <div class="w-12 h-12 rounded border-2 border-gray-400" style="background-color: ${meanHex}"></div>
                        <div class="text-xs">
                            <p class="font-mono">RGB: (${meanRGB[0]}, ${meanRGB[1]}, ${meanRGB[2]})</p>
                            <p class="font-mono">${meanHex}</p>
                        </div>
                    </div>
                    <div class="text-xs space-y-1">
                        <p><span class="font-semibold">Samples:</span> ${sampleCount}</p>
                        <p><span class="font-semibold">Tolerance:</span> ±${tolerance}</p>
                    </div>
                `;
            } else {
                statsContent = `
                    <p class="text-gray-500 italic text-sm">No sample data yet</p>
                    <p class="text-xs text-gray-400 mt-1">Click on image to sample pixels</p>
                `;
            }
            
            html += `
                <div class="p-4 rounded-lg border-2 transition-all hover:shadow-lg cursor-pointer ${
                    this.currentPhaseId === phaseId ? 'ring-2 ring-blue-400' : ''
                }" 
                     style="border-color: ${phase.color}; background: linear-gradient(to bottom right, rgba(255,255,255,0.95), rgba(255,255,255,0.8));"
                     onclick="segmentation.selectPhase(${phaseId})">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-full border-2" style="background-color: ${phase.color}; border-color: ${phase.color}"></div>
                            <h3 class="font-bold text-lg" style="color: ${phase.color}">${phase.name}</h3>
                        </div>
                        ${this.currentPhaseId === phaseId ? '<span class="text-xs bg-blue-500 text-white px-2 py-1 rounded">ACTIVE</span>' : ''}
                    </div>
                    ${statsContent}
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    async clearSamples() {
        if (!this.currentPhaseId) {
            this.setStatus('Please select a phase first', 'warning');
            return;
        }
        
        try {
            await fetch('/clear_samples', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ phase_id: this.currentPhaseId })
            });
            
            // Clear frontend samples
            const phase = this.phases.get(this.currentPhaseId);
            if (phase) {
                phase.samples = [];
                phase.targetRGB = null;
                phase.tolerance = this.colorTolerance;
            }
            
            // Update UI
            document.getElementById('sampling-stats').innerHTML = '<p class="text-gray-500 italic">No samples yet. Click on image to sample pixels.</p>';
            document.getElementById('tolerance-suggestion').textContent = '';
            
            // Update plot
            this.drawTernaryPlot();
            
            // Update phase statistics display
            this.updatePhaseStatistics();
            
            this.setStatus('Samples cleared for current phase', 'info');
        } catch (error) {
            console.error('Error clearing samples:', error);
            this.setStatus('Error clearing samples', 'error');
        }
    }
    
    saveClassification() {
        if (this.phases.size === 0) {
            this.setStatus('No phases to save', 'warning');
            return;
        }
        
        const xml = this.exportClassificationXML();
        
        // Download the XML file
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `classification_${new Date().toISOString().replace(/[:.]/g, '-')}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.setStatus('Classification saved successfully', 'success');
    }
    
    // Check if classification can be exported (at least one phase with LAB ranges)
    checkCanExportClassification() {
        if (this.phases.size === 0) return false;
        
        // Check if at least one phase has been classified (has LAB ranges)
        for (const [phaseId, phase] of this.phases) {
            if (phase.labRanges) {
                return true;
            }
        }
        return false;
    }
    
    // Export classification as XML string (without downloading)
    exportClassificationXML() {
        // Build XML document
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<Classification>\n';
        xml += '  <Metadata>\n';
        xml += `    <CreatedDate>${new Date().toISOString()}</CreatedDate>\n`;
        xml += `    <PhaseCount>${this.phases.size}</PhaseCount>\n`;
        xml += '  </Metadata>\n';
        xml += '  <Phases>\n';
        
        for (const [phaseId, phase] of this.phases) {
            xml += `    <Phase id="${phaseId}">\n`;
            xml += `      <Name>${this.escapeXml(phase.name)}</Name>\n`;
            xml += `      <Color>${phase.color}</Color>\n`;
            
            // Save LAB ranges if available
            if (phase.labRanges) {
                xml += '      <LABRanges>\n';
                xml += `        <L min="${phase.labRanges.L.min}" max="${phase.labRanges.L.max}" />\n`;
                xml += `        <A min="${phase.labRanges.a.min}" max="${phase.labRanges.a.max}" />\n`;
                xml += `        <B min="${phase.labRanges.b.min}" max="${phase.labRanges.b.max}" />\n`;
                xml += '      </LABRanges>\n';
            }
            
            // Save samples
            if (phase.samples && phase.samples.length > 0) {
                xml += '      <Samples>\n';
                for (const sample of phase.samples) {
                    xml += `        <Sample x="${sample.x}" y="${sample.y}">\n`;
                    xml += `          <RGB r="${sample.rgb[0]}" g="${sample.rgb[1]}" b="${sample.rgb[2]}" />\n`;
                    xml += '        </Sample>\n';
                }
                xml += '      </Samples>\n';
            }
            
            // Save RGB ternary zone
            if (phase.zone && phase.zone.length > 0) {
                xml += '      <RGBZone>\n';
                for (const vertex of phase.zone) {
                    xml += `        <Vertex x="${vertex.x}" y="${vertex.y}" />\n`;
                }
                xml += '      </RGBZone>\n';
            }
            
            // Save Brightness/Contrast zone
            if (phase.bcZone && phase.bcZone.length > 0) {
                xml += '      <BCZone>\n';
                for (const vertex of phase.bcZone) {
                    xml += `        <Vertex brightness="${vertex.brightness}" contrast="${vertex.contrast}" />\n`;
                }
                xml += '      </BCZone>\n';
            }
            
            xml += '    </Phase>\n';
        }
        
        xml += '  </Phases>\n';
        xml += '</Classification>\n';
        
        return xml;
    }
    
    escapeXml(text) {
        return text.replace(/[<>&\"']/g, (char) => {
            switch (char) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\"': return '&quot;';
                case "'": return '&apos;';
                default: return char;
            }
        });
    }
    
    async loadClassification(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const xmlText = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
                
                // Check for parsing errors
                const parserError = xmlDoc.querySelector('parsererror');
                if (parserError) {
                    throw new Error('Invalid XML file');
                }
                
                // Clear existing phases
                this.phases.clear();
                this.currentPhaseId = null;
                this.phaseIdCounter = 1;
                
                // Parse phases
                const phaseElements = xmlDoc.querySelectorAll('Phase');
                for (const phaseEl of phaseElements) {
                    const phaseId = parseInt(phaseEl.getAttribute('id'));
                    const name = phaseEl.querySelector('Name').textContent;
                    const color = phaseEl.querySelector('Color').textContent;
                    
                    const phase = {
                        name: name,
                        color: color,
                        samples: [],
                        zone: null,
                        bcZone: null
                    };
                    
                    // Load samples
                    const sampleElements = phaseEl.querySelectorAll('Sample');
                    for (const sampleEl of sampleElements) {
                        const x = parseInt(sampleEl.getAttribute('x'));
                        const y = parseInt(sampleEl.getAttribute('y'));
                        const rgbEl = sampleEl.querySelector('RGB');
                        const r = parseInt(rgbEl.getAttribute('r'));
                        const g = parseInt(rgbEl.getAttribute('g'));
                        const b = parseInt(rgbEl.getAttribute('b'));
                        
                        phase.samples.push({ x, y, rgb: [r, g, b] });
                    }
                    
                    // Load RGB zone
                    const rgbZoneEl = phaseEl.querySelector('RGBZone');
                    if (rgbZoneEl) {
                        const vertices = [];
                        const vertexElements = rgbZoneEl.querySelectorAll('Vertex');
                        for (const vertexEl of vertexElements) {
                            const x = parseFloat(vertexEl.getAttribute('x'));
                            const y = parseFloat(vertexEl.getAttribute('y'));
                            vertices.push({ x, y });
                        }
                        phase.zone = vertices;
                    }
                    
                    // Load BC zone (now using brightness and contrast properties)
                    const bcZoneEl = phaseEl.querySelector('BCZone');
                    if (bcZoneEl) {
                        const vertices = [];
                        const vertexElements = bcZoneEl.querySelectorAll('Vertex');
                        for (const vertexEl of vertexElements) {
                            // Try new format first (brightness/contrast)
                            const brightness = vertexEl.getAttribute('brightness');
                            const contrast = vertexEl.getAttribute('contrast');
                            
                            if (brightness !== null && contrast !== null) {
                                // New format
                                vertices.push({ 
                                    brightness: parseFloat(brightness), 
                                    contrast: parseFloat(contrast) 
                                });
                            } else {
                                // Old format fallback (x/y) - convert to brightness/contrast
                                // Assuming old format used canvas coordinates, we can't reliably convert
                                // so we'll skip old format zones
                                console.warn('Skipping old-format B/C zone vertex');
                            }
                        }
                        if (vertices.length > 0) {
                            phase.bcZone = vertices;
                        }
                    }
                    
                    this.phases.set(phaseId, phase);
                    this.phaseIdCounter = Math.max(this.phaseIdCounter, phaseId + 1);
                }
                
                // Update UI
                this.renderPhasesList();
                this.drawTernaryPlot();
                this.drawBrightnessContrastPlot();
                
                // Invalidate LAB cache since we loaded new data
                console.log('❌ LAB cache invalidated: XML loaded');
                this.cachedLABDataRanges = null;
                this.drawLABGraphs();
                this.updatePhaseStatistics();
                
                this.setStatus(`Loaded ${this.phases.size} phases from file`, 'success');
                
                // Automatically transfer to batch processor if available
                if (window.batchProcessor && this.checkCanExportClassification()) {
                    setTimeout(() => {
                        try {
                            const classificationXML = this.exportClassificationXML();
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(classificationXML, 'text/xml');
                            window.batchProcessor.classification = window.batchProcessor.parseClassificationXML(xmlDoc);
                            
                            // Update batch status if function exists
                            if (typeof updateBatchClassificationStatus === 'function') {
                                updateBatchClassificationStatus();
                            }
                            
                            console.log('Classification automatically transferred to batch processor');
                        } catch (err) {
                            console.error('Error auto-transferring to batch:', err);
                        }
                    }, 100);
                }
                
            } catch (error) {
                console.error('Error loading classification:', error);
                this.setStatus('Error loading classification file: ' + error.message, 'error');
            }
        };
        
        reader.readAsText(file);
        
        // Reset the file input so the same file can be loaded again
        event.target.value = '';
    }
    
    startZoneDrawing() {
        if (!this.currentPhaseId) {
            this.setStatus('Please select a phase first', 'warning');
            return;
        }
        
        this.drawingZone = true;
        this.zoneDrawingPhaseId = this.currentPhaseId;
        this.currentZoneVertices = [];
        this.zoneDrawingMode = this.currentDrawingMode; // Use centralized mode
        this.circleCenter = null;
        this.circleRadius = 0;
        this.ternaryCanvas.style.cursor = 'crosshair';
        
        const phaseName = this.phases.get(this.currentPhaseId).name;
        if (this.currentDrawingMode === 'polygon') {
            this.setStatus(`Drawing RGB polygon zone for ${phaseName}. Click to add vertices. Press Enter to finish or Escape to cancel.`, 'info');
        } else {
            this.setStatus(`Drawing RGB circle zone for ${phaseName}. Click to set center, then click again to set radius.`, 'info');
        }
        
        this.drawTernaryPlot();
    }
    
    startBCZoneDrawing() {
        if (!this.currentPhaseId) {
            this.setStatus('Please select a phase first', 'warning');
            return;
        }
        
        this.drawingBCZone = true;
        this.zoneDrawingPhaseId = this.currentPhaseId;
        this.bcCurrentZoneVertices = [];
        this.bcZoneDrawingMode = this.currentDrawingMode; // Use centralized mode
        this.bcCircleCenter = null;
        this.bcCircleRadius = 0;
        
        const phase = this.phases.get(this.currentPhaseId);
        const phaseName = phase.name;
        
        // Show B/C drawing status panel
        this.updateBCDrawingStatus(phase, this.currentDrawingMode);
        
        if (this.currentDrawingMode === 'polygon') {
            this.setStatus(`Drawing B/C polygon zone for ${phaseName}. Click to add vertices. Press Enter to finish or Escape to cancel.`, 'info');
        } else {
            this.setStatus(`Drawing B/C circle zone for ${phaseName}. Click to set center, then click again to set radius.`, 'info');
        }
        
        this.drawBrightnessContrastPlot();
    }
    
    startZoneDrawingForPhase(phaseId) {
        // Select the phase first
        this.selectPhase(phaseId);
        
        // Start zone drawing
        this.drawingZone = true;
        this.zoneDrawingPhaseId = phaseId;
        this.currentZoneVertices = [];
        this.zoneDrawingMode = 'polygon'; // Default to polygon mode
        this.circleCenter = null;
        this.circleRadius = 0;
        this.ternaryCanvas.style.cursor = 'crosshair';
        
        const phaseName = this.phases.get(phaseId).name;
        this.setStatus(`Drawing RGB zone for ${phaseName}. Click to add vertices. Press Enter to finish or Escape to cancel.`, 'info');
        
        this.drawTernaryPlot();
    }
    
    startBCZoneDrawingForPhase(phaseId) {
        // Select the phase first
        this.selectPhase(phaseId);
        
        // Start BC zone drawing
        this.drawingBCZone = true;
        this.zoneDrawingPhaseId = phaseId;
        this.bcCurrentZoneVertices = [];
        
        // Get mode from phase (use stored mode or default to polygon)
        const phase = this.phases.get(phaseId);
        this.bcZoneDrawingMode = phase.bcZoneMode || 'polygon';
        this.bcCircleCenter = null;
        this.bcCircleRadius = 0;
        
        const phaseName = phase.name;
        const mode = this.bcZoneDrawingMode;
        
        // Show B/C drawing status panel
        this.updateBCDrawingStatus(phase, mode);
        
        // Update cursor
        this.bcCanvas.style.cursor = 'crosshair';
        
        if (mode === 'polygon') {
            this.setStatus(`🎨 Drawing B/C zone for ${phaseName}. Click to add vertices. Right-click or press Enter to finish. Press Escape to cancel.`, 'info');
        } else {
            this.setStatus(`🎨 Drawing B/C zone for ${phaseName}. Click to set center, then click again to set radius.`, 'info');
        }
        
        console.log(`Started B/C zone drawing for phase ${phaseId} (${phaseName}), mode: ${mode}, drawingBCZone: ${this.drawingBCZone}`);
        
        this.drawBrightnessContrastPlot();
    }

    
    finishZoneDrawing() {
        if (this.currentZoneVertices.length < 3) {
            this.setStatus('Zone must have at least 3 vertices', 'warning');
            return;
        }
        
        const phase = this.phases.get(this.zoneDrawingPhaseId);
        phase.zone = [...this.currentZoneVertices];
        
        this.drawingZone = false;
        this.currentZoneVertices = [];
        this.zoneDrawingPhaseId = null;
        
        this.drawTernaryPlot();
        this.setStatus(`Zone defined for ${phase.name}. Click "Classify Image" to apply.`, 'success');
    }
    
    cancelZoneDrawing() {
        this.drawingZone = false;
        this.currentZoneVertices = [];
        this.zoneDrawingPhaseId = null;
        this.circleCenter = null;
        this.circleRadius = 0;
        this.drawTernaryPlot();
        this.setStatus('Zone drawing cancelled', 'info');
    }
    
    finishBCZoneDrawing() {
        if (this.bcCurrentZoneVertices.length < 3) {
            this.setStatus('B/C zone must have at least 3 vertices', 'warning');
            return;
        }
        
        const phase = this.phases.get(this.zoneDrawingPhaseId);
        phase.bcZone = [...this.bcCurrentZoneVertices];
        
        this.drawingBCZone = false;
        this.bcCurrentZoneVertices = [];
        
        // Hide B/C drawing status panel
        this.hideBCDrawingStatus();
        
        this.drawBrightnessContrastPlot();
        this.renderPhasesList();
        this.setStatus(`B/C zone defined for ${phase.name}.`, 'success');
    }
    
    cancelBCZoneDrawing() {
        this.drawingBCZone = false;
        this.bcCurrentZoneVertices = [];
        this.bcCircleCenter = null;
        this.bcCircleRadius = 0;
        
        // Hide B/C drawing status panel
        this.hideBCDrawingStatus();
        
        this.drawBrightnessContrastPlot();
        this.setStatus('B/C zone drawing cancelled', 'info');
    }
    
    clearZone() {
        if (!this.currentPhaseId) {
            this.setStatus('Please select a phase first', 'warning');
            return;
        }
        
        const phase = this.phases.get(this.currentPhaseId);
        phase.zone = null;
        this.drawTernaryPlot();
        this.renderPhasesList();
        this.setStatus(`RGB zone cleared for ${phase.name}`, 'info');
    }
    
    clearAllZonesForCurrentPhase() {
        if (!this.currentPhaseId) {
            this.setStatus('Please select a phase first', 'warning');
            return;
        }
        
        const phase = this.phases.get(this.currentPhaseId);
        phase.zone = null;
        phase.bcZone = null;
        this.drawTernaryPlot();
        this.drawBrightnessContrastPlot();
        this.renderPhasesList();
        this.setStatus(`All zones cleared for ${phase.name}`, 'info');
    }
    
    clearRGBZoneForPhase(phaseId) {
        const phase = this.phases.get(phaseId);
        phase.zone = null;
        this.drawTernaryPlot();
        this.renderPhasesList();
        this.setStatus(`RGB zone cleared for ${phase.name}`, 'info');
    }
    
    clearBCZoneForPhase(phaseId) {
        const phase = this.phases.get(phaseId);
        phase.bcZone = null;
        this.drawBrightnessContrastPlot();
        this.renderPhasesList();
        this.renderPhaseZoneControls();
        this.setStatus(`B/C zone cleared for ${phase.name}`, 'info');
    }
    
    setDefaultLABRangesForPhase(phaseId) {
        if (!this.phases.has(phaseId)) return;
        
        const phase = this.phases.get(phaseId);
        
        if (!phase.samples || phase.samples.length === 0) {
            this.setStatus(`No samples for ${phase.name}. Sample pixels first.`, 'warning');
            return;
        }
        
        // Calculate LAB ranges from this phase's samples
        let minL = Infinity, maxL = -Infinity;
        let minA = Infinity, maxA = -Infinity;
        let minB = Infinity, maxB = -Infinity;
        
        for (const sample of phase.samples) {
            const lab = this.rgbToLab(sample.rgb[0], sample.rgb[1], sample.rgb[2]);
            minL = Math.min(minL, lab.L);
            maxL = Math.max(maxL, lab.L);
            minA = Math.min(minA, lab.a);
            maxA = Math.max(maxA, lab.a);
            minB = Math.min(minB, lab.b);
            maxB = Math.max(maxB, lab.b);
        }
        
        // Add 10% padding
        const paddingL = Math.max((maxL - minL) * 0.1, 2);
        const paddingA = Math.max((maxA - minA) * 0.1, 5);
        const paddingB = Math.max((maxB - minB) * 0.1, 5);
        
        phase.labRanges = {
            L: {
                min: Math.max(0, minL - paddingL),
                max: Math.min(100, maxL + paddingL)
            },
            a: {
                min: Math.max(-128, minA - paddingA),
                max: Math.min(127, maxA + paddingA)
            },
            b: {
                min: Math.max(-128, minB - paddingB),
                max: Math.min(127, maxB + paddingB)
            }
        };
        
        // Invalidate cache to recalculate axes with new data
        console.log('❌ LAB cache invalidated: Set from Samples clicked');
        this.cachedLABDataRanges = null;
        
        this.drawLABGraphs();
        this.renderPhaseZoneControls();
        this.setStatus(`LAB ranges set for ${phase.name} based on ${phase.samples.length} samples`, 'success');
    }
    
    clearLABRangesForPhase(phaseId) {
        if (this.phases.has(phaseId)) {
            const phase = this.phases.get(phaseId);
            phase.labRanges = null;
            this.drawLABGraphs();
            this.renderPhaseZoneControls();
            this.setStatus(`Cleared LAB ranges for ${phase.name}`, 'info');
        }
    }
    
    updateBCDrawingStatus(phase, mode) {
        const statusDiv = document.getElementById('bc-drawing-status');
        const colorDiv = document.getElementById('bc-drawing-phase-color');
        const nameSpan = document.getElementById('bc-drawing-phase-name');
        const modeLabel = document.getElementById('bc-drawing-mode-label');
        
        if (statusDiv && colorDiv && nameSpan && modeLabel) {
            statusDiv.style.display = 'block';
            statusDiv.style.backgroundColor = phase.color + '22'; // Add transparency
            statusDiv.style.borderColor = phase.color;
            colorDiv.style.backgroundColor = phase.color;
            nameSpan.textContent = phase.name;
            
            if (mode === 'polygon') {
                modeLabel.textContent = 'Mode: Polygon | Click vertices, Enter to finish';
            } else {
                modeLabel.textContent = 'Mode: Circle | Click center, then radius';
            }
        }
    }
    
    hideBCDrawingStatus() {
        const statusDiv = document.getElementById('bc-drawing-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
        }
    }

    
    // Point-in-polygon test using ray casting algorithm
    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    // Check if a point (with brightness and contrast properties) is inside a B/C zone
    isPointInBCZone(point, bcZone) {
        let inside = false;
        for (let i = 0, j = bcZone.length - 1; i < bcZone.length; j = i++) {
            const xi = bcZone[i].brightness, yi = bcZone[i].contrast;
            const xj = bcZone[j].brightness, yj = bcZone[j].contrast;
            
            const intersect = ((yi > point.contrast) !== (yj > point.contrast))
                && (point.brightness < (xj - xi) * (point.contrast - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    async classifyImage() {
        if (!this.image) {
            this.setStatus('No image loaded', 'error');
            return;
        }
        
        // Check if any phases have LAB ranges or B/C zones
        let hasZones = false;
        for (const [phaseId, phase] of this.phases) {
            if (phase.labRanges || (phase.bcZone && phase.bcZone.length > 0)) {
                hasZones = true;
                break;
            }
        }
        
        if (!hasZones) {
            this.setStatus('Please set LAB ranges or draw B/C zones for at least one phase', 'warning');
            return;
        }
        
        this.setStatus('Classifying image pixels...', 'info');
        
        // Get image data
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;
        
        // Create classification result canvas
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = this.canvas.width;
        resultCanvas.height = this.canvas.height;
        const resultCtx = resultCanvas.getContext('2d');
        const resultData = resultCtx.createImageData(this.canvas.width, this.canvas.height);
        
        // Statistics: count pixels per phase per X position
        const stats = {
            width: this.canvas.width,
            height: this.canvas.height,
            phases: new Map()
        };
        
        // Initialize stats for all phases that have LAB ranges OR B/C zones
        for (const [phaseId, phase] of this.phases) {
            if (phase.labRanges || (phase.bcZone && phase.bcZone.length > 0)) {
                stats.phases.set(phaseId, {
                    name: phase.name,
                    color: phase.color,
                    countsPerX: new Array(this.canvas.width).fill(0)
                });
            }
        }
        
        // Classify each pixel
        for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
                const idx = (y * this.canvas.width + x) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                
                // Convert RGB to LAB
                const lab = this.rgbToLab(r, g, b);
                
                // Calculate brightness and contrast for this pixel
                const brightness = (r + g + b) / 3;
                const mean = brightness;
                const variance = (
                    Math.pow(r - mean, 2) +
                    Math.pow(g - mean, 2) +
                    Math.pow(b - mean, 2)
                ) / 3;
                const contrast = Math.sqrt(variance);
                
                // Check which phase this pixel belongs to
                let matched = false;
                for (const [phaseId, phase] of this.phases) {
                    let labMatch = false;
                    let bcMatch = false;
                    
                    // Check LAB channel ranges (if defined)
                    if (phase.labRanges) {
                        labMatch = (
                            lab.L >= phase.labRanges.L.min && lab.L <= phase.labRanges.L.max &&
                            lab.a >= phase.labRanges.a.min && lab.a <= phase.labRanges.a.max &&
                            lab.b >= phase.labRanges.b.min && lab.b <= phase.labRanges.b.max
                        );
                    } else {
                        // No LAB ranges = automatically pass LAB check
                        labMatch = true;
                    }
                    
                    // Check B/C zone (if exists)
                    if (phase.bcZone && phase.bcZone.length > 0) {
                        const bcPoint = { brightness, contrast };
                        bcMatch = this.isPointInBCZone(bcPoint, phase.bcZone);
                    } else {
                        // No B/C zone = automatically pass B/C check
                        bcMatch = true;
                    }
                    
                    // Pixel matches if it passes BOTH checks (AND logic)
                    // But if a phase has no zones at all, skip it
                    const hasAnyZone = phase.labRanges || (phase.bcZone && phase.bcZone.length > 0);
                    if (hasAnyZone && labMatch && bcMatch) {
                        // Color the pixel with phase color
                        const colorHex = phase.color;
                        const colorR = parseInt(colorHex.slice(1, 3), 16);
                        const colorG = parseInt(colorHex.slice(3, 5), 16);
                        const colorB = parseInt(colorHex.slice(5, 7), 16);
                        
                        resultData.data[idx] = colorR;
                        resultData.data[idx + 1] = colorG;
                        resultData.data[idx + 2] = colorB;
                        resultData.data[idx + 3] = 180; // Semi-transparent
                        
                        // Update statistics
                        stats.phases.get(phaseId).countsPerX[x]++;
                        matched = true;
                        break; // Only assign to first matching phase
                    }
                }
                
                if (!matched) {
                    // Keep pixel transparent
                    resultData.data[idx + 3] = 0;
                }
            }
        }
        
        // Put the result on result canvas
        resultCtx.putImageData(resultData, 0, 0);
        this.classifiedImage = resultCanvas;
        
        // Calculate areal fractions (averaged over Y)
        for (const [phaseId, phaseStats] of stats.phases) {
            phaseStats.arealFractions = phaseStats.countsPerX.map(count => count / stats.height);
        }
        
        this.classificationStats = stats;
        
        // Display result
        this.displayClassificationResults();
        
        this.setStatus('Classification complete! See results below.', 'success');
    }
    
    displayClassificationResults() {
        // Show the view toggle buttons
        const viewToggleContainer = document.getElementById('view-toggle-container');
        if (viewToggleContainer) {
            viewToggleContainer.style.display = 'flex';
        }
        
        // Switch to classified view
        this.currentView = 'classified';
        this.switchView();
        
        // Update button states
        const originalBtn = document.getElementById('view-original-btn');
        const classifiedBtn = document.getElementById('view-classified-btn');
        if (originalBtn && classifiedBtn) {
            originalBtn.className = 'px-3 py-1 bg-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-400 transition-colors';
            classifiedBtn.className = 'px-3 py-1 bg-blue-500 text-white rounded-md text-sm font-medium transition-colors';
        }
        
        // Display statistics chart
        this.displayArealFractionChart();
    }
    
    displayArealFractionChart() {
        const container = document.getElementById('areal-fraction-chart');
        if (!container) return;
        
        // Show the container
        container.style.display = 'block';
        
        const stats = this.classificationStats;
        if (!stats) return;
        
        console.log('Displaying areal fraction chart for', stats.phases.size, 'phases');
        for (const [phaseId, phaseStats] of stats.phases) {
            console.log(`Phase ${phaseId}: ${phaseStats.name}, color: ${phaseStats.color}`);
        }
        
        // Get selected plot mode
        const plotMode = document.getElementById('areal-plot-mode')?.value || 'absolute';
        console.log(`displayArealFractionChart called - plotMode: ${plotMode}`);
        
        // Show/hide phase selector based on mode
        const phaseSelectorDiv = document.getElementById('stacked-phase-selector');
        if (phaseSelectorDiv) {
            phaseSelectorDiv.style.display = plotMode === 'stacked' ? 'block' : 'none';
        }
        
        // Update phase checkboxes only if container is empty or phases changed
        if (plotMode === 'stacked') {
            const container = document.getElementById('phase-checkboxes-container');
            const existingCheckboxes = container?.querySelectorAll('.phase-stacked-checkbox');
            
            // Only update if no checkboxes exist or phase count changed
            if (!existingCheckboxes || existingCheckboxes.length !== stats.phases.size) {
                console.log('Updating phase checkboxes (first time or phase count changed)');
                this.updatePhaseCheckboxes();
            } else {
                console.log('Keeping existing checkboxes (already created)');
            }
        }
        
        // Create canvas for chart
        const chartCanvas = document.getElementById('areal-fraction-canvas');
        if (!chartCanvas) return;
        
        const ctx = chartCanvas.getContext('2d');
        const width = chartCanvas.width;
        const height = chartCanvas.height;
        
        // Clear
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        
        // Draw axes
        const marginLeft = 60;
        const marginRight = 20;
        const marginTop = 20;
        const marginBottom = 40;
        const plotWidth = width - marginLeft - marginRight;
        const plotHeight = height - marginTop - marginBottom;
        
        // Y-axis (0 to 1 for fraction)
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(marginLeft, marginTop);
        ctx.lineTo(marginLeft, marginTop + plotHeight);
        ctx.lineTo(marginLeft + plotWidth, marginTop + plotHeight);
        ctx.stroke();
        
        // Y-axis labels
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 10; i++) {
            const frac = i / 10;
            const y = marginTop + plotHeight - (frac * plotHeight);
            ctx.fillText((frac * 100).toFixed(0) + '%', marginLeft - 10, y + 4);
            
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(marginLeft, y);
            ctx.lineTo(marginLeft + plotWidth, y);
            ctx.stroke();
        }
        
        // X-axis label
        ctx.textAlign = 'center';
        ctx.fillText('X Position (pixels)', marginLeft + plotWidth / 2, height - 10);
        
        // Y-axis label
        ctx.save();
        ctx.translate(15, marginTop + plotHeight / 2);
        ctx.rotate(-Math.PI / 2);
        const yLabel = plotMode === 'stacked' ? 'Normalized Fraction (%)' : 'Areal Fraction (%)';
        ctx.fillText(yLabel, 0, 0);
        ctx.restore();
        
        // Plot data for each phase
        if (plotMode === 'stacked') {
            // Stacked line chart (normalized to 100%) - only for selected phases
            const selectedPhases = this.getSelectedStackedPhases();
            console.log('Selected phases for stacked plot:', Array.from(selectedPhases));
            
            // If no phases selected, show message
            if (selectedPhases.size === 0) {
                ctx.fillStyle = '#666';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('No phases selected. Please select at least one phase.', width / 2, height / 2);
                return;
            }
            
            // Calculate total for SELECTED phases only at each X position
            const totalFractions = new Array(stats.width).fill(0);
            for (const [phaseId, phaseStats] of stats.phases) {
                if (selectedPhases.has(phaseId)) {
                    for (let x = 0; x < phaseStats.arealFractions.length; x++) {
                        totalFractions[x] += phaseStats.arealFractions[x];
                    }
                }
            }
            
            // Draw normalized lines for selected phases
            for (const [phaseId, phaseStats] of stats.phases) {
                if (!selectedPhases.has(phaseId)) continue;
                
                ctx.strokeStyle = phaseStats.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                
                for (let x = 0; x < phaseStats.arealFractions.length; x++) {
                    const totalAtX = totalFractions[x];
                    const normalizedFraction = totalAtX > 0 ? phaseStats.arealFractions[x] / totalAtX : 0;
                    const plotX = marginLeft + (x / stats.width) * plotWidth;
                    const plotY = marginTop + plotHeight - (normalizedFraction * plotHeight);
                    
                    if (x === 0) {
                        ctx.moveTo(plotX, plotY);
                    } else {
                        ctx.lineTo(plotX, plotY);
                    }
                }
                
                ctx.stroke();
            }
        } else {
            // Absolute mode - line chart for ALL phases
            for (const [phaseId, phaseStats] of stats.phases) {
                ctx.strokeStyle = phaseStats.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                
                for (let x = 0; x < phaseStats.arealFractions.length; x++) {
                    const fraction = phaseStats.arealFractions[x];
                    const plotX = marginLeft + (x / stats.width) * plotWidth;
                    const plotY = marginTop + plotHeight - (fraction * plotHeight);
                    
                    if (x === 0) {
                        ctx.moveTo(plotX, plotY);
                    } else {
                        ctx.lineTo(plotX, plotY);
                    }
                }
                
                ctx.stroke();
            }
        }
        
        // Legend
        let legendY = marginTop + 10;
        for (const [phaseId, phaseStats] of stats.phases) {
            ctx.fillStyle = phaseStats.color;
            ctx.fillRect(marginLeft + plotWidth - 100, legendY, 20, 10);
            ctx.fillStyle = '#000';
            ctx.textAlign = 'left';
            ctx.fillText(phaseStats.name, marginLeft + plotWidth - 75, legendY + 9);
            legendY += 20;
        }
    }
    
    updatePhaseCheckboxes() {
        const container = document.getElementById('phase-checkboxes-container');
        if (!container || !this.classificationStats) return;
        
        container.innerHTML = '';
        
        for (const [phaseId, phaseStats] of this.classificationStats.phases) {
            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'flex items-center gap-2 px-2 py-1 rounded border border-purple-200 bg-purple-50 hover:border-purple-300 cursor-pointer';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `phase-checkbox-${phaseId}`;
            checkbox.className = 'phase-stacked-checkbox cursor-pointer';
            checkbox.dataset.phaseId = phaseId;
            checkbox.checked = true; // Default: all selected
            
            // Event listener for checkbox changes
            checkbox.addEventListener('change', (e) => {
                console.log(`Phase ${phaseStats.name} (${phaseId}) checkbox changed - now ${checkbox.checked}`);
                
                // Update visual state of the container
                if (checkbox.checked) {
                    checkboxDiv.classList.remove('opacity-50');
                    checkboxDiv.classList.add('border-purple-200', 'bg-purple-50');
                } else {
                    checkboxDiv.classList.add('opacity-50');
                    checkboxDiv.classList.remove('border-purple-200', 'bg-purple-50');
                }
                
                this.displayArealFractionChart();
            });
            
            // Label without htmlFor to avoid automatic toggling
            const labelDiv = document.createElement('div');
            labelDiv.className = 'text-sm flex items-center gap-2 flex-1';
            
            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'w-4 h-4 rounded border border-gray-400 flex-shrink-0';
            colorSwatch.style.backgroundColor = phaseStats.color;
            
            labelDiv.appendChild(colorSwatch);
            labelDiv.appendChild(document.createTextNode(phaseStats.name));
            
            // Make the whole div clickable (including label area)
            checkboxDiv.addEventListener('click', (e) => {
                // If clicking the checkbox itself, let it handle naturally
                if (e.target === checkbox) return;
                
                // Otherwise, toggle programmatically
                checkbox.checked = !checkbox.checked;
                console.log(`Phase ${phaseStats.name} (${phaseId}) toggled via div click - now ${checkbox.checked}`);
                
                // Manually trigger change event
                const changeEvent = new Event('change', { bubbles: true });
                checkbox.dispatchEvent(changeEvent);
            });
            
            checkboxDiv.appendChild(checkbox);
            checkboxDiv.appendChild(labelDiv);
            container.appendChild(checkboxDiv);
        }
        
        // Setup select/deselect all buttons with proper event handling
        const selectAllBtn = document.getElementById('select-all-phases');
        const deselectAllBtn = document.getElementById('deselect-all-phases');
        
        if (selectAllBtn) {
            // Remove old event listeners by cloning and replacing
            const newSelectAllBtn = selectAllBtn.cloneNode(true);
            selectAllBtn.parentNode.replaceChild(newSelectAllBtn, selectAllBtn);
            
            newSelectAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Select All clicked - selecting all phases');
                
                // Update all checkboxes and their visual states
                document.querySelectorAll('.phase-stacked-checkbox').forEach(cb => {
                    cb.checked = true;
                    // Trigger change event to update visuals
                    const changeEvent = new Event('change', { bubbles: true });
                    cb.dispatchEvent(changeEvent);
                });
                
                // Redraw chart once at the end
                this.displayArealFractionChart();
            });
        }
        
        if (deselectAllBtn) {
            // Remove old event listeners by cloning and replacing
            const newDeselectAllBtn = deselectAllBtn.cloneNode(true);
            deselectAllBtn.parentNode.replaceChild(newDeselectAllBtn, deselectAllBtn);
            
            newDeselectAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Deselect All clicked - deselecting all phases');
                
                // Update all checkboxes and their visual states
                document.querySelectorAll('.phase-stacked-checkbox').forEach(cb => {
                    cb.checked = false;
                    // Trigger change event to update visuals
                    const changeEvent = new Event('change', { bubbles: true });
                    cb.dispatchEvent(changeEvent);
                });
                
                // Redraw chart once at the end
                this.displayArealFractionChart();
            });
        }
    }
    
    getSelectedStackedPhases() {
        const selected = new Set();
        const checkboxes = document.querySelectorAll('.phase-stacked-checkbox:checked');
        console.log(`getSelectedStackedPhases: Found ${checkboxes.length} checked checkboxes`);
        checkboxes.forEach(cb => {
            const phaseId = parseInt(cb.dataset.phaseId);
            console.log(`  - Checkbox for phase ${phaseId} is checked`);
            selected.add(phaseId);
        });
        console.log(`getSelectedStackedPhases returning:`, Array.from(selected));
        return selected;
    }
    
    async applyRGBFilter() {
        if (!this.currentPhaseId) {
            this.setStatus('Please select a phase first', 'warning');
            return;
        }
        
        const phase = this.phases.get(this.currentPhaseId);
        if (!phase.targetRGB) {
            this.setStatus('Please sample a color first (Ctrl+Click on image)', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/apply_notch_filter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phase_id: this.currentPhaseId,
                    target_rgb: phase.targetRGB,
                    tolerance: this.colorTolerance
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Store filter settings in phase data
                phase.tolerance = this.colorTolerance;
                
                // Refresh marker visualization
                await this.refreshMarkers();
                
                this.setStatus(data.message, 'success');
            } else {
                this.setStatus(data.message || 'Error applying RGB filter', 'error');
            }
        } catch (error) {
            console.error('Error applying RGB filter:', error);
            this.setStatus('Error applying RGB filter', 'error');
        }
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: Math.round((e.clientX - rect.left) * scaleX),
            y: Math.round((e.clientY - rect.top) * scaleY)
        };
    }
    
    async addPoint(e) {
        const pos = this.getMousePos(e);
        const brushSize = parseInt(this.brushSize.value);
        
        try {
            // Sample the pixel to get RGB data
            const sampleResponse = await fetch('/sample_pixel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    x: pos.x, 
                    y: pos.y,
                    phase_id: this.currentPhaseId
                })
            });
            
            const sampleData = await sampleResponse.json();
            
            if (sampleData.status === 'success') {
                // Draw marker on canvas (this also adds to this.markers array)
                this.drawMarker(pos.x, pos.y, this.currentPhaseId, brushSize);
                
                // Store sample in phase for statistics
                const phase = this.phases.get(this.currentPhaseId);
                if (!phase.samples) {
                    phase.samples = [];
                }
                phase.samples.push({
                    x: pos.x,
                    y: pos.y,
                    rgb: sampleData.rgb
                });
                
                // Update ternary plot and B/C plot to show the new sample
                this.drawTernaryPlot();
                this.drawBrightnessContrastPlot();
                
                const phaseName = phase.name;
                this.setStatus(`✓ Added ${phaseName} marker at (${pos.x}, ${pos.y}) - RGB(${sampleData.rgb[0]}, ${sampleData.rgb[1]}, ${sampleData.rgb[2]})`, 'success');
            } else {
                console.error('Failed to sample pixel:', sampleData);
                this.setStatus('Failed to sample pixel at this location', 'error');
            }
            
        } catch (error) {
            console.error('Error adding point:', error);
            this.setStatus('Error adding point', 'error');
        }
    }
    
    erasePoint(e) {
        const pos = this.getMousePos(e);
        const brushSize = parseInt(this.brushSize.value);
        
        // Remove markers within brush radius
        const radiusSquared = brushSize * brushSize;
        this.markers = this.markers.filter(marker => {
            const dx = marker.x - pos.x;
            const dy = marker.y - pos.y;
            const distSquared = dx * dx + dy * dy;
            return distSquared > radiusSquared;
        });
        
        // Redraw overlay without erased markers
        this.redrawOverlay();
        
        this.setStatus('Erased markers', 'info');
    }
    
    redrawOverlay(cursorPos = null) {
        // Clear overlay
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        // Redraw all markers from the markers array with their actual brush sizes
        for (const marker of this.markers) {
            if (this.phases.has(marker.phaseId)) {
                const phase = this.phases.get(marker.phaseId);
                const color = this.hexToRgb(phase.color);
                const markerSize = marker.brushSize || 5; // Use saved brush size, default to 5 if not set
                
                // Draw filled circle for the marker
                this.overlayCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(marker.x, marker.y, markerSize, 0, 2 * Math.PI);
                this.overlayCtx.fill();
                
                // Add a subtle border for better visibility
                this.overlayCtx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
                this.overlayCtx.lineWidth = 1;
                this.overlayCtx.stroke();
            }
        }
        
        // Draw brush cursor if we have a cursor position and selected phase
        if (cursorPos && this.currentPhaseId !== null) {
            const brushSize = parseInt(this.brushSize.value);
            const phase = this.phases.get(this.currentPhaseId);
            
            if (phase) {
                const color = this.hexToRgb(phase.color);
                
                // Outer circle
                this.overlayCtx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
                this.overlayCtx.lineWidth = 2;
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(cursorPos.x, cursorPos.y, brushSize, 0, 2 * Math.PI);
                this.overlayCtx.stroke();
                
                // Inner filled circle
                this.overlayCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`;
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(cursorPos.x, cursorPos.y, brushSize * 0.3, 0, 2 * Math.PI);
                this.overlayCtx.fill();
                
                // Center dot
                this.overlayCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(cursorPos.x, cursorPos.y, 2, 0, 2 * Math.PI);
                this.overlayCtx.fill();
            }
        }
    }
    
    drawMarker(x, y, phaseId, brushSize) {
        if (!this.phases.has(phaseId)) return;
        
        // Add to markers array for persistence
        this.markers.push({ x, y, phaseId, brushSize });
        
        // Redraw overlay with new marker
        this.redrawOverlay();
    }
    
    eraseMarker(x, y, brushSize) {
        this.overlayCtx.globalCompositeOperation = 'destination-out';
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(x, y, brushSize, 0, 2 * Math.PI);
        this.overlayCtx.fill();
        this.overlayCtx.globalCompositeOperation = 'source-over';
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    async highlightPhaseMarkers(phaseId) {
        // Redraw overlay with current phase highlighted
        try {
            const response = await fetch('/get_markers');
            const markers = await response.json();
            
            // Redraw base image
            this.ctx.drawImage(this.image, 0, 0);
            
            // Clear overlay
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            
            // Draw all markers, with current phase more prominent
            for (const [markerPhaseId, phaseData] of Object.entries(markers)) {
                const markerPhaseIdInt = parseInt(markerPhaseId);
                
                if (this.phases.has(markerPhaseIdInt)) {
                    const phase = this.phases.get(markerPhaseIdInt);
                    const color = this.hexToRgb(phase.color);
                    
                    // Highlight current phase, dim others
                    const opacity = markerPhaseIdInt === phaseId ? 0.9 : 0.4;
                    const pointSize = markerPhaseIdInt === phaseId ? 4 : 3;
                    
                    this.overlayCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
                    
                    for (const [x, y] of phaseData.points) {
                        this.overlayCtx.beginPath();
                        this.overlayCtx.arc(x, y, pointSize, 0, 2 * Math.PI);
                        this.overlayCtx.fill();
                    }
                }
            }
            
        } catch (error) {
            console.error('Error highlighting phase markers:', error);
        }
    }
    
    async clearMarkers() {
        try {
            const response = await fetch('/clear_markers', {
                method: 'POST'
            });
            
            if (response.ok) {
                // Redraw original image
                if (this.image) {
                    this.ctx.drawImage(this.image, 0, 0);
                }
                // Clear overlay
                this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                this.setStatus('All markers cleared', 'info');
            }
            
        } catch (error) {
            console.error('Error clearing markers:', error);
            this.setStatus('Error clearing markers', 'error');
        }
    }
    
    async runWatershed() {
        if (this.phases.size === 0) {
            this.setStatus('Please add at least one phase before running watershed', 'warning');
            return;
        }
        
        this.setStatus('Running watershed segmentation...', 'info');
        
        try {
            // Send phase information to backend
            const phaseData = {};
            for (const [id, phase] of this.phases) {
                const rgb = this.hexToRgb(phase.color);
                phaseData[id] = {
                    name: phase.name,
                    color: [rgb.r, rgb.g, rgb.b]
                };
            }
            
            const response = await fetch('/run_watershed', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ phases: phaseData })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                // Display overlay result
                const img = new Image();
                img.onload = () => {
                    this.ctx.drawImage(img, 0, 0);
                    this.setStatus(data.message, 'success');
                };
                img.src = data.overlay;
            } else {
                this.setStatus(data.message, 'error');
            }
            
        } catch (error) {
            console.error('Error running watershed:', error);
            this.setStatus('Error running watershed segmentation', 'error');
        }
    }
    
    async saveMarkers() {
        try {
            const phaseData = {};
            for (const [id, phase] of this.phases) {
                phaseData[id] = phase;
            }
            
            const response = await fetch('/save_markers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ phases: phaseData })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                this.setStatus(data.message, 'success');
            } else {
                this.setStatus(data.message, 'error');
            }
            
        } catch (error) {
            console.error('Error saving markers:', error);
            this.setStatus('Error saving markers', 'error');
        }
    }
    
    async loadMarkers() {
        try {
            const response = await fetch('/load_markers', {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                // Load phases if available
                if (data.phases) {
                    this.phases.clear();
                    for (const [id, phase] of Object.entries(data.phases)) {
                        this.phases.set(parseInt(id), phase);
                        this.phaseIdCounter = Math.max(this.phaseIdCounter, parseInt(id) + 1);
                    }
                    this.renderPhasesList();
                    this.updateCurrentPhaseDisplay();
                }
                
                // Reload markers visualization
                await this.refreshMarkers();
                this.setStatus(data.message, 'success');
            } else {
                this.setStatus(data.message, 'error');
            }
            
        } catch (error) {
            console.error('Error loading markers:', error);
            this.setStatus('Error loading markers', 'error');
        }
    }
    
    async refreshMarkers() {
        try {
            const response = await fetch('/get_markers');
            const markers = await response.json();
            
            // Redraw base image
            if (this.image) {
                this.ctx.drawImage(this.image, 0, 0);
            }
            
            // Clear overlay and redraw markers
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            
            for (const [phaseId, phaseData] of Object.entries(markers)) {
                if (this.phases.has(parseInt(phaseId))) {
                    const phase = this.phases.get(parseInt(phaseId));
                    const color = this.hexToRgb(phase.color);
                    
                    const opacity = this.currentPhaseId === parseInt(phaseId) ? 0.9 : 0.7;
                    this.overlayCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
                    
                    for (const [x, y] of phaseData.points) {
                        this.overlayCtx.beginPath();
                        this.overlayCtx.arc(x, y, 3, 0, 2 * Math.PI);
                        this.overlayCtx.fill();
                    }
                }
            }
            
        } catch (error) {
            console.error('Error refreshing markers:', error);
        }
    }
    
    setStatus(message, type = 'info') {
        this.statusMessage.textContent = message;
        
        // Update status icon and container
        this.statusIcon.className = 'w-4 h-4 rounded-full';
        this.statusContainer.className = 'bg-white rounded-lg shadow-lg p-4';
        
        switch (type) {
            case 'success':
                this.statusIcon.classList.add('bg-green-500');
                this.statusContainer.classList.add('border-l-4', 'border-green-500');
                break;
            case 'error':
                this.statusIcon.classList.add('bg-red-500');
                this.statusContainer.classList.add('border-l-4', 'border-red-500');
                break;
            case 'warning':
                this.statusIcon.classList.add('bg-yellow-500');
                this.statusContainer.classList.add('border-l-4', 'border-yellow-500');
                break;
            default:
                this.statusIcon.classList.add('bg-blue-500');
                this.statusContainer.classList.add('border-l-4', 'border-blue-500');
        }
    }
    
    updateLoadingText(mainText, subText = '') {
        const loadingStatusText = document.getElementById('loading-status-text');
        const loadingSubstatusText = document.getElementById('loading-substatus-text');
        
        if (loadingStatusText) {
            loadingStatusText.textContent = mainText;
        }
        if (loadingSubstatusText) {
            loadingSubstatusText.textContent = subText;
        }
    }
    
    async uploadImageToBackend(imageDataURL) {
        /**
         * Upload current image to backend so pixel sampling works
         * This is essential for grid mode where tiles are extracted client-side
         */
        try {
            const response = await fetch('/set_image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageDataURL })
            });
            
            const result = await response.json();
            if (result.status === 'success') {
                console.log(`[UPLOAD] Image uploaded to backend: ${result.width}x${result.height}px`);
            } else {
                console.error('[UPLOAD] Failed to upload image:', result.message);
            }
        } catch (error) {
            console.error('[UPLOAD] Error uploading image to backend:', error);
        }
    }
}

// Initialize the application when the page loads
let segmentation;
document.addEventListener('DOMContentLoaded', () => {
    segmentation = new InteractiveSegmentation();
    
    // Make globally accessible for batch processing
    window.phaseSegmentation = segmentation;
    
    // Handle image upload
    const uploadInput = document.getElementById('upload-image-input');
    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    // Clear any existing classification
                    segmentation.classifiedImage = null;
                    segmentation.classificationStats = null;
                    const viewToggle = document.getElementById('view-toggle-container');
                    if (viewToggle) viewToggle.style.display = 'none';
                    
                    // Upload to backend for pixel sampling
                    segmentation.uploadImageToBackend(event.target.result);
                    
                    // Load the uploaded image
                    segmentation.loadImage(event.target.result);
                };
                reader.readAsDataURL(file);
            } else if (file) {
                alert('Please select a valid image file.');
            }
            // Reset the input so the same file can be uploaded again if needed
            e.target.value = '';
        });
    }
    
    // Handle load example button
    const loadExampleBtn = document.getElementById('load-example-btn');
    if (loadExampleBtn) {
        loadExampleBtn.addEventListener('click', () => {
            // Clear any existing classification
            segmentation.classifiedImage = null;
            segmentation.classificationStats = null;
            const viewToggle = document.getElementById('view-toggle-container');
            if (viewToggle) viewToggle.style.display = 'none';
            
            // Load the example image from server
            segmentation.loadImage();
        });
    }
});