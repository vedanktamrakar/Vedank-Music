(() => {
'use strict';
const $ = id => document.getElementById(id);
const MAX_BYTES = 100 * 1024 * 1024;
let sourceBuffer = null, processedBuffer = null, processedBlobUrl = null, sourceBlobUrl = null, sourceName = '';
let sourceReport = null, afterReport = null;

function status(message, error = false) {
  const el = $('alStatus');
  el.textContent = message;
  el.classList.toggle('error', error);
}
function fmtNum(n, digits = 3) {
  return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
}
function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return 'N/A';
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function dbfs(v) {
  return v > 0 ? `${(20 * Math.log10(v)).toFixed(2)} dBFS` : '-∞ dBFS';
}
async function analyse(buffer) {
  const channels = [];
  let peak = 0, sumSquares = 0, sum = 0, sampleCount = 0, clipped = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    let cPeak = 0, cSum = 0, cSq = 0, cClip = 0;
    for (let i = 0; i < data.length; i++) {
      const x = data[i], ax = Math.abs(x);
      if (ax > cPeak) cPeak = ax;
      if (ax >= 0.999) cClip++;
      cSum += x; cSq += x * x;
    }
    channels.push({
      peak: cPeak,
      rms: Math.sqrt(cSq / Math.max(1, data.length)),
      dcOffset: cSum / Math.max(1, data.length),
      clippedSamples: cClip
    });
    peak = Math.max(peak, cPeak);
    sum += cSum; sumSquares += cSq; clipped += cClip; sampleCount += data.length;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  let correlation = null;
  if (buffer.numberOfChannels >= 2) {
    const a = buffer.getChannelData(0), b = buffer.getChannelData(1);
    const n = Math.min(a.length, b.length);
    let aa = 0, bb = 0, ab = 0, ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= Math.max(1, n); mb /= Math.max(1, n);
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      aa += x * x; bb += y * y; ab += x * y;
    }
    correlation = aa && bb ? ab / Math.sqrt(aa * bb) : null;
  }
  const spectrum = analyseSpectrum(buffer);
  const estimatedLufs = await estimateIntegratedLoudness(buffer);
  return {
    durationSeconds: buffer.duration, sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels, samplesPerChannel: buffer.length,
    peakLinear: peak, peakDbfs: dbfs(peak), rmsLinear: rms, rmsDbfs: dbfs(rms),
    crestFactorDb: rms > 0 && peak > 0 ? 20 * Math.log10(peak / rms) : null,
    dcOffsetMean: sum / Math.max(1, sampleCount),
    clippedSamples: clipped, clippedSamplePercent: 100 * clipped / Math.max(1, sampleCount),
    stereoCorrelation: correlation, perChannel: channels,
    estimatedIntegratedLufs: estimatedLufs,
    spectrum
  };
}
// Lightweight FFT-based spectrum summary. Uses multiple windows and is descriptive, not a mastering score.
function analyseSpectrum(buffer) {
  const N = 2048, hop = Math.max(N, Math.floor(buffer.length / 24));
  const channel = buffer.getChannelData(0);
  let bins = new Float64Array(N / 2), windows = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let start = 0; start + N <= channel.length && windows < 32; start += hop) {
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      re[i] = channel[start + i] * w; im[i] = 0;
    }
    // Iterative radix-2 Cooley–Tukey FFT.
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len, wr0 = Math.cos(ang), wi0 = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let j = 0; j < len / 2; j++) {
          const u = i + j, v = u + len / 2;
          const vr = re[v] * wr - im[v] * wi, vi = re[v] * wi + im[v] * wr;
          re[v] = re[u] - vr; im[v] = im[u] - vi;
          re[u] += vr; im[u] += vi;
          const nwr = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = nwr;
        }
      }
    }
    for (let k = 1; k < N / 2; k++) bins[k] += re[k] * re[k] + im[k] * im[k];
    windows++;
  }
  if (!windows) return { centroidHz: null, rolloff85Hz: null, lowPercent: null, midPercent: null, highPercent: null, note: 'Audio is too short for this spectrum window.' };
  let total = 0, weighted = 0;
  const hzPerBin = buffer.sampleRate / N;
  let low = 0, mid = 0, high = 0;
  for (let k = 1; k < bins.length; k++) {
    const hz = k * hzPerBin, p = bins[k] / windows;
    total += p; weighted += hz * p;
    if (hz < 250) low += p;
    else if (hz < 4000) mid += p;
    else high += p;
  }
  let cumulative = 0, rolloff = null;
  for (let k = 1; k < bins.length; k++) {
    cumulative += bins[k] / windows;
    if (cumulative >= total * 0.85) { rolloff = k * hzPerBin; break; }
  }
  return {
    centroidHz: total > 0 ? weighted / total : null,
    rolloff85Hz: rolloff,
    lowPercent: total ? 100 * low / total : 0,
    midPercent: total ? 100 * mid / total : 0,
    highPercent: total ? 100 * high / total : 0,
    note: 'Relative spectrum energy from the left/first channel; not a quality rating.'
  };
}
// Approximation only: browser K-weighting filters and gated 400 ms blocks. Not a certified EBU R128 meter.
async function estimateIntegratedLoudness(buffer) {
  try {
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38.135; hp.Q.value = 0.5;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1681.974; shelf.gain.value = 4;
    src.connect(hp); hp.connect(shelf); shelf.connect(ctx.destination); src.start(0);
    const weighted = await ctx.startRendering();
    const blockSize = Math.max(1, Math.round(weighted.sampleRate * 0.4));
    const energies = [];
    for (let start = 0; start + blockSize <= weighted.length; start += blockSize) {
      let e = 0, count = 0;
      for (let c = 0; c < weighted.numberOfChannels; c++) {
        const d = weighted.getChannelData(c);
        for (let i = start; i < start + blockSize; i++) { e += d[i] * d[i]; count++; }
      }
      const mean = e / Math.max(1, count);
      if (mean > 0) {
        const l = -0.691 + 10 * Math.log10(mean);
        if (l > -70) energies.push({ mean, l });
      }
    }
    if (!energies.length) return null;
    const mean1 = energies.reduce((s, x) => s + x.mean, 0) / energies.length;
    const gate = -0.691 + 10 * Math.log10(mean1) - 10;
    const kept = energies.filter(x => x.l >= gate);
    if (!kept.length) return null;
    const mean2 = kept.reduce((s, x) => s + x.mean, 0) / kept.length;
    return -0.691 + 10 * Math.log10(mean2);
  } catch (_) { return null; }
}
function metric(label, value) {
  const d = document.createElement('div');
  d.className = 'al-metric';
  const s = document.createElement('span'), b = document.createElement('strong');
  s.textContent = label; b.textContent = value;
  d.append(s, b); return d;
}
function showMetrics(target, report) {
  const el = $(target); el.replaceChildren();
  const items = [
    ['Duration', fmtTime(report.durationSeconds)],
    ['Sample rate', `${report.sampleRate.toLocaleString()} Hz`],
    ['Channels', String(report.channels)],
    ['Peak level', report.peakDbfs],
    ['RMS level', report.rmsDbfs],
    ['Crest factor', report.crestFactorDb == null ? 'N/A' : `${fmtNum(report.crestFactorDb, 2)} dB`],
    ['Near-full-scale samples', `${report.clippedSamples.toLocaleString()} (${fmtNum(report.clippedSamplePercent, 5)}%)`],
    ['Mean DC offset', fmtNum(report.dcOffsetMean, 6)]
  ];
  if (report.stereoCorrelation != null) items.push(['L/R correlation', fmtNum(report.stereoCorrelation, 4)]);
  items.push(['Estimated integrated loudness', report.estimatedIntegratedLufs == null ? 'N/A' : `${fmtNum(report.estimatedIntegratedLufs, 1)} LUFS*`]);
  if (report.spectrum) {
    items.push(['Spectral centroid', report.spectrum.centroidHz == null ? 'N/A' : `${Math.round(report.spectrum.centroidHz).toLocaleString()} Hz`]);
    items.push(['85% spectral rolloff', report.spectrum.rolloff85Hz == null ? 'N/A' : `${Math.round(report.spectrum.rolloff85Hz).toLocaleString()} Hz`]);
  }
  items.forEach(([a, b]) => el.appendChild(metric(a, b)));
  if (report.spectrum) {
    const spec = document.createElement('div'); spec.className = 'al-status';
    spec.textContent = `Spectrum energy (first channel): Bass below 250 Hz ${fmtNum(report.spectrum.lowPercent, 1)}% · Mids 250–4,000 Hz ${fmtNum(report.spectrum.midPercent, 1)}% · Highs above 4,000 Hz ${fmtNum(report.spectrum.highPercent, 1)}%. These are relative energy shares, not targets to maximize.`;
    el.appendChild(spec);
  }
}
function showChecks(report) {
  const root = $('alChecks'); root.replaceChildren();
  const checks = [];
  checks.push({
    label: 'Near-full-scale sample check',
    detail: report.clippedSamples
      ? `${report.clippedSamples.toLocaleString()} samples reach |0.999| or above. This can indicate clipping risk, but does not prove audible distortion.`
      : 'No samples reach |0.999|. This basic check does not prove that the recording is distortion-free.',
    warn: report.clippedSamples > 0
  });
  const maxDC = Math.max(...report.perChannel.map(c => Math.abs(c.dcOffset)));
  checks.push({
    label: 'DC offset check',
    detail: maxDC > 0.01 ? `Largest channel mean is ${fmtNum(maxDC, 5)}; consider inspecting the waveform.` : `Largest channel mean is ${fmtNum(maxDC, 5)}; no large average offset was measured.`,
    warn: maxDC > 0.01
  });
  if (report.stereoCorrelation != null) {
    checks.push({
      label: 'Stereo correlation',
      detail: report.stereoCorrelation < 0 ? `Correlation is ${fmtNum(report.stereoCorrelation, 3)}; check mono compatibility by listening.` : `Correlation is ${fmtNum(report.stereoCorrelation, 3)}. This is a measurement, not a quality score.`,
      warn: report.stereoCorrelation < 0
    });
  }
  checks.push({
    label: 'Loudness estimate limitation',
    detail: 'Estimated LUFS uses a browser approximation of K-weighting and gating. Do not treat it as an official EBU R128/ITU-R BS.1770 compliance measurement.',
    warn: false
  });
  checks.forEach(c => {
    const d = document.createElement('div'); d.className = 'al-status';
    d.textContent = `${c.warn ? 'Check: ' : 'Info: '}${c.label} — ${c.detail}`;
    root.appendChild(d);
  });
}
function settings() {
  return {
    lowDb: Number($('alLow').value),
    midDb: Number($('alMid').value),
    highDb: Number($('alHigh').value),
    compressor: Number($('alComp').value) / 100,
    gainDb: Number($('alGain').value)
  };
}
function updateLabels() {
  $('alLowVal').textContent = `${$('alLow').value} dB`;
  $('alMidVal').textContent = `${$('alMid').value} dB`;
  $('alHighVal').textContent = `${$('alHigh').value} dB`;
  $('alCompVal').textContent = Number($('alComp').value) === 0 ? 'Off' : `${$('alComp').value}%`;
  $('alGainVal').textContent = `${$('alGain').value} dB`;
}
async function renderProcessed() {
  if (!sourceBuffer) throw new Error('Choose an audio file first.');
  const s = settings(), rate = sourceBuffer.sampleRate, length = sourceBuffer.length;
  const ctx = new OfflineAudioContext(sourceBuffer.numberOfChannels, length, rate);
  const src = ctx.createBufferSource(); src.buffer = sourceBuffer;
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = s.lowDb;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.8; mid.gain.value = s.midDb;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 6500; high.gain.value = s.highDb;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = s.compressor === 0 ? 0 : -6 - s.compressor * 24;
  comp.knee.value = 8; comp.ratio.value = 1 + s.compressor * 7;
  comp.attack.value = 0.01; comp.release.value = 0.18;
  const gain = ctx.createGain(); gain.gain.value = Math.pow(10, s.gainDb / 20);
  src.connect(low); low.connect(mid); mid.connect(high);
  if (s.compressor > 0) { high.connect(comp); comp.connect(gain); }
  else high.connect(gain);
  gain.connect(ctx.destination); src.start(0);
  return await ctx.startRendering();
}
function toWav16(buffer) {
  const channels = buffer.numberOfChannels, frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const ab = new ArrayBuffer(bytes), v = new DataView(ab);
  const write = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
  write(0, 'RIFF'); v.setUint32(4, bytes - 8, true); write(8, 'WAVE');
  write(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, channels, true); v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true); write(36, 'data'); v.setUint32(40, bytes - 44, true);
  let o = 44;
  const channelData = Array.from({length: channels}, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const x = Math.max(-1, Math.min(1, channelData[c][i]));
    v.setInt16(o, Math.round(x < 0 ? x * 32768 : x * 32767), true); o += 2;
  }
  return new Blob([ab], {type: 'audio/wav'});
}
function safeBaseName(name) { return name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 100) || 'audio'; }
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function resetOutput() {
  if (processedBlobUrl) URL.revokeObjectURL(processedBlobUrl);
  processedBlobUrl = null; processedBuffer = null; afterReport = null;
  $('alProcessedPlayer').classList.add('al-hidden');
  $('alProcessedInfo').textContent = 'No processed version yet.';
  $('alExport').disabled = true;
}
$('alFile').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_BYTES) { status('File exceeds the 100 MB limit. Choose a smaller file.', true); return; }
  if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|aac|flac|ogg|opus|aiff?|weba)$/i.test(file.name)) {
    status('That file does not appear to be an audio file.', true); return;
  }
  resetOutput(); sourceBuffer = null; sourceReport = null; sourceName = file.name;
  if (sourceBlobUrl) URL.revokeObjectURL(sourceBlobUrl);
  sourceBlobUrl = URL.createObjectURL(file);
  $('alOriginalAudio').src = sourceBlobUrl;
  $('alAnalysis').classList.add('al-hidden'); $('alProcessing').classList.add('al-hidden');
  $('alPreview').disabled = true; $('alReset').disabled = true; $('alReport').disabled = true;
  $('alFileInfo').textContent = `${file.name} · ${(file.size / 1048576).toFixed(2)} MB`;
  status('Reading and decoding audio in this browser…');
  try {
    const bytes = await file.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('This browser does not support Web Audio. Try a current version of Chrome or Firefox.');
    const ctx = new Ctx();
    try { sourceBuffer = await ctx.decodeAudioData(bytes); } finally { await ctx.close(); }
    sourceReport = await analyse(sourceBuffer);
    showMetrics('alMetrics', sourceReport); showChecks(sourceReport);
    $('alAnalysis').classList.remove('al-hidden'); $('alProcessing').classList.remove('al-hidden');
    $('alPreview').disabled = false; $('alReset').disabled = false; $('alReport').disabled = false;
    status('Analysis complete. Play the original and use small adjustments for comparison.');
  } catch (err) {
    sourceBuffer = null; status(`Could not decode this file in the current browser: ${err.message || 'unsupported format'}`, true);
  }
});
['alLow','alMid','alHigh','alComp','alGain'].forEach(id => $(id).addEventListener('input', updateLabels));
$('alPreview').addEventListener('click', async () => {
  const b = $('alPreview'); b.disabled = true; b.textContent = 'Rendering…';
  try {
    resetOutput();
    processedBuffer = await renderProcessed();
    afterReport = await analyse(processedBuffer);
    const blob = toWav16(processedBuffer);
    processedBlobUrl = URL.createObjectURL(blob);
    $('alProcessedAudio').src = processedBlobUrl;
    $('alProcessedPlayer').classList.remove('al-hidden');
    showMetrics('alAfterMetrics', afterReport);
    $('alProcessedInfo').textContent = `Rendered WAV · ${processedBuffer.sampleRate.toLocaleString()} Hz · ${processedBuffer.numberOfChannels} channel(s) · ${(blob.size / 1048576).toFixed(2)} MB. Listen and compare before exporting.`;
    $('alExport').disabled = false;
  } catch (err) {
    $('alProcessedInfo').textContent = `Processing failed: ${err.message || err}`;
  } finally { b.disabled = !sourceBuffer; b.textContent = 'Render processed audio'; }
});
$('alReset').addEventListener('click', () => {
  ['alLow','alMid','alHigh','alComp','alGain'].forEach(id => $(id).value = 0);
  updateLabels(); resetOutput();
});
$('alExport').addEventListener('click', () => {
  if (!processedBuffer) return;
  download(toWav16(processedBuffer), `${safeBaseName(sourceName)}_processed.wav`);
});
$('alReport').addEventListener('click', () => {
  if (!sourceReport) return;
  const report = {
    tool: 'Vedank Music Audio Lab',
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    fileName: sourceName,
    note: 'Signal measurements only. Estimated integrated loudness is a browser approximation, not certified EBU R128/ITU-R BS.1770 compliance. Spectrum summary uses the first channel. This report does not identify human/AI origin and does not validate or remove provenance markers.',
    original: sourceReport,
    processing: processedBuffer ? settings() : null,
    processed: afterReport
  };
  download(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}),
           `${safeBaseName(sourceName)}_audio-report.json`);
});
updateLabels();
window.addEventListener('beforeunload', () => {
  if (processedBlobUrl) URL.revokeObjectURL(processedBlobUrl);
  if (sourceBlobUrl) URL.revokeObjectURL(sourceBlobUrl);
});
})();
