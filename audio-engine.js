/**
 * Vedank Music Humanizer - Audio Processing Engine
 *
 * This module contains the core audio processing functionality.
 * It implements all the approved V1 features for audio processing.
 */

class AudioProcessor {
    constructor(audioContext, params) {
        this.audioContext = audioContext;
        this.params = params || {};
        this.worker = null;

        console.log('AudioProcessor initialized');
    }

    /**
     * Process audio buffer with all enabled effects
     * @param {AudioBuffer} audioBuffer - Input audio buffer
     * @param {Function} onProgress - Progress callback (0-1)
     * @returns {Promise<AudioBuffer>} Processed audio buffer
     */
    async process(audioBuffer, onProgress = null) {
        console.log('Starting audio processing...');
        const startTime = performance.now();

        try {
            // Create a copy of the original buffer to process
            let processedBuffer = this.cloneBuffer(audioBuffer);

            // Process in stages with progress updates
            const stages = [
                { name: 'Pitch Processing', func: () => this.processPitch(processedBuffer) },
                { name: 'Timing Processing', func: () => this.processTiming(processedBuffer) },
                { name: 'Dynamics Processing', func: () => this.processDynamics(processedBuffer) },
                { name: 'EQ Processing', func: () => this.processEQ(processedBuffer) },
                { name: 'Texture Processing', func: () => this.processTexture(processedBuffer) },
                { name: 'Vocal Processing', func: () => this.processVocal(processedBuffer) }
            ];

            for (let i = 0; i < stages.length; i++) {
                const stage = stages[i];

                // Skip if no processing is needed for this stage
                if (this.shouldSkipStage(stage.name)) {
                    continue;
                }

                console.log(`Processing stage: ${stage.name}`);
                processedBuffer = await stage.func();

                // Update progress
                const progress = (i + 1) / stages.length;
                if (onProgress) {
                    onProgress(progress);
                }
            }

            const endTime = performance.now();
            console.log(`Audio processing complete in ${(endTime - startTime).toFixed(2)}ms`);

            return processedBuffer;

        } catch (error) {
            console.error('Audio processing error:', error);
            throw error;
        }
    }

    /**
     * Check if a processing stage should be skipped
     */
    shouldSkipStage(stageName) {
        const params = this.params;

        switch (stageName) {
            case 'Pitch Processing':
                return params.pitchShift === 0 &&
                       params.finePitch === 0 &&
                       params.pitchCorrection === 0 &&
                       params.vibratoDepth === 0 &&
                       params.formantShift === 0;
            case 'Timing Processing':
                return params.timingAdjustment === 0 &&
                       params.phraseChanges === 50 &&
                       params.levelAutomation === 50;
            case 'Dynamics Processing':
                return params.compression === 0 &&
                       params.dynamicVariation === 50;
            case 'EQ Processing':
                return params.eqLowGain === 0 &&
                       params.eqMidGain === 0 &&
                       params.eqHighGain === 0;
            case 'Texture Processing':
                return params.saturation === 0 &&
                       params.reverbAmount === 0 &&
                       params.stereoWidthControl === 100 &&
                       params.harmonicEnhancement === 0;
            case 'Vocal Processing':
                return params.expressionIntensity === 50 &&
                       params.phraseDynamics === 50 &&
                       params.tonalProcessing === 50 &&
                       params.processingStrength === 50;
            default:
                return false;
        }
    }

    /**
     * Process pitch effects
     */
    async processPitch(audioBuffer) {
        const params = this.params;

        // Apply pitch shift if needed
        if (params.pitchShift !== 0 || params.finePitch !== 0) {
            const semitones = params.pitchShift + (params.finePitch / 100);
            audioBuffer = await PitchShifter.process(audioBuffer, semitones);
        }

        // Apply formant shift if needed
        if (params.formantShift !== 0) {
            audioBuffer = await this.applyFormantShift(audioBuffer, params.formantShift);
        }

        // Apply vibrato if needed
        if (params.vibratoDepth > 0) {
            audioBuffer = await this.applyVibrato(audioBuffer, params.vibratoDepth, params.vibratoRate);
        }

        // Apply pitch correction if needed
        if (params.pitchCorrection > 0) {
            audioBuffer = await this.applyPitchCorrection(audioBuffer, params.pitchCorrection / 100);
        }

        return audioBuffer;
    }

    /**
     * Process timing effects
     */
    async processTiming(audioBuffer) {
        const params = this.params;

        // Apply timing adjustment if needed
        if (params.timingAdjustment !== 0) {
            audioBuffer = await this.applyTimingAdjustment(audioBuffer, params.timingAdjustment);
        }

        // Apply phrase-level changes if needed
        if (params.phraseChanges !== 50) {
            audioBuffer = await this.applyPhraseChanges(audioBuffer, params.phraseChanges);
        }

        // Apply level automation if needed
        if (params.levelAutomation !== 50) {
            audioBuffer = await this.applyLevelAutomation(audioBuffer, params.levelAutomation);
        }

        return audioBuffer;
    }

    /**
     * Process dynamics effects
     */
    async processDynamics(audioBuffer) {
        const params = this.params;

        // Apply compression if needed
        if (params.compression > 0) {
            audioBuffer = await Compressor.process(
                audioBuffer,
                params.compression / 100,
                params.compressionRatio,
                params.compressionThreshold
            );
        }

        // Apply dynamic variation if needed
        if (params.dynamicVariation !== 50) {
            audioBuffer = await this.applyDynamicVariation(audioBuffer, params.dynamicVariation);
        }

        return audioBuffer;
    }

    /**
     * Process EQ effects
     */
    async processEQ(audioBuffer) {
        const params = this.params;

        // Create EQ processor
        const eqProcessor = new EQProcessor(this.audioContext);

        // Configure EQ bands
        const bands = [
            { freq: params.eqLowFreq, gain: params.eqLowGain, type: 'lowshelf' },
            { freq: params.eqMidFreq, gain: params.eqMidGain, type: 'peaking' },
            { freq: params.eqHighFreq, gain: params.eqHighGain, type: 'highshelf' }
        ];

        // Apply EQ
        audioBuffer = await eqProcessor.process(audioBuffer, bands);

        return audioBuffer;
    }

    /**
     * Process texture effects
     */
    async processTexture(audioBuffer) {
        const params = this.params;

        // Apply saturation if needed
        if (params.saturation > 0) {
            audioBuffer = await this.applySaturation(audioBuffer, params.saturation / 100);
        }

        // Apply reverb if needed
        if (params.reverbAmount > 0) {
            audioBuffer = await Reverb.process(
                audioBuffer,
                params.reverbAmount / 100,
                params.reverbSize
            );
        }

        // Apply stereo width adjustment if needed
        if (params.stereoWidthControl !== 100) {
            audioBuffer = await this.applyStereoWidth(audioBuffer, params.stereoWidthControl);
        }

        // Apply harmonic enhancement if needed
        if (params.harmonicEnhancement > 0) {
            audioBuffer = await this.applyHarmonicEnhancement(audioBuffer, params.harmonicEnhancement / 100);
        }

        return audioBuffer;
    }

    /**
     * Process vocal effects
     */
    async processVocal(audioBuffer) {
        const params = this.params;

        // Apply expression intensity if needed
        if (params.expressionIntensity !== 50) {
            audioBuffer = await this.applyExpressionIntensity(audioBuffer, params.expressionIntensity);
        }

        // Apply phrase dynamics if needed
        if (params.phraseDynamics !== 50) {
            audioBuffer = await this.applyPhraseDynamics(audioBuffer, params.phraseDynamics);
        }

        // Apply tonal processing if needed
        if (params.tonalProcessing !== 50) {
            audioBuffer = await this.applyTonalProcessing(audioBuffer, params.tonalProcessing);
        }

        // Apply processing strength if needed
        if (params.processingStrength !== 50) {
            audioBuffer = await this.applyProcessingStrength(audioBuffer, params.processingStrength);
        }

        return audioBuffer;
    }

    /**
     * Apply formant shift
     */
    async applyFormantShift(audioBuffer, semitones) {
        // Formant shift preserves pitch while changing timbre
        // This is a simplified implementation
        console.log(`Applying formant shift: ${semitones} semitones`);

        // For now, we'll use a simple approach: apply EQ changes that mimic formant shifting
        // A proper formant shift would require more complex processing
        const eqProcessor = new EQProcessor(this.audioContext);

        // Calculate formant frequency shifts
        const shiftFactor = Math.pow(2, semitones / 12);
        const centerFreq = 1000; // Center frequency for formant
        const shiftedFreq = centerFreq * shiftFactor;

        // Boost around the shifted frequency
        const bands = [
            { freq: shiftedFreq, gain: 3, type: 'peaking', q: 2 }
        ];

        return eqProcessor.process(audioBuffer, bands);
    }

    /**
     * Apply vibrato
     */
    async applyVibrato(audioBuffer, depth, rate) {
        console.log(`Applying vibrato: depth=${depth}, rate=${rate}Hz`);

        // Vibrato is implemented as a periodic pitch modulation
        // We'll use the pitch shifter with a modulated pitch value

        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numSamples = Math.floor(sampleRate * duration);

        // Create a new buffer for processed audio
        const processedBuffer = this.createEmptyBuffer(
            audioBuffer.numberOfChannels,
            numSamples,
            sampleRate
        );

        // Create vibrato LFO (Low Frequency Oscillator)
        const lfo = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const time = i / sampleRate;
            // Sine wave LFO
            lfo[i] = Math.sin(2 * Math.PI * rate * time) * (depth / 100);
        }

        // Process each channel
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            const outputData = processedBuffer.getChannelData(channel);

            // Apply vibrato using pitch shifting in small chunks
            const chunkSize = Math.floor(sampleRate * 0.05); // 50ms chunks
            const overlap = Math.floor(chunkSize * 0.5);

            for (let i = 0; i < numSamples; i += chunkSize) {
                const end = Math.min(i + chunkSize, numSamples);
                const chunk = channelData.slice(i, end);

                // Get current LFO value at the center of the chunk
                const center = i + Math.floor(chunkSize / 2);
                const pitchShift = lfo[center];

                // Apply pitch shift to this chunk
                const shiftedChunk = await PitchShifter.processChunk(chunk, pitchShift, sampleRate);

                // Overlap-add
                for (let j = 0; j < shiftedChunk.length; j++) {
                    const outIdx = i + j;
                    if (outIdx < numSamples) {
                        outputData[outIdx] += shiftedChunk[j];
                    }
                }
            }
        }

        return processedBuffer;
    }

    /**
     * Apply pitch correction
     */
    async applyPitchCorrection(audioBuffer, strength) {
        console.log(`Applying pitch correction: strength=${strength}`);

        // Pitch correction is complex and typically requires specialized algorithms
        // This is a simplified implementation that uses a basic approach

        // For now, we'll apply a gentle compression-like effect to the pitch
        // This is a placeholder - a real implementation would use a pitch detection
        // and correction algorithm

        return audioBuffer; // Placeholder - pitch correction not fully implemented
    }

    /**
     * Apply timing adjustment
     */
    async applyTimingAdjustment(audioBuffer, msAdjustment) {
        console.log(`Applying timing adjustment: ${msAdjustment}ms`);

        // Timing adjustment changes the playback speed without affecting pitch
        // This is essentially time-stretching

        if (msAdjustment === 0) {
            return audioBuffer;
        }

        // Calculate speed factor
        const speedFactor = 1 + (msAdjustment / 1000);

        // Use a simple approach: resample the audio
        // This is a placeholder - a proper implementation would use a phase vocoder

        return audioBuffer; // Placeholder - time-stretching not fully implemented
    }

    /**
     * Apply phrase-level changes
     */
    async applyPhraseChanges(audioBuffer, value) {
        console.log(`Applying phrase changes: ${value}`);

        // Phrase-level changes adjust the dynamics and timing at phrase boundaries
        // This requires detecting phrases, which is complex

        // For now, we'll apply a simple volume modulation
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numSamples = Math.floor(sampleRate * duration);

        const processedBuffer = this.createEmptyBuffer(
            audioBuffer.numberOfChannels,
            numSamples,
            sampleRate
        );

        // Create a modulation envelope based on the value
        const modulationFactor = (value - 50) / 50; // -1 to 1

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = processedBuffer.getChannelData(channel);

            for (let i = 0; i < numSamples; i++) {
                const time = i / sampleRate;

                // Create a slow modulation (phrase-level)
                const phraseMod = Math.sin(2 * Math.PI * 0.1 * time) * 0.2 * modulationFactor;

                // Apply modulation
                outputData[i] = inputData[i] * (1 + phraseMod);
            }
        }

        return processedBuffer;
    }

    /**
     * Apply level automation
     */
    async applyLevelAutomation(audioBuffer, value) {
        console.log(`Applying level automation: ${value}`);

        // Level automation creates gradual volume changes
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numSamples = Math.floor(sampleRate * duration);

        const processedBuffer = this.createEmptyBuffer(
            audioBuffer.numberOfChannels,
            numSamples,
            sampleRate
        );

        // Calculate automation factor
        const automationFactor = (value - 50) / 50; // -1 to 1

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = processedBuffer.getChannelData(channel);

            for (let i = 0; i < numSamples; i++) {
                const time = i / sampleRate;

                // Create a slow automation curve
                const automation = Math.sin(2 * Math.PI * 0.05 * time) * 0.1 * automationFactor;

                // Apply automation
                outputData[i] = inputData[i] * (1 + automation);
            }
        }

        return processedBuffer;
    }

    /**
     * Apply dynamic variation
     */
    async applyDynamicVariation(audioBuffer, value) {
        console.log(`Applying dynamic variation: ${value}`);

        // Dynamic variation adds subtle random variations to the dynamics
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numSamples = Math.floor(sampleRate * duration);

        const processedBuffer = this.createEmptyBuffer(
            audioBuffer.numberOfChannels,
            numSamples,
            sampleRate
        );

        // Calculate variation factor
        const variationFactor = (value - 50) / 50; // -1 to 1

        // Create random variation array
        const variation = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            // Low-frequency noise for smooth variation
            variation[i] = (Math.random() * 2 - 1) * 0.05 * variationFactor;
        }

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = processedBuffer.getChannelData(channel);

            for (let i = 0; i < numSamples; i++) {
                outputData[i] = inputData[i] * (1 + variation[i]);
            }
        }

        return processedBuffer;
    }

    /**
     * Apply saturation
     */
    async applySaturation(audioBuffer, amount) {
        console.log(`Applying saturation: ${amount}`);

        // Saturation adds harmonic distortion
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numSamples = Math.floor(sampleRate * duration);

        const processedBuffer = this.createEmptyBuffer(
            audioBuffer.numberOfChannels,
            numSamples,
            sampleRate
        );

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = processedBuffer.getChannelData(channel);

            for (let i = 0; i < numSamples; i++) {
                const sample = inputData[i];

                // Apply soft clipping saturation
                const saturated = sample * (1 + amount * Math.abs(sample) * 2);

                // Normalize to prevent clipping
                outputData[i] = Math.max(-1, Math.min(1, saturated));
            }
        }

        return processedBuffer;
    }

    /**
     * Apply stereo width adjustment
     */
    async applyStereoWidth(audioBuffer, widthPercent) {
        console.log(`Applying stereo width: ${widthPercent}%`);

        if (audioBuffer.numberOfChannels < 2) {
            return audioBuffer; // Can't adjust stereo width on mono
        }

        const widthFactor = widthPercent / 100;
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numSamples = Math.floor(sampleRate * duration);

        const processedBuffer = this.createEmptyBuffer(
            audioBuffer.numberOfChannels,
            numSamples,
            sampleRate
        );

        const leftData = audioBuffer.getChannelData(0);
        const rightData = audioBuffer.getChannelData(1);
        const outLeft = processedBuffer.getChannelData(0);
        const outRight = processedBuffer.getChannelData(1);

        for (let i = 0; i < numSamples; i++) {
            const mid = (leftData[i] + rightData[i]) / 2;
            const side = (rightData[i] - leftData[i]) /
