/**
 * Genetic Algorithm Engine
 * Manages evolutionary lifecycle: evaluation, selection, reproduction, mutation, and elitism.
 */
class GeneticAlgorithm {
    /**
     * @param {number} populationSize - Number of agents in population
     * @param {number} mutationRate - Probability of mutation (0 to 1)
     * @param {number} elitismRate - Percentage of top agents to preserve (0 to 1)
     */
    constructor(populationSize, mutationRate = 0.05, elitismRate = 0.05) {
        this.populationSize = populationSize;
        this.mutationRate = mutationRate;
        this.elitismRate = elitismRate;
        this.generation = 1;
        this.history = []; // Stores { generation, maxFitness, avgFitness }
    }

    /**
     * Calculates fitness for an agent based on its performance in the simulator.
     * @param {object} agent - The simulation agent (drone, car, etc.)
     * @param {object} startPos - {x, y} coordinate of spawn point
     * @param {object} targetPos - {x, y} coordinate of destination
     * @param {number} maxDist - Max distance across the canvas for normalization
     * @returns {number} calculated fitness
     */
    static calculateFitness(agent, startPos, targetPos, maxDist) {
        // Distance check
        const dx = targetPos.x - agent.x;
        const dy = targetPos.y - agent.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);

        // Distance from start to target
        const startDx = targetPos.x - startPos.x;
        const startDy = targetPos.y - startPos.y;
        const totalStartDist = Math.sqrt(startDx * startDx + startDy * startDy);

        // 1. Progress factor: how much closer did we get?
        const progress = Math.max(0, totalStartDist - distToTarget);
        const progressRatio = totalStartDist > 0 ? progress / totalStartDist : 0;
        
        // Linear and exponential reward for getting closer
        let score = progressRatio * 500; 
        if (progressRatio > 0) {
            score += Math.pow(progressRatio, 2) * 1000;
        }

        // 2. Target Reach Bonus (Massive Bonus)
        if (agent.reachedTarget) {
            // Speed bonus: higher reward if reached in fewer steps
            const speedBonus = agent.maxSteps > 0 ? (1 - agent.stepsTaken / agent.maxSteps) * 5000 : 0;
            score += 10000 + speedBonus;
        }

        // 3. Survival Bonus (Only if moving forward and alive)
        if (progressRatio > 0.1 && !agent.crashed && !agent.reachedTarget) {
            score += (agent.stepsTaken / 5);
        }

        // 4. Collision Penalty (Severe)
        if (agent.crashed) {
            score *= 0.1; // 90% penalty for hitting an obstacle
        }

        // Ensure fitness is positive
        return Math.max(0.1, score);
    }

    /**
     * Evolves the current population into the next generation.
     * @param {object[]} currentAgents - List of completed agents containing brains & fitnesses
     * @param {number[]} neuralArchitecture - Number of layers/neurons [inputs, ...hidden, outputs]
     * @returns {NeuralNetwork[]} list of new neural networks (brains) for the next generation
     */
    evolve(currentAgents, neuralArchitecture) {
        // 1. Sort agents by fitness descending
        currentAgents.sort((a, b) => b.fitness - a.fitness);

        // 2. Record statistics
        const maxFitness = currentAgents[0].fitness;
        const sumFitness = currentAgents.reduce((sum, agent) => sum + agent.fitness, 0);
        const avgFitness = sumFitness / currentAgents.length;

        this.history.push({
            generation: this.generation,
            maxFitness: parseFloat(maxFitness.toFixed(2)),
            avgFitness: parseFloat(avgFitness.toFixed(2))
        });

        // 3. Elitism: Keep top brains directly
        const eliteCount = Math.max(1, Math.floor(this.populationSize * this.elitismRate));
        const newBrains = [];

        for (let i = 0; i < eliteCount; i++) {
            newBrains.push(currentAgents[i].brain.clone());
        }

        // 4. Fill rest of the population through Selection & Reproduction
        const selectionPoolSize = Math.max(2, Math.floor(currentAgents.length * 0.4)); // Select from top 40%
        const selectionPool = currentAgents.slice(0, selectionPoolSize);

        // Tournament selection helper
        const selectParent = (pool) => {
            // Pick 3 random candidates from selection pool, return the one with highest fitness
            const k = 3;
            let best = pool[Math.floor(Math.random() * pool.length)];
            for (let i = 1; i < k; i++) {
                const competitor = pool[Math.floor(Math.random() * pool.length)];
                if (competitor.fitness > best.fitness) {
                    best = competitor;
                }
            }
            return best.brain;
        };

        while (newBrains.length < this.populationSize) {
            const parentA = selectParent(selectionPool);
            const parentB = selectParent(selectionPool);

            // Crossover to create child brain
            let childBrain = parentA.crossover(parentB);

            // Mutate child brain
            childBrain.mutate(this.mutationRate, 0.15);

            newBrains.push(childBrain);
        }

        this.generation++;
        return newBrains;
    }
}
