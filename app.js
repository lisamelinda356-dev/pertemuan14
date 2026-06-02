/**
 * NeuroEvolve Studio - Application Orchestrator
 * Binds HTML controls, manages genetic lifecycle, runs simulation loop,
 * and coordinates high-performance neural and chart visualizers.
 */

// Application State
let popSize = 100;
let mutationRate = 0.05;
let elitismRate = 0.05;
let hiddenLayers = [6, 4]; // Default hidden layer architecture
let isSimulating = false;
let currentSpeed = 1;
let geneticEngine = null;
let simulatorInstance = null;
let evolutionChartInstance = null;

// Spectator/Leaderboard Focus State
let focusedAgent = null;
let userLockedFocus = false; // True if user manually clicked an agent on the leaderboard

// Dynamic Neural Net Canvas sizing & context
let netCanvas = null;
let netCtx = null;

// Initialize when DOM content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Canvas selections
    const simCanvas = document.getElementById('simulationCanvas');
    const chartCanvas = document.getElementById('trendCanvas');
    netCanvas = document.getElementById('netVisualizerCanvas');
    netCtx = netCanvas.getContext('2d');

    // Make canvases look sharp and responsive
    resizeNetCanvas();
    window.addEventListener('resize', () => {
        resizeNetCanvas();
        if (simulatorInstance) {
            simulatorInstance.resize();
        }
    });

    // 1. Initialize Genetic Algorithm Engine
    geneticEngine = new GeneticAlgorithm(popSize, mutationRate, elitismRate);

    // 2. Initialize Evolution Trend Line Chart
    evolutionChartInstance = new EvolutionChart(chartCanvas);
    evolutionChartInstance.draw([]);

    // 3. Initialize Physics Simulation
    simulatorInstance = new Simulator(simCanvas, 'drone', handleGenerationComplete);

    // 4. Set default UI architectures
    renderHiddenLayersConfig();

    // 5. Setup UI Event Handlers
    bindUIEvents();

    // 6. Spawn Generation 1 population
    restartEvolution();

    // 7. Run Main Orchestrated Loop
    requestAnimationFrame(animationLoop);
}

function resizeNetCanvas() {
    if (!netCanvas) return;
    const rect = netCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    netCanvas.width = (rect.width || 300) * dpr;
    netCanvas.height = (rect.height || 180) * dpr;
    netCtx.scale(dpr, dpr);
    netCanvas.style.width = `${rect.width}px`;
    netCanvas.style.height = `${rect.height}px`;
}

// Spawns a brand new evolution run
function restartEvolution() {
    const inputs = 8;
    const outputs = 2;
    const architecture = [inputs, ...hiddenLayers, outputs];

    geneticEngine = new GeneticAlgorithm(popSize, mutationRate, elitismRate);
    evolutionChartInstance.draw([]);
    
    // Spawn population of random neural brains
    const initialBrains = [];
    for (let i = 0; i < popSize; i++) {
        initialBrains.push(new NeuralNetwork(architecture));
    }

    focusedAgent = null;
    userLockedFocus = false;
    
    simulatorInstance.generation = 1;
    simulatorInstance.spawnPopulation(initialBrains);
    updateGlobalStats();
}

// Callback invoked by simulator when all agents crash/reach target
function handleGenerationComplete(agents) {
    const inputs = 8;
    const outputs = 2;
    const architecture = [inputs, ...hiddenLayers, outputs];

    // Evolve current brains using genetic operators
    const nextBrains = geneticEngine.evolve(agents, architecture);
    
    // Redraw Trend Chart with updated history
    evolutionChartInstance.draw(geneticEngine.history);

    // Reset focused state for next generation
    focusedAgent = null;
    userLockedFocus = false;

    // Spawn new evolved population
    simulatorInstance.generation = geneticEngine.generation;
    simulatorInstance.spawnPopulation(nextBrains);
    updateGlobalStats();
}

function updateGlobalStats() {
    document.getElementById('statGeneration').textContent = simulatorInstance.generation;
    document.getElementById('statMaxFitness').textContent = 
        geneticEngine.history.length > 0 
            ? geneticEngine.history[geneticEngine.history.length - 1].maxFitness.toFixed(2)
            : '0.00';
}

function bindUIEvents() {
    // 1. Play / Pause Control
    const btnPlayPause = document.getElementById('btnPlayPause');
    const simulationStatus = document.getElementById('simulationStatus');
    const statusText = document.getElementById('statusText');

    btnPlayPause.addEventListener('click', () => {
        isSimulating = !isSimulating;
        simulatorInstance.isRunning = isSimulating;

        if (isSimulating) {
            btnPlayPause.textContent = '⏸';
            btnPlayPause.classList.add('active');
            simulationStatus.classList.add('active');
            statusText.textContent = 'BERJALAN';
        } else {
            btnPlayPause.textContent = '▶';
            btnPlayPause.classList.remove('active');
            simulationStatus.classList.remove('active');
            statusText.textContent = 'BERHENTI';
        }
    });

    // 2. Restart & Clear Walls
    document.getElementById('btnRestart').addEventListener('click', () => {
        restartEvolution();
    });

    document.getElementById('btnClearWalls').addEventListener('click', () => {
        simulatorInstance.walls = [];
    });

    // 3. Speed Control Buttons
    const speedButtons = document.querySelectorAll('.speed-controls .btn');
    speedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            speedButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSpeed = parseInt(btn.dataset.speed, 10);
            simulatorInstance.simSpeed = currentSpeed;
        });
    });

    // 4. Canvas Draw Tool Buttons
    const toolButtons = document.querySelectorAll('.draw-toolbar .btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            simulatorInstance.drawMode = btn.dataset.tool;
        });
    });

    // 5. Preset Environment Buttons
    document.getElementById('presetMaze').addEventListener('click', () => simulatorInstance.loadPreset('maze'));
    document.getElementById('presetCurve').addEventListener('click', () => simulatorInstance.loadPreset('curve'));
    document.getElementById('presetObstacles').addEventListener('click', () => simulatorInstance.loadPreset('obstacles'));
    document.getElementById('presetEmpty').addEventListener('click', () => simulatorInstance.loadPreset('empty'));

    // 6. Genetic Parameter Sliders
    const inputPopSize = document.getElementById('inputPopSize');
    inputPopSize.addEventListener('input', (e) => {
        popSize = parseInt(e.target.value, 10);
        document.getElementById('valPopSize').textContent = popSize;
        geneticEngine.populationSize = popSize;
    });

    const inputMutRate = document.getElementById('inputMutRate');
    inputMutRate.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        mutationRate = val / 100;
        document.getElementById('valMutRate').textContent = `${val}%`;
        geneticEngine.mutationRate = mutationRate;
    });

    const inputElitism = document.getElementById('inputElitism');
    inputElitism.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        elitismRate = val / 100;
        document.getElementById('valElitism').textContent = `${val}%`;
        geneticEngine.elitismRate = elitismRate;
    });

    // 7. Vehicle Agent Selector change event
    const agentSelect = document.getElementById('agentTypeSelect');
    agentSelect.addEventListener('change', (e) => {
        simulatorInstance.setAgentType(e.target.value);
    });

    // 8. Add Neural layer Architectures
    document.getElementById('btnAddLayer').addEventListener('click', () => {
        if (hiddenLayers.length < 4) {
            hiddenLayers.push(4); // Default to 4 neurons
            renderHiddenLayersConfig();
            restartEvolution();
        }
    });
}

// Renders the neural architectures list editor
function renderHiddenLayersConfig() {
    const listContainer = document.getElementById('hiddenLayersList');
    listContainer.replaceChildren(); // Safely clear container to prevent XSS

    hiddenLayers.forEach((neurons, index) => {
        const row = document.createElement('div');
        row.className = 'layer-row';

        const label = document.createElement('span');
        label.className = 'layer-num';
        label.textContent = `L${index + 1}:`;

        const val = document.createElement('span');
        val.className = 'layer-val';
        val.textContent = `${neurons} Neur`;

        const actions = document.createElement('div');
        actions.className = 'layer-actions';

        // Decrement button
        const btnDec = document.createElement('button');
        btnDec.className = 'btn btn-mini';
        btnDec.textContent = '-';
        btnDec.addEventListener('click', () => {
            if (hiddenLayers[index] > 2) {
                hiddenLayers[index]--;
                val.textContent = `${hiddenLayers[index]} Neur`;
                restartEvolution();
            }
        });

        // Increment button
        const btnInc = document.createElement('button');
        btnInc.className = 'btn btn-mini';
        btnInc.textContent = '+';
        btnInc.addEventListener('click', () => {
            if (hiddenLayers[index] < 12) {
                hiddenLayers[index]++;
                val.textContent = `${hiddenLayers[index]} Neur`;
                restartEvolution();
            }
        });

        // Delete button
        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-mini';
        btnDel.style.borderColor = 'rgba(255, 59, 48, 0.4)';
        btnDel.style.color = '#ff3b30';
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', () => {
            hiddenLayers.splice(index, 1);
            renderHiddenLayersConfig();
            restartEvolution();
        });

        actions.appendChild(btnDec);
        actions.appendChild(btnInc);
        actions.appendChild(btnDel);

        row.appendChild(label);
        row.appendChild(val);
        row.appendChild(actions);

        listContainer.appendChild(row);
    });
}

// Spectates active leaderboard and dynamic network diagrams
function animationLoop() {
    // 1. Simulate physics ticks (multiplied for quick evaluations)
    if (isSimulating) {
        for (let i = 0; i < currentSpeed; i++) {
            simulatorInstance.step();
        }
    }

    // 2. Spectating selection mechanics
    const aliveAgents = simulatorInstance.agents.filter(a => !a.crashed && !a.reachedTarget);
    
    // Sort all agents by current progress distance (or success steps) to populate leaderboard
    const rankedAgents = [...simulatorInstance.agents];
    const target = simulatorInstance.target;
    const start = simulatorInstance.startPos;

    const getDistance = (x1, y1, x2, y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    const startDist = getDistance(start.x, start.y, target.x, target.y);

    const getLiveProgress = (a) => {
        if (a.reachedTarget) {
            // Priority given to agents reaching target (lower steps taken is better)
            return 99999 - a.stepsTaken;
        }
        const dist = getDistance(a.x, a.y, target.x, target.y);
        const progress = startDist - dist;
        return a.crashed ? progress * 0.7 : progress;
    };

    rankedAgents.sort((a, b) => getLiveProgress(b) - getLiveProgress(a));

    // Auto focus onto best active agent if user hasn't explicitly selected one
    if (!userLockedFocus || !simulatorInstance.agents.includes(focusedAgent) || focusedAgent.crashed || focusedAgent.reachedTarget) {
        if (aliveAgents.length > 0) {
            // Focus first active ranking agent
            const liveRanked = rankedAgents.filter(a => !a.crashed && !a.reachedTarget);
            focusedAgent = liveRanked[0] || aliveAgents[0];
        } else if (rankedAgents.length > 0) {
            focusedAgent = rankedAgents[0];
        }
    }

    // 3. Render Simulator Board
    simulatorInstance.render(focusedAgent);

    // 4. Render live diagnostics (Stats, Leaderboard, Brain Visuals)
    renderLeaderboard(rankedAgents);
    renderNeuralNetworkDiagram(focusedAgent);

    // Update dynamic statistics numbers
    const totalCount = simulatorInstance.agents.length;
    const aliveCount = aliveAgents.length;
    const reachedCount = simulatorInstance.agents.filter(a => a.reachedTarget).length;
    
    document.getElementById('statAliveCount').textContent = `${aliveCount}/${totalCount}`;
    document.getElementById('statReachedCount').textContent = reachedCount;

    requestAnimationFrame(animationLoop);
}

// Programmatically renders top 5 ranks using strictly safe DOM procedures
function renderLeaderboard(rankedAgents) {
    const container = document.getElementById('leaderboardContainer');
    container.replaceChildren();

    const target = simulatorInstance.target;
    const start = simulatorInstance.startPos;
    const getDistance = (x1, y1, x2, y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    const startDist = getDistance(start.x, start.y, target.x, target.y);

    // Top 5
    const topAgents = rankedAgents.slice(0, 5);

    topAgents.forEach((agent, index) => {
        const item = document.createElement('div');
        item.className = `leaderboard-item ${agent === focusedAgent ? 'focused' : ''}`;

        // Listen for click to spectate brain/beams
        item.addEventListener('click', () => {
            focusedAgent = agent;
            userLockedFocus = true;
        });

        const rank = document.createElement('span');
        rank.className = 'leaderboard-rank';
        rank.textContent = `#${index + 1}`;

        const colorInd = document.createElement('div');
        colorInd.className = 'leaderboard-color-indicator';
        if (agent === focusedAgent) {
            colorInd.style.backgroundColor = 'var(--neon-cyan)';
        } else if (agent.reachedTarget) {
            colorInd.style.backgroundColor = 'var(--neon-purple)';
        } else if (agent.crashed) {
            colorInd.style.backgroundColor = 'var(--neon-red)';
        } else {
            colorInd.style.backgroundColor = 'rgba(255,255,255,0.15)';
        }

        const name = document.createElement('span');
        name.className = 'leaderboard-name';
        name.textContent = `A-${agent.brain.layers.join('-')}-${String(rankedAgents.indexOf(agent)).padStart(3, '0')}`;

        // Performance score
        const score = document.createElement('span');
        score.className = 'leaderboard-fit';
        
        // State label
        const state = document.createElement('span');
        state.className = 'leaderboard-state';
        
        if (agent.reachedTarget) {
            state.className += ' state-target';
            state.textContent = 'Gol';
            score.textContent = `S:${agent.stepsTaken}`;
        } else if (agent.crashed) {
            state.className += ' state-crashed';
            state.textContent = 'Tabrak';
            const pct = Math.max(0, Math.floor(((startDist - getDistance(agent.x, agent.y, target.x, target.y)) / startDist) * 100));
            score.textContent = `${pct}%`;
        } else {
            state.className += ' state-alive';
            state.textContent = 'Aktif';
            const pct = Math.max(0, Math.floor(((startDist - getDistance(agent.x, agent.y, target.x, target.y)) / startDist) * 100));
            score.textContent = `${pct}%`;
        }

        item.appendChild(rank);
        item.appendChild(colorInd);
        item.appendChild(name);
        item.appendChild(state);
        item.appendChild(score);

        container.appendChild(item);
    });
}

// Dynamic real-time neuron glowing lines renderer
function renderNeuralNetworkDiagram(agent) {
    if (!agent || !agent.brain) {
        netCtx.clearRect(0, 0, netCanvas.width, netCanvas.height);
        return;
    }

    const brain = agent.brain;
    const w = netCanvas.width / (window.devicePixelRatio || 1);
    const h = netCanvas.height / (window.devicePixelRatio || 1);

    netCtx.clearRect(0, 0, w, h);

    const padding = 20;
    const colWidth = (w - padding * 2) / (brain.layers.length - 1);

    // 1. Calculate positions for every neuron
    const nodeCoords = [];
    for (let i = 0; i < brain.layers.length; i++) {
        const layerSize = brain.layers[i];
        const colX = padding + i * colWidth;
        const rowCoords = [];
        
        // Distribute neurons evenly inside columns
        const colHeight = h - padding * 2;
        const space = layerSize > 1 ? colHeight / (layerSize - 1) : 0;
        
        for (let j = 0; j < layerSize; j++) {
            const rowY = layerSize > 1 
                ? padding + j * space 
                : padding + colHeight / 2;
            rowCoords.push({ x: colX, y: rowY });
        }
        nodeCoords.push(rowCoords);
    }

    // 2. Draw Connection Lines (Synapses)
    for (let i = 0; i < brain.weights.length; i++) {
        const layerWeights = brain.weights[i];
        for (let j = 0; j < layerWeights.length; j++) { // Current target nodes
            for (let k = 0; k < layerWeights[j].length; k++) { // Source nodes
                const start = nodeCoords[i][k];
                const end = nodeCoords[i+1][j];
                const weight = layerWeights[j][k];

                // Positive weight = Cyan glowing line, Negative weight = Purple glowing line
                const alpha = Math.min(1, Math.abs(weight) * 0.5);
                const color = weight > 0 ? `rgba(0, 240, 255, ${alpha})` : `rgba(188, 0, 221, ${alpha})`;
                
                netCtx.strokeStyle = color;
                // Line thickness proportional to weight strength
                netCtx.lineWidth = Math.min(3, Math.abs(weight) * 1.5);
                
                netCtx.beginPath();
                netCtx.moveTo(start.x, start.y);
                netCtx.lineTo(end.x, end.y);
                netCtx.stroke();
            }
        }
    }

    // 3. Draw Nodes (Neurons)
    const inputsText = ['S-L', 'S-FL', 'S-C', 'S-FR', 'S-R', 'Sudut', 'Jarak', 'Speed'];
    const outputsText = ['Setir', 'Gas'];

    for (let i = 0; i < nodeCoords.length; i++) {
        const layerSize = brain.layers[i];
        const activations = brain.activations ? brain.activations[i] : Array(layerSize).fill(0);

        for (let j = 0; j < layerSize; j++) {
            const coord = nodeCoords[i][j];
            const val = activations[j] || 0;

            // Base node circles
            netCtx.fillStyle = '#0f121c';
            // Glowing border based on positive or negative activation
            const glowColor = val > 0 ? '#00f0ff' : (val < 0 ? '#bc00dd' : '#718096');
            
            netCtx.save();
            netCtx.strokeStyle = glowColor;
            netCtx.lineWidth = 1.5;
            
            // Add subtle active neon shadow
            if (Math.abs(val) > 0.15) {
                netCtx.shadowColor = glowColor;
                netCtx.shadowBlur = 6;
            }

            netCtx.beginPath();
            netCtx.arc(coord.x, coord.y, 6, 0, Math.PI * 2);
            netCtx.fill();
            netCtx.stroke();
            netCtx.restore();

            // Inner active center representing activation level
            if (Math.abs(val) > 0.05) {
                netCtx.fillStyle = val > 0 ? `rgba(0, 240, 255, ${val})` : `rgba(188, 0, 221, ${Math.abs(val)})`;
                netCtx.beginPath();
                netCtx.arc(coord.x, coord.y, 3, 0, Math.PI * 2);
                netCtx.fill();
            }

            // Text Labels for Inputs and Outputs (Outer edges)
            netCtx.fillStyle = 'rgba(255,255,255,0.45)';
            netCtx.font = '8px "Outfit", sans-serif';
            netCtx.textBaseline = 'middle';

            if (i === 0) { // Inputs
                netCtx.textAlign = 'right';
                netCtx.fillText(inputsText[j] || '', coord.x - 10, coord.y);
            } else if (i === nodeCoords.length - 1) { // Outputs
                netCtx.textAlign = 'left';
                netCtx.fillText(outputsText[j] || '', coord.x + 10, coord.y);
            }
        }
    }
}
