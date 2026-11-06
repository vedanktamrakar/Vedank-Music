export function analyzeAudio(audio, onProgress = () => {}, signal = null) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/humanizer/workers/analysis-worker.js');
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      handler(value);
    };
    const abort = () => finish(reject, new DOMException('Analysis cancelled.', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, {once: true});
    const stride = Math.max(1, Math.floor(audio.sampleRate / 11025));
    const length = Math.ceil(audio.length / stride);
    const mono = new Float32Array(length);
    const left = audio.channels[0];
    const right = audio.channels[1] || left;
    for (let i = 0, j = 0; i < left.length; i += stride, j++) mono[j] = (left[i] + right[i]) * 0.5;
    worker.onmessage = event => {
      const data = event.data || {};
      if (data.type === 'progress') onProgress(data.value);
      if (data.type === 'result') finish(resolve, data.result);
      if (data.type === 'error') finish(reject, new Error(data.message || 'Audio analysis failed.'));
    };
    worker.onerror = () => finish(reject, new Error('The analysis worker stopped unexpectedly.'));
    worker.postMessage({type:'analyze', samples:mono, sampleRate:audio.sampleRate/stride, originalSampleRate:audio.sampleRate, length:audio.length, duration:audio.duration, channels:audio.numberOfChannels}, [mono.buffer]);
  });
}
