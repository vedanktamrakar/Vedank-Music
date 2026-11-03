/**
 * Vedank Music Humanizer - Audio Compressor
 *
 * High-quality audio compression with configurable parameters.
 * Implements lookahead, knee, and smooth gain reduction.
 */

class Compressor {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.lookAheadTime = 0.005; // 5ms lookahead
        this.attackTime = 0.01; // 10ms attack
        this.releaseTime = 0.1; // 100ms release
        this.kneeWidth = 5; // dB knee width

        console.log('Compressor initialized');
    }

    /**
     * Process an audio buffer with compression
     * @param {AudioBuffer} audioBuffer - Input audio buffer
     * @param {number} amount - Compression amount (0-1)
     * @param {number} ratio - Compression ratio (2-16)
     * @param {number} threshold - Threshold in dB (-60 to 0)
     * @returns {Promise<AudioBuffer>} Processed audio buffer
     */
    static async process(audioBuffer, amount = 0.5, ratio = 4, threshold = -20) {
        if (amount <= 0) {
            return audioBuffer;
        }

        console.log(`Compressing with ratio ${ratio}:1, threshold ${threshold}dB, amount ${amount}`);

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const compressor = new Compressor(audioContext);

        return compressor.processBuffer(audioBuffer, amount, ratio, threshold);
    }

    /**
     * Process an audio buffer with compression
     */
    async processBuffer(audioBuffer, amount, ratio, threshold) {
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const numSamples = audioBuffer.length;

        // Create output buffer
        const outputBuffer = this.audioContext.createBuffer(
            numChannels,
            numSamples,
            sampleRate
        );

        // Calculate compression parameters
        const thresholdLinear = Math.pow(10, threshold / 20);
        const ratioValue = 1 - (1 / ratio);
        const kneeWidthLinear = Math.pow(10, this.kneeWidth / 20);

        // Process each channel
        for (let channel = 0; channel < numChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = outputBuffer.getChannelData(channel);

            await this.processChannel(
                inputData, outputData,
                amount, ratioValue, thresholdLinear, kneeWidthLinear,
                sampleRate
            );
        }

        return outputBuffer;
    }

    /**
     * Process a single channel with compression
     */
    async processChannel(inputData, outputData, amount, ratioValue, thresholdLinear, kneeWidthLinear, sampleRate) {
        const inputLength = inputData.length;

        // Calculate lookahead samples
        const lookAheadSamples = Math.floor(this.lookAheadTime * sampleRate);

        // Create envelope follower
        const envelope = new Float32Array(inputLength);

        // First pass: calculate envelope with lookahead
        for (let i = 0; i < inputLength; i++) {
            const end = Math.min(i + lookAheadSamples, inputLength);
            let maxAbs = 0;

            for (let j = i; j < end; j++) {
                maxAbs = Math.max(maxAbs, Math.abs(inputData[j]));
            }

            envelope[i] = maxAbs;
        }

        // Smooth the envelope with attack and release
        const smoothedEnvelope = new Float32Array(inputLength);
        let currentEnvelope = envelope[0];

        for (let i = 0; i < inputLength; i++) {
            const targetEnvelope = envelope[i];

            // Apply attack and release
            if (targetEnvelope > currentEnvelope) {
                // Attack
                const attackSamples = Math.floor(this.attackTime * sampleRate);
                const alpha = 1 - Math.exp(-1 / Math.max(1, attackSamples));
                currentEnvelope += alpha * (targetEnvelope - currentEnvelope);
            } else {
                // Release
                const releaseSamples = Math.floor(this.releaseTime * sampleRate);
                const alpha = 1 - Math.exp(-1 / Math.max(1, releaseSamples));
                currentEnvelope += alpha * (targetEnvelope - currentEnvelope);
            }

            smoothedEnvelope[i] = currentEnvelope;
        }

        // Second pass: apply compression
        for (let i = 0; i < inputLength; i++) {
            const absSample = Math.abs(inputData[i]);
            const envelopeValue = smoothedEnvelope[i];

            // Calculate gain reduction
            let gainReduction = 0;

            if (envelopeValue > thresholdLinear) {
                // Calculate over-threshold amount
                const overThreshold = envelopeValue - thresholdLinear;

                // Apply knee
                if (overThreshold < kneeWidthLinear) {
                    // In knee region
                    const kneePos = overThreshold / kneeWidthLinear;
                    gainReduction = kneePos * kneePos * ratioValue * amount;
                } else {
                    // Above knee
                    gainReduction = ratioValue * amount;
                }
            }

            // Apply gain reduction
            const gain = 1 - gainReduction;
            outputData[i] = inputData[i] * gain;
        }
    }

    /**
     * Simple compression (faster, less accurate)
     */
    async processSimple(audioBuffer, amount, ratio, threshold) {
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const numSamples = audioBuffer.length;

        const outputBuffer = this.audioContext.createBuffer(
            numChannels,
            numSamples,
            sampleRate
        );

        const thresholdLinear = Math.pow(10, threshold / 20);
        const ratioValue = ratio;

        for (let channel = 0; channel < numChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = outputBuffer.getChannelData(channel);

            for (let i = 0; i < numSamples; i++) {
                const absSample = Math.abs(inputData[i]);

                if (absSample > thresholdLinear) {
                    const overThreshold = absSample - thresholdLinear;
                    const gainReduction = overThreshold * (ratioValue - 1) / ratioValue;
                    const gain = 1 - (gainReduction / absSample) * amount;
                    outputData[i] = inputData[i] * gain;
                } else {
                    outputData[i] = inputData[i];
                }
            }
        }

        return outputBuffer;
    }
}

// Export for use in other modules
window.Compressor = Compressor;
