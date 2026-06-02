/**
 * Simulation and Physics Engine
 * Handles raycasting, multi-vehicle physics, particle effects, and interactive drawing.
 */

// Canvas roundRect Polyfill for older browsers/environments
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (typeof r === 'number') {
            r = [r];
        }
        if (r.length === 1) {
            r = [r[0], r[0], r[0], r[0]];
        }
        r = [
            Math.min(r[0] || 0, w / 2, h / 2),
            Math.min(r[1] || 0, w / 2, h / 2),
            Math.min(r[2] || 0, w / 2, h / 2),
            Math.min(r[3] || 0, w / 2, h / 2)
        ];
        this.moveTo(x + r[0], y);
        this.lineTo(x + w - r[1], y);
        this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
        this.lineTo(x + w, y + h - r[2]);
        this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
        this.lineTo(x + r[3], y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
        this.lineTo(x, y + r[0]);
        this.quadraticCurveTo(x, y, x + r[0], y);
        return this;
    };
}

// Math Helper: Intersection of two line segments (AB and CD)
function getIntersection(A, B, C, D) {
    const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
    const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
    const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);

    if (bottom !== 0) {
        const t = tTop / bottom;
        const u = uTop / bottom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: A.x + t * (B.x - A.x),
                y: A.y + t * (B.y - A.y),
                offset: t
            };
        }
    }
    return null;
}

// Particle System for crashes and targets
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() * 2 - 1) * 3;
        this.vy = (Math.random() * 2 - 1) * 3;
        this.alpha = 1;
        this.color = color;
        this.size = Math.random() * 3 + 2;
        this.gravity = 0.05;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.alpha -= 0.02;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Agent {
    constructor(x, y, brain, type = 'drone') {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.brain = brain;
        this.type = type;

        // Common Physics Variables
        this.angle = -Math.PI / 2; // Point upwards initially
        this.velocity = 0;
        this.vx = 0;
        this.vy = 0;
        this.width = 16;
        this.height = 16;
        this.radius = 10;

        // Evolutionary State
        this.crashed = false;
        this.reachedTarget = false;
        this.stepsTaken = 0;
        this.maxSteps = 800; // Cap alive time to prevent infinite circles
        this.fitness = 0;

        // Configuration per type
        this.setupPhysics();

        // 5 Sensors (angles relative to heading)
        this.sensorAngles = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2];
        this.sensorRange = 160;
        this.sensors = []; // Populated with reading values
    }

    setupPhysics() {
        switch (this.type) {
            case 'car':
                this.maxSpeed = 3.5;
                this.friction = 0.04;
                this.turnSpeed = 0.06;
                this.acceleration = 0.15;
                break;
            case 'ant':
                this.maxSpeed = 2.0;
                this.friction = 0.08;
                this.turnSpeed = 0.15; // Ants turn very quickly
                this.acceleration = 0.3;
                break;
            case 'fly':
                this.maxSpeed = 4.0;
                this.friction = 0.03;
                this.turnSpeed = 0.12;
                this.acceleration = 0.25;
                break;
            case 'plane':
                this.maxSpeed = 5.0;
                this.friction = 0.01;
                this.turnSpeed = 0.04; // Wide turns
                this.acceleration = 0.08;
                this.velocity = 2.0; // Planes always fly forward
                break;
            case 'drone':
            default:
                this.maxSpeed = 3.8;
                this.friction = 0.03;
                this.turnSpeed = 0.08;
                this.acceleration = 0.2;
                break;
        }
    }

    // Gathers sensor data & feeds it to the neural network
    update(walls, target, canvasWidth, canvasHeight) {
        if (this.crashed || this.reachedTarget) return;

        this.stepsTaken++;
        if (this.stepsTaken >= this.maxSteps) {
            this.crashed = true;
            return;
        }

        // 1. Calculate Raycast Sensors
        this.updateSensors(walls, canvasWidth, canvasHeight);

        // 2. Prepare Neural Network Inputs
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);

        // Target angle relative to current heading
        let angleToTarget = Math.atan2(dy, dx) - this.angle;
        // Normalize angle difference to [-1, 1] range
        while (angleToTarget > Math.PI) angleToTarget -= Math.PI * 2;
        while (angleToTarget < -Math.PI) angleToTarget += Math.PI * 2;
        const normAngle = angleToTarget / Math.PI;

        const maxCanvasDist = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight);
        const normDistance = Math.min(1, distToTarget / maxCanvasDist);

        // Inputs array (Total: 8 inputs)
        // 5 sensors + relative target angle + distance ratio + normalized current speed
        const inputs = [
            ...this.sensors.map(s => s.reading),
            normAngle,
            normDistance,
            this.velocity / this.maxSpeed
        ];

        // 3. Feedforward Neural Network (Outputs range: [-1, 1])
        const outputs = this.brain.feedForward(inputs);
        const steerOutput = outputs[0]; // [-1 = hard left, 1 = hard right]
        const throttleOutput = outputs[1]; // [-1 = hard brake/reverse, 1 = max forward]

        // 4. Update Physics based on Vehicle type
        this.applyControl(steerOutput, throttleOutput);

        // Check bounds
        if (this.x < 0 || this.x > canvasWidth || this.y < 0 || this.y > canvasHeight) {
            this.crashed = true;
            return;
        }

        // Check target hit
        if (distToTarget < target.radius + this.radius) {
            this.reachedTarget = true;
        }

        // Check wall collision
        for (const wall of walls) {
            if (this.checkWallCollision(wall)) {
                this.crashed = true;
                break;
            }
        }
    }

    applyControl(steer, throttle) {
        // Steering
        this.angle += steer * this.turnSpeed;

        // Handle movement details per type
        switch (this.type) {
            case 'car':
                // Cars steering is relative to speed
                if (this.velocity !== 0) {
                    const currentSteer = steer * this.turnSpeed * (this.velocity > 0 ? 1 : -0.5);
                    this.angle += currentSteer;
                }
                
                if (throttle > 0) {
                    this.velocity += throttle * this.acceleration;
                } else {
                    this.velocity += throttle * this.acceleration * 1.5; // Stronger brake
                }
                
                this.velocity -= this.velocity * this.friction;
                this.velocity = Math.max(-this.maxSpeed / 2, Math.min(this.maxSpeed, this.velocity));

                this.x += Math.cos(this.angle) * this.velocity;
                this.y += Math.sin(this.angle) * this.velocity;
                break;

            case 'plane':
                // Planes have a constant forward speed and apply lift acceleration
                this.velocity += throttle * this.acceleration;
                this.velocity -= this.velocity * this.friction;
                this.velocity = Math.max(1.8, Math.min(this.maxSpeed, this.velocity)); // Minimum speed to stay airborne

                this.x += Math.cos(this.angle) * this.velocity;
                this.y += Math.sin(this.angle) * this.velocity;
                break;

            case 'ant':
                // Ants crawl rapidly, direct control
                this.velocity += throttle * this.acceleration;
                this.velocity -= this.velocity * this.friction;
                this.velocity = Math.max(0, Math.min(this.maxSpeed, this.velocity));

                this.x += Math.cos(this.angle) * this.velocity;
                this.y += Math.sin(this.angle) * this.velocity;
                break;

            case 'fly':
                // Flies hover, minor aerodynamic turbulence (chaotic vector additions)
                this.velocity += throttle * this.acceleration;
                this.velocity -= this.velocity * this.friction;
                this.velocity = Math.max(0, Math.min(this.maxSpeed, this.velocity));

                // Add small organic wobble
                const wobble = (Math.random() * 2 - 1) * 0.4;
                this.vx = Math.cos(this.angle) * this.velocity + Math.sin(this.angle) * wobble;
                this.vy = Math.sin(this.angle) * this.velocity - Math.cos(this.angle) * wobble;

                this.x += this.vx;
                this.y += this.vy;
                break;

            case 'drone':
            default:
                // Drones drift smoothly in 2D space (inertial damping physics)
                const targetVx = Math.cos(this.angle) * Math.max(0, throttle) * this.maxSpeed;
                const targetVy = Math.sin(this.angle) * Math.max(0, throttle) * this.maxSpeed;

                // Smooth linear interpolation for inertia drift
                this.vx += (targetVx - this.vx) * 0.08;
                this.vy += (targetVy - this.vy) * 0.08;

                this.x += this.vx;
                this.y += this.vy;
                this.velocity = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                break;
        }
    }

    updateSensors(walls, canvasWidth, canvasHeight) {
        this.sensors = [];

        for (let i = 0; i < this.sensorAngles.length; i++) {
            const rayAngle = this.angle + this.sensorAngles[i];
            const rayStart = { x: this.x, y: this.y };
            const rayEnd = {
                x: this.x + Math.cos(rayAngle) * this.sensorRange,
                y: this.y + Math.sin(rayAngle) * this.sensorRange
            };

            let closestIntersection = null;

            // Check intersections with drawn walls
            for (const wall of walls) {
                const intersect = getIntersection(rayStart, rayEnd, wall.start, wall.end);
                if (intersect) {
                    if (!closestIntersection || intersect.offset < closestIntersection.offset) {
                        closestIntersection = intersect;
                    }
                }
            }

            // Check intersections with canvas borders
            const borders = [
                { start: { x: 0, y: 0 }, end: { x: canvasWidth, y: 0 } },
                { start: { x: canvasWidth, y: 0 }, end: { x: canvasWidth, y: canvasHeight } },
                { start: { x: canvasWidth, y: canvasHeight }, end: { x: 0, y: canvasHeight } },
                { start: { x: 0, y: canvasHeight }, end: { x: 0, y: 0 } }
            ];

            for (const border of borders) {
                const intersect = getIntersection(rayStart, rayEnd, border.start, border.end);
                if (intersect) {
                    if (!closestIntersection || intersect.offset < closestIntersection.offset) {
                        closestIntersection = intersect;
                    }
                }
            }

            // 1 means free path, lower values mean obstacle is close
            const reading = closestIntersection ? closestIntersection.offset : 1;
            const endPoint = closestIntersection ? closestIntersection : rayEnd;

            this.sensors.push({
                reading,
                start: rayStart,
                end: endPoint
            });
        }
    }

    checkWallCollision(wall) {
        // Simplify collision as distance to line segment within circle radius
        const A = wall.start;
        const B = wall.end;
        const P = { x: this.x, y: this.y };

        const l2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
        if (l2 === 0) return Math.sqrt((P.x - A.x) ** 2 + (P.y - A.y) ** 2) < this.radius;

        // Projection coefficient
        let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
        t = Math.max(0, Math.min(1, t));

        const projection = {
            x: A.x + t * (B.x - A.x),
            y: A.y + t * (B.y - A.y)
        };

        const dist = Math.sqrt((P.x - projection.x) ** 2 + (P.y - projection.y) ** 2);
        return dist < this.radius;
    }

    draw(ctx, focused = false) {
        if (this.crashed) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Core Glowing/Focused effects
        if (focused) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00f0ff';
        } else {
            ctx.shadowBlur = 0;
        }

        // Draw vehicle based on type
        switch (this.type) {
            case 'car':
                this.drawCar(ctx, focused);
                break;
            case 'ant':
                this.drawAnt(ctx, focused);
                break;
            case 'fly':
                this.drawFly(ctx, focused);
                break;
            case 'plane':
                this.drawPlane(ctx, focused);
                break;
            case 'drone':
            default:
                this.drawDrone(ctx, focused);
                break;
        }

        ctx.restore();

        // Draw sensor beams ONLY for the focused agent
        if (focused) {
            this.drawSensorBeams(ctx);
        }
    }

    drawDrone(ctx, focused) {
        const cyan = focused ? '#00f0ff' : 'rgba(0, 240, 255, 0.4)';
        const glow = focused ? '#39ff14' : 'rgba(57, 255, 20, 0.4)';

        // Quadcopter frame (X shape)
        ctx.strokeStyle = focused ? '#a0aec0' : 'rgba(160, 174, 192, 0.3)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-10, -10); ctx.lineTo(10, 10);
        ctx.moveTo(10, -10); ctx.lineTo(-10, 10);
        ctx.stroke();

        // Central Pod (Core)
        ctx.fillStyle = focused ? '#1a202c' : 'rgba(26, 32, 44, 0.5)';
        ctx.strokeStyle = cyan;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Rotors
        ctx.strokeStyle = glow;
        ctx.lineWidth = 1;
        const points = [
            { x: -10, y: -10 },
            { x: 10, y: -10 },
            { x: -10, y: 10 },
            { x: 10, y: 10 }
        ];

        const rTime = Date.now() * 0.05;
        for (const p of points) {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 4, 1.5, rTime + p.x, 0, Math.PI * 2);
            ctx.stroke();
            // Tiny Rotor center dot
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Dynamic thruster particle visual (back flame)
        if (focused && Math.random() < 0.7) {
            ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(-14, 0, 2 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawCar(ctx, focused) {
        const bodyColor = focused ? '#bc00dd' : 'rgba(188, 0, 221, 0.5)';
        const accent = focused ? '#00f0ff' : 'rgba(0, 240, 255, 0.4)';

        // Car chassis
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.roundRect(-9, -6, 18, 12, 3);
        ctx.fill();

        // Windshield
        ctx.fillStyle = '#2d3748';
        ctx.beginPath();
        ctx.roundRect(1, -4, 4, 8, 1);
        ctx.fill();

        // Headlights (glowing yellow arcs in front)
        ctx.fillStyle = accent;
        ctx.fillRect(8, -5, 2, 2);
        ctx.fillRect(8, 3, 2, 2);
    }

    drawAnt(ctx, focused) {
        const color = focused ? '#39ff14' : 'rgba(57, 255, 20, 0.4)';
        ctx.fillStyle = color;

        // Head, Thorax, Abdomen segments
        ctx.beginPath();
        ctx.arc(7, 0, 3, 0, Math.PI * 2); // Head
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2); // Thorax
        ctx.arc(-7, 0, 4, 0, Math.PI * 2); // Abdomen
        ctx.fill();

        // Legs (moving based on ticks)
        ctx.strokeStyle = focused ? '#ffffff' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        const tick = Date.now() * 0.02;
        const legOffsets = [Math.sin(tick), Math.sin(tick + Math.PI / 2), Math.sin(tick + Math.PI)];

        // Left Legs
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-2 + legOffsets[0], -6);
        ctx.moveTo(2, 0); ctx.lineTo(1 + legOffsets[1], -7);
        ctx.moveTo(-2, 0); ctx.lineTo(-4 + legOffsets[2], -6);
        // Right Legs
        ctx.moveTo(0, 0); ctx.lineTo(-2 - legOffsets[0], 6);
        ctx.moveTo(2, 0); ctx.lineTo(1 - legOffsets[1], 7);
        ctx.moveTo(-2, 0); ctx.lineTo(-4 - legOffsets[2], 6);
        ctx.stroke();
    }

    drawFly(ctx, focused) {
        const bodyColor = focused ? '#ffe600' : 'rgba(255, 230, 0, 0.4)';
        
        // Circular fly body
        ctx.fillStyle = '#171923';
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(5, -3, 2, 0, Math.PI * 2);
        ctx.arc(5, 3, 2, 0, Math.PI * 2);
        ctx.fill();

        // Flapping Wings
        ctx.save();
        const wingFlap = Math.sin(Date.now() * 0.1) * 0.4;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 0.5;

        // Left wing
        ctx.beginPath();
        ctx.ellipse(-2, -5, 3, 7, -Math.PI / 4 + wingFlap, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Right wing
        ctx.beginPath();
        ctx.ellipse(-2, 5, 3, 7, Math.PI / 4 - wingFlap, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        
        ctx.restore();
    }

    drawPlane(ctx, focused) {
        const jetColor = focused ? '#a0aec0' : 'rgba(160, 174, 192, 0.4)';
        const neonTrail = focused ? '#00f0ff' : 'rgba(0, 240, 255, 0.2)';

        // Delta wing jet design
        ctx.fillStyle = jetColor;
        ctx.beginPath();
        ctx.moveTo(12, 0);       // Nose
        ctx.lineTo(-8, -10);     // Left wingtip
        ctx.lineTo(-5, -2);      // Inner body fold
        ctx.lineTo(-8, 0);       // Jet tail base
        ctx.lineTo(-5, 2);       // Inner body fold
        ctx.lineTo(-8, 10);      // Right wingtip
        ctx.closePath();
        ctx.fill();

        // Cockpit canopy
        ctx.fillStyle = neonTrail;
        ctx.beginPath();
        ctx.ellipse(3, 0, 4, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Thruster sparks
        if (Math.random() < 0.6) {
            ctx.fillStyle = '#ff6b00';
            ctx.beginPath();
            ctx.arc(-10 - Math.random() * 5, 0, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawSensorBeams(ctx) {
        for (const sensor of this.sensors) {
            // Bright red/yellow if very close to wall, blue if far
            const intensity = sensor.reading;
            const r = Math.floor((1 - intensity) * 255);
            const g = Math.floor(intensity * 200 + 55);
            const b = Math.floor(intensity * 255);

            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.15 + (1 - intensity) * 0.45})`;
            ctx.lineWidth = sensor.reading < 0.3 ? 2 : 1;

            ctx.beginPath();
            ctx.moveTo(sensor.start.x, sensor.start.y);
            ctx.lineTo(sensor.end.x, sensor.end.y);
            ctx.stroke();

            // End impact point dot
            if (sensor.reading < 1) {
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.beginPath();
                ctx.arc(sensor.end.x, sensor.end.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

class Wall {
    constructor(x1, y1, x2, y2) {
        this.start = { x: x1, y: y1 };
        this.end = { x: x2, y: y2 };
    }

    draw(ctx) {
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.stroke();

        // Sleek core lines for cyberpunk theme
        ctx.strokeStyle = '#718096';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

class Simulator {
    constructor(canvas, agentType = 'drone', onGenerationComplete = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.agentType = agentType;
        this.onGenerationComplete = onGenerationComplete;

        this.walls = [];
        this.particles = [];
        this.agents = [];

        // Spawn / Target coordinates default
        this.startPos = { x: 80, y: 300 };
        this.target = { x: 720, y: 300, radius: 25 };

        this.generation = 1;
        this.isRunning = false;
        this.simSpeed = 1; // 1x, 2x, 5x, 10x

        // Drawing state
        this.isDrawingWall = false;
        this.drawingStart = null;
        this.drawMode = 'wall'; // 'wall', 'eraser', 'start', 'target'

        this.resize();
        this.setupInputListeners();
        this.loadPreset('maze'); // Load preset initially
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width || 800;
        this.canvas.height = rect.height || 500;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    setupInputListeners() {
        const getMousePos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        };

        this.canvas.addEventListener('mousedown', (e) => {
            const pos = getMousePos(e);
            if (this.drawMode === 'wall') {
                this.isDrawingWall = true;
                this.drawingStart = pos;
            } else if (this.drawMode === 'eraser') {
                // Erase walls within radius
                this.walls = this.walls.filter(w => {
                    const d1 = Math.sqrt((w.start.x - pos.x)**2 + (w.start.y - pos.y)**2);
                    const d2 = Math.sqrt((w.end.x - pos.x)**2 + (w.end.y - pos.y)**2);
                    return d1 > 25 && d2 > 25;
                });
            } else if (this.drawMode === 'start') {
                this.startPos = pos;
            } else if (this.drawMode === 'target') {
                this.target.x = pos.x;
                this.target.y = pos.y;
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawingWall || !this.drawingStart) return;
            this.drawingEnd = getMousePos(e);
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (this.isDrawingWall && this.drawingStart && this.drawingEnd) {
                // Ignore tiny walls
                const dist = Math.sqrt(
                    (this.drawingEnd.x - this.drawingStart.x) ** 2 + 
                    (this.drawingEnd.y - this.drawingStart.y) ** 2
                );
                if (dist > 5) {
                    this.walls.push(new Wall(
                        this.drawingStart.x, this.drawingStart.y,
                        this.drawingEnd.x, this.drawingEnd.y
                    ));
                }
            }
            this.isDrawingWall = false;
            this.drawingStart = null;
            this.drawingEnd = null;
        });
    }

    loadPreset(name) {
        this.walls = [];
        this.resize();
        
        switch (name) {
            case 'empty':
                // Simply bounding walls (implicitly handled by simulator borders, no internal walls)
                this.startPos = { x: 80, y: this.height / 2 };
                this.target = { x: this.width - 80, y: this.height / 2, radius: 25 };
                break;

            case 'maze':
                this.startPos = { x: 70, y: 70 };
                this.target = { x: this.width - 70, y: this.height - 70, radius: 25 };

                // Beautiful, fully traversable cyberpunk vertical zig-zag maze
                // Alternates gaps (140px wide) between bottom and top of canvas
                const gap = 140;
                this.walls.push(new Wall(this.width * 0.28, 0, this.width * 0.28, this.height - gap));
                this.walls.push(new Wall(this.width * 0.53, gap, this.width * 0.53, this.height));
                this.walls.push(new Wall(this.width * 0.75, 0, this.width * 0.75, this.height - gap));
                break;

            case 'curve':
                // S-curve racetrack walls
                this.startPos = { x: 70, y: 80 };
                this.target = { x: 730, y: 420, radius: 25 };

                this.walls.push(new Wall(0, 180, 500, 180));
                this.walls.push(new Wall(300, 320, 800, 320));
                break;

            case 'obstacles':
                // Floating pillars
                this.startPos = { x: 80, y: this.height / 2 };
                this.target = { x: this.width - 80, y: this.height / 2, radius: 25 };

                // Central grid of vertical barricades
                const pillars = [
                    {x: 250, y: 100, l: 150},
                    {x: 400, y: 250, l: 200},
                    {x: 550, y: 50, l: 180},
                    {x: 250, y: 350, l: 100},
                    {x: 550, y: 300, l: 150}
                ];

                for (const p of pillars) {
                    this.walls.push(new Wall(p.x, p.y, p.x, p.y + p.l));
                }
                break;
        }
    }

    spawnPopulation(brains) {
        this.agents = brains.map(brain => 
            new Agent(this.startPos.x, this.startPos.y, brain, this.agentType)
        );
        this.particles = [];
        this.generationCount = brains.length;
    }

    setAgentType(type) {
        this.agentType = type;
        // Restart current simulation with the new type but same brains
        const brains = this.agents.map(a => a.brain);
        if (brains.length > 0) {
            this.spawnPopulation(brains);
        }
    }

    // Step logic: simulates physics frames
    step() {
        if (!this.isRunning || this.agents.length === 0) return;

        let allDone = true;
        const maxDist = Math.sqrt(this.width * this.width + this.height * this.height);

        for (const agent of this.agents) {
            if (!agent.crashed && !agent.reachedTarget) {
                allDone = false;
                agent.update(this.walls, this.target, this.width, this.height);

                if (agent.crashed) {
                    // Spawn red sparks on crash
                    this.spawnParticles(agent.x, agent.y, '#f56565', 8);
                } else if (agent.reachedTarget) {
                    // Spawn golden fireworks on reach
                    this.spawnParticles(agent.x, agent.y, '#ecc94b', 20);
                }
            }
        }

        // Particle updates
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        if (allDone) {
            // Evolve generation
            this.evaluateFitnesses(maxDist);
            if (this.onGenerationComplete) {
                this.onGenerationComplete(this.agents);
            }
        }
    }

    evaluateFitnesses(maxDist) {
        for (const agent of this.agents) {
            agent.fitness = GeneticAlgorithm.calculateFitness(agent, this.startPos, this.target, maxDist);
        }
    }

    spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    // Rendering simulation
    render(focusedAgent = null) {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw structural grid in background
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
        this.ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < this.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y); this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }

        // Draw walls
        for (const wall of this.walls) {
            wall.draw(this.ctx);
        }

        // Draw currently drawing wall segment preview
        if (this.isDrawingWall && this.drawingStart && this.drawingEnd) {
            this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.drawingStart.x, this.drawingStart.y);
            this.ctx.lineTo(this.drawingEnd.x, this.drawingEnd.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Draw Spawn Gate
        this.ctx.strokeStyle = '#39ff14';
        this.ctx.fillStyle = 'rgba(57, 255, 20, 0.05)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.startPos.x, this.startPos.y, 14, 0, Math.PI * 2);
        this.ctx.fill();
        ctxCircleDash(this.ctx, this.startPos.x, this.startPos.y, 14, Date.now() * 0.002);
        this.ctx.fillStyle = '#39ff14';
        this.ctx.font = '8px "Outfit", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SPAWN', this.startPos.x, this.startPos.y - 18);

        // Draw Target Gate (Neon Purple glowing beacon)
        this.ctx.save();
        this.ctx.shadowColor = '#bc00dd';
        this.ctx.shadowBlur = 15;
        this.ctx.strokeStyle = '#bc00dd';
        this.ctx.lineWidth = 3;
        this.ctx.fillStyle = 'rgba(188, 0, 221, 0.15)';
        this.ctx.beginPath();
        this.ctx.arc(this.target.x, this.target.y, this.target.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();

        // Glowing radar ring
        const ringRad = this.target.radius + Math.abs(Math.sin(Date.now() * 0.003)) * 8;
        this.ctx.strokeStyle = 'rgba(188, 0, 221, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(this.target.x, this.target.y, ringRad, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.fillStyle = '#bc00dd';
        this.ctx.font = '9px "Outfit", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('TARGET', this.target.x, this.target.y - this.target.radius - 8);

        // Draw non-focused agents first (so focused agent renders on top)
        for (const agent of this.agents) {
            if (agent !== focusedAgent) {
                agent.draw(this.ctx, false);
            }
        }

        // Draw focused agent
        if (focusedAgent) {
            focusedAgent.draw(this.ctx, true);
        }

        // Draw particles
        for (const p of this.particles) {
            p.draw(this.ctx);
        }
    }
}

// Utility function to draw dashed rotating circle
function ctxCircleDash(ctx, x, y, r, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
