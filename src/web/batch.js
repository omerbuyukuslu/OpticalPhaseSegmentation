/**
 * Batch Processing JavaScript
 * Handles multiple image processing with saved classification settings
 * Now uses backend processing for high-resolution images
 */

class BatchProcessor {
    constructor() {
        this.classification = null;
        this.images = [];
        this.unit = 'μm';
        this.results = [];
        this.nextImageId = 1;
        this.canvas = null;
        this.ctx = null;
        this.currentJobId = null;
        this.useBackendProcessing = true;  // Always use backend for better performance
        this.currentView = 'classified';  // 'original' or 'classified'
        
        this.init();
    }
    
    init() {
        // Initialize canvas (may not exist if on phase tab)
        this.canvas = document.getElementById('spatial-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }
        
        // Upload images
        const uploadBtn = document.getElementById('batch-images-upload');
        if (uploadBtn) {
            uploadBtn.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files);
            });
        }
        
        // Unit input
        const unitInput = document.getElementById('distance-unit');
        if (unitInput) {
            unitInput.addEventListener('input', (e) => {
                this.unit = e.target.value;
                this.updateSpatialVisualization();
            });
        }
        
        // Process button
        const processBtn = document.getElementById('process-batch-btn');
        if (processBtn) {
            processBtn.addEventListener('click', () => {
                this.processBatch();
            });
        }
        
        // View toggles
        document.getElementById('toggle-original-btn')?.addEventListener('click', () => {
            this.toggleView('original');
        });
        
        document.getElementById('toggle-classified-btn')?.addEventListener('click', () => {
            this.toggleView('classified');
        });
        
        document.getElementById('toggle-legend-btn')?.addEventListener('click', () => {
            this.toggleLegend();
        });
        
        // Export buttons
        document.getElementById('export-images-btn')?.addEventListener('click', () => {
            this.exportStackedImages();
        });
        
        document.getElementById('export-data-btn')?.addEventListener('click', () => {
            this.exportDataCSV();
        });
        
        document.getElementById('export-plot-btn')?.addEventListener('click', () => {
            this.exportPlot();
        });
    }
    
    loadClassification(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, 'text/xml');
                
                // Parse XML to extract classification settings
                this.classification = this.parseClassificationXML(xmlDoc);
                
                document.getElementById('classification-status').textContent = 
                    `Loaded: ${Object.keys(this.classification.phases).length} phases defined`;
                document.getElementById('classification-status').classList.remove('italic');
                document.getElementById('classification-status').classList.add('text-green-600', 'font-semibold');
                
                this.checkReadyToProcess();
            } catch (error) {
                console.error('Error loading classification:', error);
                alert('Failed to load classification file. Please check the file format.');
            }
        };
        reader.readAsText(file);
    }
    
    parseClassificationXML(xmlDoc) {
        // Parse XML classification file (matches the save format from main interface)
        const classification = {
            phases: {},
            unit: this.unit
        };
        
        const phases = xmlDoc.getElementsByTagName('Phase');
        for (let phase of phases) {
            const id = phase.getAttribute('id');
            const nameEl = phase.getElementsByTagName('Name')[0];
            const colorEl = phase.getElementsByTagName('Color')[0];
            
            const phaseData = {
                id: parseInt(id),
                name: nameEl ? nameEl.textContent : `Phase ${id}`,
                color: colorEl ? colorEl.textContent : '#cccccc',
                labRanges: null,
                bcZone: null
            };
            
            // Parse LAB ranges if present
            const labRangesEl = phase.getElementsByTagName('LABRanges')[0];
            if (labRangesEl) {
                const lEl = labRangesEl.getElementsByTagName('L')[0];
                const aEl = labRangesEl.getElementsByTagName('A')[0];
                const bEl = labRangesEl.getElementsByTagName('B')[0];
                
                phaseData.labRanges = {
                    L: {
                        min: parseFloat(lEl?.getAttribute('min') || 0),
                        max: parseFloat(lEl?.getAttribute('max') || 100)
                    },
                    a: {
                        min: parseFloat(aEl?.getAttribute('min') || -128),
                        max: parseFloat(aEl?.getAttribute('max') || 127)
                    },
                    b: {
                        min: parseFloat(bEl?.getAttribute('min') || -128),
                        max: parseFloat(bEl?.getAttribute('max') || 127)
                    }
                };
            }
            
            // Parse B/C zone if present
            const bcZoneEl = phase.getElementsByTagName('BCZone')[0];
            if (bcZoneEl) {
                const vertices = bcZoneEl.getElementsByTagName('Vertex');
                phaseData.bcZone = Array.from(vertices).map(v => ({
                    brightness: parseFloat(v.getAttribute('brightness')),
                    contrast: parseFloat(v.getAttribute('contrast'))
                }));
            }
            
            classification.phases[id] = phaseData;
        }
        
        return classification;
    }
    
    handleImageUpload(files) {
        // Add new images with unique IDs
        const newImages = Array.from(files).map((file) => ({
            id: `IMG-${this.nextImageId++}`,
            file: file,
            name: file.name,
            x0: 0,
            y0: 0,
            x1: 0,
            y1: 0,
            width: 0,
            height: 0,
            imageData: null
        }));
        
        this.images.push(...newImages);
        
        // Load image dimensions
        newImages.forEach(img => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const tempImg = new Image();
                tempImg.onload = () => {
                    img.width = tempImg.width;
                    img.height = tempImg.height;
                    img.imageData = e.target.result;
                    this.updateSpatialVisualization();
                };
                tempImg.src = e.target.result;
            };
            reader.readAsDataURL(img.file);
        });
        
        document.getElementById('upload-count').textContent = 
            `${this.images.length} image(s) uploaded`;
        
        this.renderImagesList();
        this.checkReadyToProcess();
    }
    
    renderImagesList() {
        const container = document.getElementById('images-list');
        container.innerHTML = '';
        
        if (this.images.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm italic">No images uploaded yet</p>';
            return;
        }
        
        this.images.forEach((img, idx) => {
            const div = document.createElement('div');
            div.className = 'border-2 border-gray-300 rounded-lg p-4 bg-white hover:border-blue-400 transition-colors';
            div.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="flex-shrink-0">
                        <div class="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded flex items-center justify-center text-white font-bold">
                            ${img.id}
                        </div>
                        <p class="text-xs text-center mt-1 text-gray-600">${img.width}×${img.height}px</p>
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between items-start mb-2">
                            <p class="font-semibold text-sm text-gray-800">${img.name}</p>
                            <button onclick="batchProcessor.removeImage(${idx})" 
                                    class="text-red-600 hover:text-red-800 font-bold text-lg leading-none">×</button>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-3">
                            <p class="text-xs font-semibold text-gray-700 mb-2">Corner Coordinates (${this.unit}):</p>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs text-gray-600 mb-1">
                                        <span class="font-semibold">Bottom-Left (X₀, Y₀)</span>
                                    </label>
                                    <div class="flex gap-2">
                                        <input type="number" step="0.001" value="${img.x0}" placeholder="X₀"
                                               class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                               onchange="batchProcessor.updatePosition(${idx}, 'x0', this.value)">
                                        <input type="number" step="0.001" value="${img.y0}" placeholder="Y₀"
                                               class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                               onchange="batchProcessor.updatePosition(${idx}, 'y0', this.value)">
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-600 mb-1">
                                        <span class="font-semibold">Top-Right (X₁, Y₁)</span>
                                    </label>
                                    <div class="flex gap-2">
                                        <input type="number" step="0.001" value="${img.x1}" placeholder="X₁"
                                               class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                               onchange="batchProcessor.updatePosition(${idx}, 'x1', this.value)">
                                        <input type="number" step="0.001" value="${img.y1}" placeholder="Y₁"
                                               class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                               onchange="batchProcessor.updatePosition(${idx}, 'y1', this.value)">
                                    </div>
                                </div>
                            </div>
                            <div class="mt-2 text-xs text-gray-600">
                                <span class="font-semibold">Dimensions:</span> 
                                Δx = ${(img.x1 - img.x0).toFixed(3)} ${this.unit}, 
                                Δy = ${(img.y1 - img.y0).toFixed(3)} ${this.unit}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    }
    
    updatePosition(idx, field, value) {
        this.images[idx][field] = parseFloat(value) || 0;
        this.renderImagesList();
        this.updateSpatialVisualization();
    }
    
    updateSpatialVisualization() {
        // Initialize canvas if not already done
        if (!this.canvas || !this.ctx) {
            this.canvas = document.getElementById('spatial-canvas');
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
            }
        }
        
        if (!this.ctx || this.images.length === 0) {
            this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        // Find bounds of all images
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        this.images.forEach(img => {
            minX = Math.min(minX, img.x0, img.x1);
            maxX = Math.max(maxX, img.x0, img.x1);
            minY = Math.min(minY, img.y0, img.y1);
            maxY = Math.max(maxY, img.y0, img.y1);
        });
        
        // Add padding
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;
        const padding = 0.1;
        minX -= rangeX * padding;
        maxX += rangeX * padding;
        minY -= rangeY * padding;
        maxY += rangeY * padding;
        
        const totalRangeX = maxX - minX;
        const totalRangeY = maxY - minY;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.ctx.fillStyle = '#f9fafb';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        this.ctx.strokeStyle = '#e5e7eb';
        this.ctx.lineWidth = 1;
        const gridSteps = 10;
        for (let i = 0; i <= gridSteps; i++) {
            const x = (this.canvas.width * i) / gridSteps;
            const y = (this.canvas.height * i) / gridSteps;
            
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        
        // Draw axes
        const originX = this.worldToCanvasX(0, minX, maxX);
        const originY = this.worldToCanvasY(0, minY, maxY);
        
        this.ctx.strokeStyle = '#6b7280';
        this.ctx.lineWidth = 2;
        
        // X-axis
        this.ctx.beginPath();
        this.ctx.moveTo(0, originY);
        this.ctx.lineTo(this.canvas.width, originY);
        this.ctx.stroke();
        
        // Y-axis
        this.ctx.beginPath();
        this.ctx.moveTo(originX, 0);
        this.ctx.lineTo(originX, this.canvas.height);
        this.ctx.stroke();
        
        // Draw axis labels
        this.ctx.fillStyle = '#374151';
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(`X (${this.unit})`, this.canvas.width - 60, originY - 10);
        this.ctx.fillText(`Y (${this.unit})`, originX + 10, 15);
        
        // Draw images as rectangles
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
        ];
        
        this.images.forEach((img, idx) => {
            const x0_canvas = this.worldToCanvasX(img.x0, minX, maxX);
            const y0_canvas = this.worldToCanvasY(img.y0, minY, maxY);
            const x1_canvas = this.worldToCanvasX(img.x1, minX, maxX);
            const y1_canvas = this.worldToCanvasY(img.y1, minY, maxY);
            
            const rectX = Math.min(x0_canvas, x1_canvas);
            const rectY = Math.min(y0_canvas, y1_canvas);
            const rectW = Math.abs(x1_canvas - x0_canvas);
            const rectH = Math.abs(y1_canvas - y0_canvas);
            
            // Draw rectangle
            const color = colors[idx % colors.length];
            this.ctx.fillStyle = color + '40'; // 25% opacity
            this.ctx.fillRect(rectX, rectY, rectW, rectH);
            
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(rectX, rectY, rectW, rectH);
            
            // Draw ID label
            this.ctx.fillStyle = color;
            this.ctx.font = 'bold 14px sans-serif';
            this.ctx.fillText(img.id, rectX + 5, rectY + 20);
            
            // Draw dimensions
            this.ctx.fillStyle = '#1f2937';
            this.ctx.font = '10px sans-serif';
            const dimText = `${(img.x1 - img.x0).toFixed(2)}×${(img.y1 - img.y0).toFixed(2)} ${this.unit}`;
            this.ctx.fillText(dimText, rectX + 5, rectY + rectH - 5);
        });
        
        // Draw scale info
        this.ctx.fillStyle = '#374151';
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(`Range: X: [${minX.toFixed(2)}, ${maxX.toFixed(2)}] ${this.unit}`, 10, this.canvas.height - 25);
        this.ctx.fillText(`       Y: [${minY.toFixed(2)}, ${maxY.toFixed(2)}] ${this.unit}`, 10, this.canvas.height - 10);
    }
    
    worldToCanvasX(worldX, minX, maxX) {
        const margin = 50;
        const usableWidth = this.canvas.width - 2 * margin;
        return margin + ((worldX - minX) / (maxX - minX)) * usableWidth;
    }
    
    worldToCanvasY(worldY, minY, maxY) {
        const margin = 30;
        const usableHeight = this.canvas.height - 2 * margin;
        // Flip Y axis (canvas Y increases downward, but we want Y to increase upward)
        return this.canvas.height - margin - ((worldY - minY) / (maxY - minY)) * usableHeight;
    }
    
    removeImage(idx) {
        this.images.splice(idx, 1);
        document.getElementById('upload-count').textContent = 
            `${this.images.length} image(s) uploaded`;
        this.renderImagesList();
        this.updateSpatialVisualization();
        this.checkReadyToProcess();
    }
    
    checkReadyToProcess() {
        const ready = this.classification && this.images.length > 0;
        document.getElementById('process-batch-btn').disabled = !ready;
    }
    
    async processBatch() {
        console.log('Starting batch processing...');
        console.log('Images:', this.images.length);
        console.log('Classification:', this.classification);
        console.log('Using backend processing:', this.useBackendProcessing);
        
        // Check for very large images and warn user
        const largeImages = this.images.filter(img => img.file.size > 10 * 1024 * 1024); // > 10MB
        if (largeImages.length > 0) {
            const totalSize = this.images.reduce((sum, img) => sum + img.file.size, 0);
            console.warn(`Processing ${largeImages.length} large image(s). Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
            console.log('Backend processing will handle high-resolution images efficiently.');
        }
        
        const statusDiv = document.getElementById('process-status');
        statusDiv.textContent = 'Preparing images...';
        statusDiv.classList.remove('text-green-600', 'text-red-600', 'font-semibold');
        this.results = [];
        
        try {
            if (this.useBackendProcessing) {
                // Use backend processing for better performance
                await this.processBackend();
            } else {
                // Legacy client-side processing (kept for compatibility)
                await this.processClient();
            }
        } catch (error) {
            console.error('Error during batch processing:', error);
            statusDiv.textContent = 'Error: ' + error.message;
            statusDiv.classList.add('text-red-600', 'font-semibold');
        }
    }
    
    async processBackend() {
        console.log('Using backend processing...');
        const statusDiv = document.getElementById('process-status');
        
        // Step 1: Create job
        statusDiv.textContent = 'Creating processing job...';
        const jobResponse = await fetch('/batch/backend/create_job', {
            method: 'POST'
        });
        
        if (!jobResponse.ok) {
            throw new Error('Failed to create processing job');
        }
        
        const jobData = await jobResponse.json();
        this.currentJobId = jobData.job_id;
        console.log('Job created:', this.currentJobId);
        
        // Step 2: Prepare image data
        statusDiv.textContent = 'Uploading images...';
        const imageData = await Promise.all(this.images.map(img => this.prepareImageData(img)));
        
        // Step 3: Send to backend for processing
        statusDiv.textContent = 'Processing on server...';
        const processResponse = await fetch('/batch/backend/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                job_id: this.currentJobId,
                images: imageData,
                classification: this.classification
            })
        });
        
        if (!processResponse.ok) {
            const errorData = await processResponse.json();
            throw new Error(errorData.message || 'Backend processing failed');
        }
        
        const result = await processResponse.json();
        console.log('Backend processing complete:', result);
        
        // Store results
        this.results = result.results;
        
        statusDiv.textContent = 'Complete!';
        statusDiv.classList.add('text-green-600', 'font-semibold');
        
        this.displayResults();
    }
    
    async prepareImageData(imgData) {
        /**
         * Prepare image data for backend processing
         * Converts File to base64 for JSON transfer
         */
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    id: imgData.id,
                    name: imgData.name,
                    file: e.target.result,  // base64 data URL
                    x0: imgData.x0,
                    y0: imgData.y0,
                    x1: imgData.x1,
                    y1: imgData.y1
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(imgData.file);
        });
    }
    
    async processClient() {
        /**
         * Legacy client-side processing
         * Kept for compatibility but not recommended for large images
         */
        console.log('Using client-side processing (legacy)...');
        const statusDiv = document.getElementById('process-status');
        
        for (let i = 0; i < this.images.length; i++) {
            const img = this.images[i];
            console.log(`Processing image ${i + 1}/${this.images.length}:`, img.name);
            
            statusDiv.textContent = `Processing ${i + 1}/${this.images.length}... (${img.name})`;
            
            const result = await this.processImage(img);
            console.log(`Result for ${img.name}:`, result);
            this.results.push(result);
            
            // Small delay to prevent UI freezing
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        console.log('All images processed. Results:', this.results);
        
        statusDiv.textContent = 'Complete!';
        statusDiv.classList.add('text-green-600', 'font-semibold');
        
        this.displayResults();
    }
    
    async processImage(imgData) {
        console.log('Processing image:', imgData.name, 'Size:', (imgData.file.size / 1024 / 1024).toFixed(2), 'MB');
        return new Promise((resolve, reject) => {
            try {
                // Use createObjectURL instead of FileReader for better memory handling
                const objectURL = URL.createObjectURL(imgData.file);
                
                const img = new Image();
                img.onload = () => {
                    try {
                        console.log('Image loaded, dimensions:', img.width, 'x', img.height);
                        
                        // Create canvas and apply classification
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(img, 0, 0);
                        
                        // Get image data
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        console.log('Classifying image data... Total pixels:', imageData.data.length / 4);
                        const classifiedData = this.classifyImageData(imageData);
                        
                        // Calculate areal fractions
                        console.log('Calculating areal fractions...');
                        const arealFractions = this.calculateArealFraction(classifiedData, canvas.width, canvas.height);
                        console.log('Areal fractions:', arealFractions);
                        
                        // Calculate scale for this specific image (pixels per unit)
                        const xScale = canvas.width / Math.abs(imgData.x1 - imgData.x0);
                        const yScale = canvas.height / Math.abs(imgData.y1 - imgData.y0);
                        
                        // Clean up the object URL
                        URL.revokeObjectURL(objectURL);
                        
                        resolve({
                            id: imgData.id,
                            original: objectURL,  // We'll need to recreate this for display
                            classified: classifiedData,
                            metadata: {
                                name: imgData.name,
                                id: imgData.id,
                                x0: imgData.x0,
                                y0: imgData.y0,
                                x1: imgData.x1,
                                y1: imgData.y1,
                                width: canvas.width,
                                height: canvas.height,
                                x_center: (imgData.x0 + imgData.x1) / 2,
                                y_center: (imgData.y0 + imgData.y1) / 2,
                                xScale: xScale,  // pixels per unit in X direction
                                yScale: yScale,  // pixels per unit in Y direction
                                physicalWidth: Math.abs(imgData.x1 - imgData.x0),
                                physicalHeight: Math.abs(imgData.y1 - imgData.y0)
                            },
                            arealFractions: arealFractions,
                            canvas: canvas,
                            file: imgData.file  // Keep reference to original file
                        });
                    } catch (err) {
                        console.error('Error processing image:', err);
                        URL.revokeObjectURL(objectURL);
                        reject(err);
                    }
                };
                img.onerror = (err) => {
                    console.error('Error loading image:', err);
                    console.error('File details:', imgData.file.name, imgData.file.type, imgData.file.size);
                    URL.revokeObjectURL(objectURL);
                    reject(new Error(`Failed to load image: ${imgData.file.name}. File might be corrupted or too large.`));
                };
                img.src = objectURL;
            } catch (err) {
                console.error('Error in processImage:', err);
                reject(err);
            }
        });
    }
    
    classifyImageData(imageData) {
        // Apply LAB classification to image data
        // This is similar to the main interface classification
        const pixels = imageData.data;
        const classified = new Uint8Array(pixels.length / 4);
        
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            
            // Convert RGB to LAB
            const lab = this.rgbToLab(r, g, b);
            
            // Check against all phases
            let matchedPhase = 0;
            for (const phaseId in this.classification.phases) {
                const phase = this.classification.phases[phaseId];
                const ranges = phase.labRanges;
                
                if (lab.L >= ranges.L.min && lab.L <= ranges.L.max &&
                    lab.a >= ranges.a.min && lab.a <= ranges.a.max &&
                    lab.b >= ranges.b.min && lab.b <= ranges.b.max) {
                    matchedPhase = parseInt(phaseId);
                    break;
                }
            }
            
            classified[i / 4] = matchedPhase;
        }
        
        return classified;
    }
    
    rgbToLab(r, g, b) {
        // Simple RGB to LAB conversion (same as main interface)
        // Normalize RGB
        r = r / 255;
        g = g / 255;
        b = b / 255;
        
        // Apply gamma correction
        r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
        
        // RGB to XYZ (D65 illuminant)
        let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
        let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
        let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
        
        // Normalize for D65
        x = x / 0.95047;
        y = y / 1.00000;
        z = z / 1.08883;
        
        // XYZ to LAB
        x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
        y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
        z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
        
        const L = (116 * y) - 16;
        const a = 500 * (x - y);
        const b_val = 200 * (y - z);
        
        return { L, a, b: b_val };
    }
    
    calculateArealFraction(classifiedData, width, height) {
        const fractions = {};
        const total = classifiedData.length;
        
        // Initialize counters
        for (const phaseId in this.classification.phases) {
            fractions[phaseId] = 0;
        }
        fractions[0] = 0; // Unclassified
        
        // Count pixels
        for (let pixel of classifiedData) {
            fractions[pixel]++;
        }
        
        // Convert to percentages
        for (const key in fractions) {
            fractions[key] = (fractions[key] / total) * 100;
        }
        
        return fractions;
    }
    
    displayResults() {
        console.log('Displaying results...');
        document.getElementById('results-section').style.display = 'block';
        
        try {
            // Render stacked images
            console.log('Rendering stacked images...');
            this.renderStackedImages();
            
            // Plot distribution
            console.log('Plotting distribution...');
            this.plotDistribution();
            
            console.log('Results displayed successfully');
        } catch (error) {
            console.error('Error displaying results:', error);
        }
    }
    
    renderStackedImages() {
        const container = document.getElementById('stacked-images-container');
        container.innerHTML = '';
        
        // Sort results by position
        const sortedResults = [...this.results].sort((a, b) => 
            a.metadata.x_center - b.metadata.x_center
        );
        
        // Create stacked view
        sortedResults.forEach((result, idx) => {
            const div = document.createElement('div');
            div.className = 'border-b border-gray-200 p-2';
            
            // Check if we have backend previews or need to render client-side
            if (result.previews) {
                // Backend processing - use previews
                const imgSrc = this.currentView === 'original' ? result.previews.original : result.previews.overlay;
                const imgLabel = this.currentView === 'original' ? 'original' : 'classified';
                
                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-semibold text-gray-700 min-w-[150px]">
                            ${result.metadata.name}
                        </span>
                        <img src="${imgSrc}" 
                             class="border border-gray-300 cursor-pointer hover:opacity-80 transition-opacity" 
                             style="max-height: 120px; width: auto;"
                             alt="${result.metadata.name} ${imgLabel}"
                             onclick="window.batchProcessor.showImageModal('${imgSrc}', '${result.metadata.name} (${imgLabel})')">
                    </div>
                `;
            } else {
                // Client-side processing - use canvas
                const canvas = result.canvas;
                const classifiedCanvas = document.createElement('canvas');
                classifiedCanvas.width = canvas.width;
                classifiedCanvas.height = canvas.height;
                const ctx = classifiedCanvas.getContext('2d');
                
                // Draw classified overlay
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;
                
                for (let i = 0; i < result.classified.length; i++) {
                    const phaseId = result.classified[i];
                    if (phaseId > 0 && this.classification.phases[phaseId]) {
                        const color = this.hexToRgb(this.classification.phases[phaseId].color);
                        pixels[i * 4] = color.r;
                        pixels[i * 4 + 1] = color.g;
                        pixels[i * 4 + 2] = color.b;
                        pixels[i * 4 + 3] = 180; // Alpha
                    } else {
                        pixels[i * 4 + 3] = 0; // Transparent for unclassified
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                
                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-semibold text-gray-700 min-w-[150px]">
                            ${result.metadata.name}
                        </span>
                        <canvas class="border border-gray-300" style="max-width: 200px; height: auto;"></canvas>
                    </div>
                `;
                
                const canvasTarget = div.querySelector('canvas');
                canvasTarget.width = canvas.width;
                canvasTarget.height = canvas.height;
                const targetCtx = canvasTarget.getContext('2d');
                targetCtx.drawImage(canvas, 0, 0);
                targetCtx.globalAlpha = 0.7;
                targetCtx.drawImage(classifiedCanvas, 0, 0);
            }
            
            container.appendChild(div);
        });
    }
    
    plotDistribution() {
        // Prepare data for Plotly
        const traces = [];
        
        // Check if we have results
        if (this.results.length === 0) return;
        
        // For single image with X-distribution data: show distribution across X-axis
        // For multiple images: show distribution across image positions
        
        if (this.results.length === 1 && this.results[0].xDistribution) {
            // SINGLE IMAGE MODE: Use X-axis distribution from backend
            console.log('[PLOT] Single image mode - using X-axis distribution from backend');
            
            const result = this.results[0];
            const xDist = result.xDistribution;
            
            // Create trace for each phase
            for (const phaseId in this.classification.phases) {
                const phase = this.classification.phases[phaseId];
                
                if (xDist.phaseFractions[phaseId]) {
                    traces.push({
                        x: xDist.xPositions,
                        y: xDist.phaseFractions[phaseId],
                        name: phase.name,
                        type: 'scatter',
                        mode: 'lines+markers',
                        line: { color: phase.color, width: 2 },
                        marker: { color: phase.color, size: 6 }
                    });
                }
            }
            
            const layout = {
                title: 'Phase Distribution Across Image (X-axis)',
                xaxis: { 
                    title: `Distance (${this.unit})`,
                    showgrid: true,
                    zeroline: false
                },
                yaxis: { 
                    title: 'Areal Fraction (%)',
                    showgrid: true,
                    zeroline: true,
                    range: [0, 100]
                },
                showlegend: true,
                hovermode: 'closest',
                plot_bgcolor: '#f9fafb',
                paper_bgcolor: 'white'
            };
            
            Plotly.newPlot('distribution-plot', traces, layout);
            
        } else {
            // MULTIPLE IMAGE MODE: Show distribution across image positions
            console.log('[PLOT] Multiple image mode - showing per-image distribution');
            
            // Get sorted positions
            const sortedResults = [...this.results].sort((a, b) => 
                a.metadata.x_center - b.metadata.x_center
            );
            
            const xPositions = sortedResults.map(r => r.metadata.x_center);
            
            // Create trace for each phase
            for (const phaseId in this.classification.phases) {
                const phase = this.classification.phases[phaseId];
                const yValues = sortedResults.map(r => r.arealFractions[phaseId] || 0);
                
                traces.push({
                    x: xPositions,
                    y: yValues,
                    name: phase.name,
                    type: 'scatter',
                    mode: 'lines+markers',
                    line: { color: phase.color, width: 2 },
                    marker: { color: phase.color, size: 8 }
                });
            }
            
            const layout = {
                title: 'Phase Areal Fraction vs. Position',
                xaxis: { 
                    title: `Distance (${this.unit})`,
                    showgrid: true,
                    zeroline: false
                },
                yaxis: { 
                    title: 'Areal Fraction (%)',
                    showgrid: true,
                    zeroline: true,
                    range: [0, 100]
                },
                showlegend: true,
                hovermode: 'closest',
                plot_bgcolor: '#f9fafb',
                paper_bgcolor: 'white'
            };
            
            Plotly.newPlot('distribution-plot', traces, layout);
        }
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    toggleView(view) {
        // Toggle between original and classified views
        this.currentView = view;
        
        // Update button states
        const originalBtn = document.getElementById('toggle-original-btn');
        const classifiedBtn = document.getElementById('toggle-classified-btn');
        
        if (view === 'original') {
            originalBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            originalBtn.classList.add('bg-gray-300', 'text-gray-700', 'hover:bg-gray-400');
            classifiedBtn.classList.remove('bg-gray-300', 'text-gray-700', 'hover:bg-gray-400');
            classifiedBtn.classList.add('bg-blue-500', 'text-white', 'hover:bg-blue-600');
        } else {
            classifiedBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            classifiedBtn.classList.add('bg-gray-300', 'text-gray-700', 'hover:bg-gray-400');
            originalBtn.classList.remove('bg-gray-300', 'text-gray-700', 'hover:bg-gray-400');
            originalBtn.classList.add('bg-blue-500', 'text-white', 'hover:bg-blue-600');
        }
        
        // Re-render stacked images
        this.renderStackedImages();
    }
    
    toggleLegend() {
        // Toggle legend visibility
        const layout = {
            showlegend: !document.getElementById('distribution-plot').layout.showlegend
        };
        Plotly.relayout('distribution-plot', layout);
    }
    
    showImageModal(imgSrc, title) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
        modal.style.cursor = 'pointer';
        modal.onclick = () => modal.remove();
        
        modal.innerHTML = `
            <div class="relative max-w-7xl max-h-screen p-4">
                <div class="bg-white rounded-lg p-4">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-lg font-semibold">${title}</h3>
                        <button class="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
                    </div>
                    <img src="${imgSrc}" 
                         class="max-w-full max-h-[80vh] object-contain mx-auto" 
                         onclick="event.stopPropagation()"
                         alt="${title}">
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    exportStackedImages() {
        // TODO: Export stacked images as single file
        alert('Export stacked images - Coming soon!');
    }
    
    exportDataCSV() {
        // If we have a job ID (backend processing), download full ZIP
        if (this.currentJobId && this.useBackendProcessing) {
            this.exportBackendZip();
            return;
        }
        
        // Otherwise, generate CSV client-side (legacy)
        let csv = `Image ID,Image Name,X0 (${this.unit}),Y0 (${this.unit}),X1 (${this.unit}),Y1 (${this.unit}),X_Center (${this.unit}),Y_Center (${this.unit}),Width (${this.unit}),Height (${this.unit}),Width (px),Height (px)`;
        
        // Add phase column headers
        for (const phaseId in this.classification.phases) {
            const phase = this.classification.phases[phaseId];
            csv += `,${phase.name} (%)`;
        }
        csv += '\n';
        
        // Add data rows
        this.results.forEach(result => {
            const meta = result.metadata;
            csv += `${meta.id},${meta.name},${meta.x0},${meta.y0},${meta.x1},${meta.y1},${meta.x_center},${meta.y_center},${meta.physicalWidth.toFixed(4)},${meta.physicalHeight.toFixed(4)},${meta.width},${meta.height}`;
            for (const phaseId in this.classification.phases) {
                csv += `,${(result.arealFractions[phaseId] || 0).toFixed(2)}`;
            }
            csv += '\n';
        });
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_results_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    async exportBackendZip() {
        /**
         * Download complete ZIP file from backend
         * Includes: CSV, original images, classified images, metadata JSON
         */
        try {
            console.log('Downloading ZIP export from backend...');
            
            // Encode classification as URL parameter
            const classificationJson = encodeURIComponent(JSON.stringify(this.classification));
            const url = `/batch/backend/export/${this.currentJobId}?classification=${classificationJson}`;
            
            // Create temporary link to trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = `batch_results_${this.currentJobId.slice(0, 8)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            console.log('ZIP download started');
        } catch (error) {
            console.error('Error exporting ZIP:', error);
            alert('Error downloading results: ' + error.message);
        }
    }
    
    exportPlot() {
        Plotly.downloadImage('distribution-plot', {
            format: 'png',
            width: 1200,
            height: 600,
            filename: 'phase_distribution_plot'
        });
    }
}

// Initialize on page load
let batchProcessor;
document.addEventListener('DOMContentLoaded', () => {
    batchProcessor = new BatchProcessor();
    
    // Make globally accessible for cross-tab communication
    window.batchProcessor = batchProcessor;
});
