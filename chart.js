/**
 * High-Performance Custom Canvas Chart
 * Renders glowing real-time evolution trend charts without external libraries.
 */
class EvolutionChart {
    /**
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        
        // Listen to window resizes
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Resizes canvas based on device pixel ratio to maintain razor-sharp graphics
     */
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Only set width if size is non-zero (to prevent crash in hidden elements)
        this.canvas.width = (rect.width || 300) * dpr;
        this.canvas.height = (rect.height || 180) * dpr;
        
        this.ctx.scale(dpr, dpr);
        this.width = rect.width || 300;
        this.height = rect.height || 180;
    }

    /**
     * Renders evolution history to canvas
     * @param {object[]} history - Array of { generation, maxFitness, avgFitness }
     */
    draw(history) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Styling Config
        const padding = { top: 15, right: 15, bottom: 25, left: 40 };
        const plotWidth = this.width - padding.left - padding.right;
        const plotHeight = this.height - padding.top - padding.bottom;

        // Draw background grid lines and coordinates
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        this.ctx.font = '9px "Outfit", "Inter", sans-serif';
        this.ctx.fillStyle = '#718096';

        // 4 Grid horizontal rows
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (plotHeight * i) / 4;
            this.ctx.beginPath();
            this.ctx.moveTo(padding.left, y);
            this.ctx.lineTo(this.width - padding.right, y);
            this.ctx.stroke();
        }

        if (!history || history.length === 0) {
            // Draw empty placeholder text
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.font = '12px "Outfit", "Inter", sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Menunggu Data Evolusi...', this.width / 2, this.height / 2);
            return;
        }

        // Auto-scale limits
        const maxVal = Math.max(...history.map(d => d.maxFitness), 10);
        const yMax = Math.ceil(maxVal * 1.15); // Add 15% padding at top
        const xMax = Math.max(history.length, 5); // Minimum 5 generations on X axis

        // Draw Y Axis Labels
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        for (let i = 0; i <= 4; i++) {
            const val = yMax - (yMax * i) / 4;
            const y = padding.top + (plotHeight * i) / 4;
            this.ctx.fillText(Math.round(val), padding.left - 8, y);
        }

        // Draw X Axis Labels (every 5 generations or just min/max)
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        const labelInterval = Math.max(1, Math.ceil(history.length / 5));
        for (let i = 0; i < history.length; i += labelInterval) {
            const x = padding.left + (plotWidth * i) / (xMax - 1);
            this.ctx.fillText(`G${history[i].generation}`, x, this.height - padding.bottom + 6);
        }
        
        // Draw final generation label if not already drawn
        if ((history.length - 1) % labelInterval !== 0) {
            const x = padding.left + (plotWidth * (history.length - 1)) / (xMax - 1);
            this.ctx.fillText(`G${history[history.length - 1].generation}`, x, this.height - padding.bottom + 6);
        }

        // Helper to convert data point to canvas coordinate
        const getCoords = (index, value) => {
            const x = padding.left + (plotWidth * index) / (xMax - 1);
            const y = padding.top + plotHeight - (plotHeight * value) / yMax;
            return { x, y };
        };

        // Draw Max Fitness Line (Cyan Glowing Trail)
        this.drawLine(
            history.map((d, i) => getCoords(i, d.maxFitness)),
            '#00f0ff',
            'rgba(0, 240, 255, 0.15)'
        );

        // Draw Average Fitness Line (Purple Glowing Trail)
        this.drawLine(
            history.map((d, i) => getCoords(i, d.avgFitness)),
            '#bc00dd',
            'rgba(188, 0, 221, 0.12)'
        );
    }

    /**
     * Helper to draw a stylized neon line graph path
     * @param {object[]} points - Array of {x, y} coordinates
     * @param {string} color - Hex/RGB color
     * @param {string} fillGradientColor - Color for bottom fill gradient
     */
    drawLine(points, color, fillGradientColor) {
        if (points.length < 2) return;

        const ctx = this.ctx;

        // Draw fill under the line
        ctx.beginPath();
        const start = points[0];
        ctx.moveTo(start.x, this.height - 25); // Baseline Y
        for (const p of points) {
            ctx.lineTo(p.x, p.y);
        }
        const last = points[points.length - 1];
        ctx.lineTo(last.x, this.height - 25);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, fillGradientColor);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Draw glowing line back-layer
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // Reset shadow for subsequent drawings
        ctx.shadowBlur = 0;
    }
}
