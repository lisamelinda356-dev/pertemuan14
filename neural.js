/**
 * Neural Network Engine
 * Handles dynamic layers, feedforward logic, deep cloning, crossover, and mutations.
 */
class NeuralNetwork {
    /**
     * @param {number[]} layers - Array containing number of nodes per layer (e.g. [8, 6, 4, 2])
     */
    constructor(layers) {
        this.layers = layers;
        this.weights = [];
        this.biases = [];

        // Initialize random weights and biases
        for (let i = 0; i < layers.length - 1; i++) {
            const currentSize = layers[i];
            const nextSize = layers[i + 1];

            // Weights matrix between layer i and i+1
            const layerWeights = [];
            for (let j = 0; j < nextSize; j++) {
                const nodeWeights = [];
                for (let k = 0; k < currentSize; k++) {
                    // Random weight between -1 and 1
                    nodeWeights.push(Math.random() * 2 - 1);
                }
                layerWeights.push(nodeWeights);
            }
            this.weights.push(layerWeights);

            // Biases for layer i+1
            const layerBiases = [];
            for (let j = 0; j < nextSize; j++) {
                // Random bias between -1 and 1
                layerBiases.push(Math.random() * 2 - 1);
            }
            this.biases.push(layerBiases);
        }
    }

    /**
     * Feedforward propagation through the network
     * @param {number[]} inputs 
     * @returns {number[]} outputs
     */
    feedForward(inputs) {
        let currentValues = [...inputs];

        // Store activations for visualization (optional)
        this.activations = [currentValues];

        for (let i = 0; i < this.weights.length; i++) {
            const nextValues = [];
            const layerWeights = this.weights[i];
            const layerBiases = this.biases[i];

            for (let j = 0; j < layerWeights.length; j++) {
                let sum = layerBiases[j];
                for (let k = 0; k < currentValues.length; k++) {
                    sum += currentValues[k] * layerWeights[j][k];
                }
                
                // Activation function: tanh for hidden/output layers to give smooth steering [-1, 1]
                nextValues.push(Math.tanh(sum));
            }
            currentValues = nextValues;
            this.activations.push(currentValues);
        }

        return currentValues;
    }

    /**
     * Creates a deep copy of the neural network
     * @returns {NeuralNetwork}
     */
    clone() {
        const copy = new NeuralNetwork(this.layers);
        
        // Deep copy weights
        copy.weights = this.weights.map(layer => 
            layer.map(nodeWeights => [...nodeWeights])
        );

        // Deep copy biases
        copy.biases = this.biases.map(layerBiases => [...layerBiases]);

        return copy;
    }

    /**
     * Performs Gaussian mutation on weights and biases
     * @param {number} rate - Probability of mutation (0 to 1)
     * @param {number} amount - Standard deviation of mutation (how much weights can change)
     */
    mutate(rate, amount = 0.1) {
        // Helper for Gaussian noise
        const randomGaussian = () => {
            let u = 0, v = 0;
            while(u === 0) u = Math.random(); 
            while(v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        };

        // Mutate weights
        for (let i = 0; i < this.weights.length; i++) {
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++) {
                    if (Math.random() < rate) {
                        this.weights[i][j][k] += randomGaussian() * amount;
                        // Clip weights between -2 and 2 to prevent extreme values
                        this.weights[i][j][k] = Math.max(-2, Math.min(2, this.weights[i][j][k]));
                    }
                }
            }
        }

        // Mutate biases
        for (let i = 0; i < this.biases.length; i++) {
            for (let j = 0; j < this.biases[i].length; j++) {
                if (Math.random() < rate) {
                    this.biases[i][j] += randomGaussian() * amount;
                    this.biases[i][j] = Math.max(-2, Math.min(2, this.biases[i][j]));
                }
            }
        }
    }

    /**
     * Crossover with another neural network (50% blend/discrete swap)
     * @param {NeuralNetwork} partner 
     * @returns {NeuralNetwork} child
     */
    crossover(partner) {
        const child = new NeuralNetwork(this.layers);

        for (let i = 0; i < this.weights.length; i++) {
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++) {
                    // 50% chance of taking weight from either parent
                    if (Math.random() < 0.5) {
                        child.weights[i][j][k] = this.weights[i][j][k];
                    } else {
                        child.weights[i][j][k] = partner.weights[i][j][k];
                    }
                }
            }
        }

        for (let i = 0; i < this.biases.length; i++) {
            for (let j = 0; j < this.biases[i].length; j++) {
                if (Math.random() < 0.5) {
                    child.biases[i][j] = this.biases[i][j];
                } else {
                    child.biases[i][j] = partner.biases[i][j];
                }
            }
        }

        return child;
    }
}
