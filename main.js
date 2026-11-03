/**
 * Vedank Music Humanizer - Main Application Controller
 *
 * This is the main entry point that initializes all components
 * and coordinates between UI, audio processing, and visualization.
 */

// Global state
const HumanizerState = {
    audioContext: null,
    originalAudioBuffer: null,
    processedAudioBuffer: null,
    audioFile: null,
    fileInfo: {
        name: '',
        duration: 0,
        sampleRate: 0,
        channels: 0,
        size: 0
    },
    processingParams: {
        // Vocal controls
        expressionIntensity: 50,
        phraseDynamics: 50,
        tonalProcessing: 50,
        processingStrength: 50,

        // Timing & dynamics
        dynamicVariation: 50,
        levelAutomation: 50,
        phraseChanges: 50,
        timingAdjustment: 0,
        compression: 0,
        compressionRatio: 4,
        compressionThreshold: -20,

        // Pitch & vibrato
        pitchShift: 0,
        finePitch: 0,
        pitchCorrection: 0,
        vibratoDepth: 0,
        vibratoRate: 5,
        formantShift: 0,

        // Texture & processing
        eqLowFreq: 100,
        eqLowGain: 0,
        eqMidFreq: 1000,
        eqMidGain: 0,
        eqHighFreq: 10000,
        eqHighGain: 0,
        saturation: 0,
        reverbAmount: 0,
        reverbSize: 'large',
        stereoWidthControl: 100,
        harmonicEnhancement: 0
    },
    isProcessing: false,
    isPlayingOriginal: false,
    isPlayingProcessed: false,
    originalAudioNode: null,
    processedAudioNode: null,
    visualizer: null,
    analyzer: null,
    objectURLs: []
};

// DOM Elements
const DOM = {
    uploadZone: document.getElementById('uploadZone'),
    audioUpload: document.getElementById('audioUpload'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileDuration: document.getElementById('fileDuration'),
    fileSampleRate: document.getElementById('fileSampleRate'),
    fileChannels: document.getElementById('fileChannels'),
    fileSize: document.getElementById('fileSize'),
    processingStatus: document.getElementById('processingStatus'),
    statusBar: document.getElementById('statusBar'),
    statusText: document.getElementById('statusText'),
    processBtn: document.getElementById('processBtn'),
    resetBtn: document.getElementById('resetBtn'),
    visualizerContainer: document.getElementById('visualizerContainer'),
    visualizerOverlay: document.getElementById('visualizerOverlay'),
    analysisDashboard: document.getElementById('analysisDashboard'),

    // Analysis elements
    peakLevel: document.getElementById('peakLevel'),
    rmsLevel: document.getElementById('rmsLevel'),
    dominantFreq: document.getElementById('dominantFreq'),
    spectralCentroid: document.getElementById('spectralCentroid'),
    lufsValue: document.getElementById('lufsValue'),
    dynamicRange: document.getElementById('dynamicRange'),
    stereoWidth: document.getElementById('stereoWidth'),
    stereoCorrelation: document.getElementById('stereoCorrelation'),

    // Control elements
    sliders: {
        expressionIntensity: document.getElementById('expressionIntensity'),
        phraseDynamics: document.getElementById('phraseDynamics'),
        tonalProcessing: document.getElementById('tonalProcessing'),
        processingStrength: document.getElementById('processingStrength'),
        dynamicVariation: document.getElementById('dynamicVariation'),
        levelAutomation: document.getElementById('levelAutomation'),
        phraseChanges: document.getElementById('phraseChanges'),
        timingAdjustment: document.getElementById('timingAdjustment'),
        compression: document.getElementById('compression'),
        compressionThreshold: document.getElementById('compressionThreshold'),
        pitchShift: document.getElementById('pitchShift'),
        finePitch: document.getElementById('finePitch'),
        pitchCorrection: document.getElementById('pitchCorrection'),
        vibratoDepth: document.getElementById('vibratoDepth'),
        vibratoRate: document.getElementById('vibratoRate'),
        formantShift: document.getElementById('formantShift'),
        eqLowFreq: document.getElementById('eqLowFreq'),
        eqLowGain: document.getElementById('eqLowGain'),
        eqMidFreq: document.getElementById('eqMidFreq'),
        eqMidGain: document.getElementById('eqMidGain'),
        eqHighFreq: document.getElementById('eqHighFreq'),
        eqHighGain: document.getElementById('eqHighGain'),
        saturation: document.getElementById('saturation'),
        reverbAmount: document.getElementById('reverbAmount'),
        stereoWidthControl: document.getElementById('stereoWidthControl'),
        harmonicEnhancement: document.getElementById('harmonicEnhancement')
    },

    sliderValues: {
        expressionIntensityValue: document.getElementById('expressionIntensityValue'),
        phraseDynamicsValue: document.getElementById('phraseDynamicsValue'),
        tonalProcessingValue: document.getElementById('tonalProcessingValue'),
        processingStrengthValue: document.getElementById('processingStrengthValue'),
        dynamicVariationValue: document.getElementById('dynamicVariationValue'),
        levelAutomationValue: document.getElementById('levelAutomationValue'),
        phraseChangesValue: document.getElementById('phraseChangesValue'),
        timingAdjustmentValue: document.getElementById('timingAdjustmentValue'),
        compressionValue: document.getElementById('compressionValue'),
        compressionThresholdValue: document.getElementById('compressionThresholdValue'),
        pitchShiftValue: document.getElementById('pitchShiftValue'),
        finePitchValue: document.getElementById('finePitchValue'),
        pitchCorrectionValue: document.getElementById('pitchCorrectionValue'),
        vibratoDepthValue: document.getElementById('vibratoDepthValue'),
        vibratoRateValue: document.getElementById('vibratoRateValue'),
        formantShiftValue: document.getElementById('formantShiftValue'),
        eqLowFreqValue: document.getElementById('eqLowFreqValue'),
        eqLowGainValue: document.getElementById('eqLowGainValue'),
        eqMidFreqValue: document.getElementById('eqMidFreqValue'),
        eqMidGainValue: document.getElementById('eqMidGainValue'),
        eqHighFreqValue: document.getElementById('eqHighFreqValue'),
        eqHighGainValue: document.getElementById('eqHighGainValue'),
        saturationValue: document.getElementById('saturationValue'),
        reverbAmountValue: document.getElementById('reverbAmountValue'),
        stereoWidthControlValue: document.getElementById('stereoWidthControlValue'),
        harmonicEnhancementValue: document.getElementById('harmonicEnhancementValue')
    },

    // Player elements
    originalPlayBtn: document.getElementById('originalPlayBtn'),
    originalPauseBtn: document.getElementById('originalPauseBtn'),
    originalStopBtn: document.getElementById('originalStopBtn'),
    originalProgressBar: document.getElementById('originalProgressBar'),
    originalTime: document.getElementById('originalTime'),
    originalDuration: document.getElementById('originalDuration'),
    originalVolume: document.getElementById('originalVolume'),
    originalVolumeValue: document.getElementById('originalVolumeValue'),

    processedPlayBtn: document.getElementById('processedPlayBtn'),
    processedPauseBtn: document.getElementById('processedPauseBtn'),
    processedStopBtn: document.getElementById('processedStopBtn'),
    processedProgressBar: document.getElementById('processedProgressBar'),
    processedTime: document.getElementById('processedTime'),
    processedDuration: document.getElementById('processedDuration'),
    processedVolume: document.getElementById('processedVolume'),
    processedVolumeValue: document.getElementById('processedVolumeValue'),

    syncPlayback: document.getElementById('syncPlayback'),
    abCompareBtn: document.getElementById('abCompareBtn'),

    // Export elements
    exportWavBtn: document.getElementById('exportWavBtn'),
    exportMp3Btn: document.getElementById('exportMp3Btn'),
    mp3Bitrate: document.getElementById('mp3Bitrate'),
    exportStatus: document.getElementById('exportStatus'),

    // Cleanup elements
    cleanupBtn: document.getElementById('cleanupBtn'),
    cleanupStatus: document.getElementById('cleanupStatus'),

    // Tab elements
    tabBtns: document.querySelectorAll('.tab-btn'),
    controlPanels: document.querySelectorAll('.control-panel'),

    // Modal elements
    memoryWarningModal: document.getElementById('memoryWarningModal'),
    loadingModal: document.getElementById('loadingModal'),
    errorModal: document.getElementById('errorModal'),
    continueAnyway: document.getElementById('continueAnyway'),
    cancelProcessing: document.getElementById('cancelProcessing'),
    closeError: document.getElementById('closeError'),
    loadingText: document.getElementById('loadingText'),
    loadingProgress: document.getElementById('loadingProgress'),
    loadingPercent: document.getElementById('loadingPercent'),
    errorMessage: document.getElementById('errorMessage'),

    // Separation button
    separateVocalsBtn: document.getElementById('separateVocalsBtn')
};

// Initialize the application
async function initHumanizer() {
    console.log('Initializing Vedank Music Humanizer...');

    try {
        // Create audio context
        HumanizerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext created:', HumanizerState.audioContext);

        // Initialize visualizer
        initVisualizer();

        // Initialize analyzer
        HumanizerState.analyzer = new AudioAnalyzer(HumanizerState.audioContext);

        // Setup event listeners
        setupEventListeners();

        // Setup slider value displays
        setupSliderValueDisplays();

        // Check for WebAssembly support
        checkWebAssemblySupport();

        // Check for WebGPU support (for future vocal separation)
        checkWebGPUSupport();

        // Check memory
        checkMemory();

        console.log('Vedank Music Humanizer initialized successfully');
        updateStatus('Ready', 'idle');

    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize audio engine: ' + error.message);
    }
}

// Initialize visualizer
function initVisualizer() {
    try {
        HumanizerState.visualizer = new ThreeVisualizer({
            container: DOM.visualizerContainer,
            canvas: document.getElementById('threeCanvas'),
            audioContext: HumanizerState.audioContext
        });
        DOM.visualizerOverlay.style.display = 'none';
        console.log('Three.js visualizer initialized');
    } catch (error) {
        console.warn('Failed to initialize Three.js visualizer:', error);
        DOM.visualizerOverlay.innerHTML = '<p>3D Visualizer unavailable: ' + error.message + '</p>';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Upload zone events
    DOM.uploadZone.addEventListener('click', () => DOM.audioUpload.click());

    DOM.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.add('dragover');
    });

    DOM.uploadZone.addEventListener('dragleave', () => {
        DOM.uploadZone.classList.remove('dragover');
    });

    DOM.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // File input change
    DOM.audioUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // Process button
    DOM.processBtn.addEventListener('click', processAudio);

    // Reset button
    DOM.resetBtn.addEventListener('click', resetHumanizer);

    // Player controls
    DOM.originalPlayBtn.addEventListener('click', () => playOriginal());
    DOM.originalPauseBtn.addEventListener('click', () => pauseOriginal());
    DOM.originalStopBtn.addEventListener('click', () => stopOriginal());
    DOM.originalVolume.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        if (HumanizerState.originalAudioNode) {
            HumanizerState.originalAudioNode.gain.value = volume;
        }
        DOM.originalVolumeValue.textContent = e.target.value + '%';
    });

    DOM.processedPlayBtn.addEventListener('click', () => playProcessed());
    DOM.processedPauseBtn.addEventListener('click', () => pauseProcessed());
    DOM.processedStopBtn.addEventListener('click', () => stopProcessed());
    DOM.processedVolume.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        if (HumanizerState.processedAudioNode) {
            HumanizerState.processedAudioNode.gain.value = volume;
        }
        DOM.processedVolumeValue.textContent = e.target.value + '%';
    });

    // Export buttons
    DOM.exportWavBtn.addEventListener('click', exportWAV);
    DOM.exportMp3Btn.addEventListener('click', exportMP3);

    // Cleanup button
    DOM.cleanupBtn.addEventListener('click', cleanupTemporaryFiles);

    // A/B Compare button
    DOM.abCompareBtn.addEventListener('click', abCompare);

    // Tab buttons
    DOM.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            DOM.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            DOM.controlPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(tabName + 'Controls').classList.add('active');
        });
    });

    // Modal buttons
    DOM.continueAnyway.addEventListener('click', () => {
        DOM.memoryWarningModal.classList.remove('active');
        processAudio();
    });

    DOM.cancelProcessing.addEventListener('click', () => {
        DOM.memoryWarningModal.classList.remove('active');
        HumanizerState.isProcessing = false;
        updateStatus('Cancelled', 'idle');
    });

    DOM.closeError.addEventListener('click', () => {
        DOM.errorModal.classList.remove('active');
    });

    // Sliders - update state on input
    Object.keys(DOM.sliders).forEach(key => {
        DOM.sliders[key].addEventListener('input', (e) => {
            HumanizerState.processingParams[key] = parseFloat(e.target.value);
            DOM.sliderValues[key + 'Value'].textContent = formatSliderValue(key, e.target.value);
        });
    });

    // Separation button (experimental)
    DOM.separateVocalsBtn.addEventListener('click', () => {
        showError('Vocal separation is experimental and not yet available in the browser. ' +
                  'This feature requires downloading large ML models (50-200MB) and may not work on mobile devices.');
    });

    // Window resize
    window.addEventListener('resize', () => {
        if (HumanizerState.visualizer) {
            HumanizerState.visualizer.resize();
        }
    });

    // Prevent default drag behavior
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
}

// Setup slider value displays
function setupSliderValueDisplays() {
    Object.keys(DOM.sliders).forEach(key => {
        DOM.sliderValues[key + 'Value'].textContent = formatSliderValue(key, DOM.sliders[key].value);
    });
}

// Format slider value based on type
function formatSliderValue(key, value) {
    const numValue = parseFloat(value);

    // Special formatting for certain sliders
    if (key === 'pitchShift' || key === 'formantShift') {
        return numValue > 0 ? '+' + numValue : numValue;
    }
    if (key === 'finePitch') {
        return numValue > 0 ? '+' + numValue + ' cents' : numValue + ' cents';
    }
    if (key === 'timingAdjustment') {
        return numValue > 0 ? '+' + numValue + ' ms' : numValue + ' ms';
    }
    if (key === 'vibratoRate') {
        return numValue.toFixed(1) + ' Hz';
    }
    if (key === 'compressionThreshold') {
        return numValue + ' dB';
    }
    if (key.includes('Gain')) {
        return numValue > 0 ? '+' + numValue + ' dB' : numValue + ' dB';
    }
    if (key.includes('Freq')) {
        return numValue + ' Hz';
    }
    if (key === 'stereoWidthControl') {
        return numValue + '%';
    }

    return numValue;
}

// Handle file upload
async function handleFileUpload(file) {
    console.log('File uploaded:', file.name, file.size, file.type);

    try {
        // Validate file
        if (!isValidAudioFile(file)) {
            throw new Error('Unsupported file type. Please upload WAV, MP3, OGG, AAC, or FLAC.');
        }

        // Check file size (max 50MB for safety)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error('File is too large. Maximum size is 50MB.');
        }

        // Store file reference
        HumanizerState.audioFile = file;

        // Update UI
        updateStatus('Decoding audio...', 'processing');
        DOM.processBtn.disabled = true;

        // Decode audio file
        const audioBuffer = await decodeAudioFile(file);

        // Validate duration (2-5 minutes)
        const duration = audioBuffer.duration;
        if (duration < 120 || duration > 300) {
            throw new Error('Audio duration must be between 2 and 5 minutes (120-300 seconds).');
        }

        // Store buffer
        HumanizerState.originalAudioBuffer = audioBuffer;

        // Update file info
        updateFileInfo(file, audioBuffer);

        // Analyze audio
        await analyzeAudio(audioBuffer);

        // Update visualizer with audio data
        if (HumanizerState.visualizer) {
            HumanizerState.visualizer.setAudioBuffer(audioBuffer);
        }

        // Enable process button
        DOM.processBtn.disabled = false;
        updateStatus('Ready to process', 'idle');

        // Show file info
        DOM.fileInfo.style.display = 'block';

        console.log('Audio file loaded successfully:', {
            name: file.name,
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.numberOfChannels,
            size: file.size
        });

    } catch (error) {
        console.error('File upload error:', error);
        showError('Failed to load audio file: ' + error.message);
        resetFileUpload();
    }
}

// Validate audio file
function isValidAudioFile(file) {
    const validTypes = [
        'audio/wav',
        'audio/wave',
        'audio/mpeg',
        'audio/mp3',
        'audio/ogg',
        'audio/aac',
        'audio/flac',
        'audio/x-flac'
    ];

    const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
    const validExtensions = ['wav', 'mp3', 'ogg', 'aac', 'flac', 'm4a'];

    return validTypes.includes(file.type) || validExtensions.includes(extension);
}

// Decode audio file
function decodeAudioFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const audioBuffer = await HumanizerState.audioContext.decodeAudioData(arrayBuffer);
                resolve(audioBuffer);
            } catch (error) {
                reject(new Error('Failed to decode audio data: ' + error.message));
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsArrayBuffer(file);
    });
}

// Update file info display
function updateFileInfo(file, audioBuffer) {
    HumanizerState.fileInfo = {
        name: file.na
