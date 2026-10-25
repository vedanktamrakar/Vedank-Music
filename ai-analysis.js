/* ai-analysis.js v1 — Vedank AI Audio Lab analysis engine.
   Pure JavaScript, no dependencies, no network. Works in browsers (window.AudioAnalysis) and Node (module.exports).
   Every value is computed from the samples/bytes passed in. Nothing is simulated. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AudioAnalysis = factory();
})(typeof self !== "undefined" ? self : this, function () {
"use strict";
const VERSION = "ai-analysis.js v1";
const MAX_BYTES = 200 * 1024 * 1024, MAX_SEC = 30 * 60;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const db = x => 20 * Math.log10(Math.max(x, 1e-12));
const r = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const str = (b, o, n) => { let s = ""; for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s; };
const le16 = (b, o) => b[o] | (b[o + 1] << 8);
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const ss32 = (b, o) => ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);
const pct = (arr, p) => { const a = Array.from(arr).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : NaN; };

/* ---------------- Metadata / container inspection ---------------- */
function decText(b, s, e, enc) {
  if (e <= s) return "";
  let label = enc === 3 ? "utf-8" : "iso-8859-1";
  if (enc === 1 || enc === 2) {
    if (b[s] === 0xFE && b[s + 1] === 0xFF) { label = "utf-16be"; s += 2; }
    else if (b[s] === 0xFF && b[s + 1] === 0xFE) { label = "utf-16le"; s += 2; }
    else label = enc === 2 ? "utf-16be" : "utf-16le";
  }
  try { return new TextDecoder(label).decode(b.subarray(s, e)).replace(/\0+/g, " ").trim(); } catch (_) { return ""; }
}
function parseId3(b, m, size) {
  const ver = b[3]; let pos = 10; const end = Math.min(10 + size, b.length);
  m.id3 = { version: "2." + ver + "." + b[4], frames: [] };
  if (b[5] & 0x40) pos += 4 + (ver === 4 ? ss32(b, 10) : be32(b, 10));
  while (pos + 10 <= end && m.id3.frames.length < 300) {
    const id = str(b, pos, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const sz = ver === 4 ? ss32(b, pos + 4) : be32(b, pos + 4);
    if (sz <= 0 || pos + 10 + sz > end) break;
    m.id3.frames.push(id);
    if (id[0] === "T") m.tags[id === "TXXX" ? "TXXX:" + (m.id3.frames.length) : id] = decText(b, pos + 11, pos + 10 + sz, b[pos + 10]);
    pos += 10 + sz;
  }
}
const MP3_BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MP3_SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function parseMp3(b, off, m) {
  const lim = Math.min(b.length - 4, off + 65536);
  for (let i = off; i < lim; i++) {
    if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) continue;
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3;
    if (ver === 1 || layer === 0 || bri === 0 || bri === 15 || sri === 3) continue;
    m.container = "mp3"; m.codec = "MPEG-" + (ver === 3 ? "1" : ver === 2 ? "2" : "2.5") + " Layer " + (layer === 1 ? "III" : layer === 2 ? "II" : "I");
    m.sampleRate = MP3_SR[ver][sri]; m.channels = (b[i + 3] >> 6) === 3 ? 1 : 2; m.lossy = true; m.bitDepth = null;
    if (layer !== 1) { m.notes.push("Layer I/II: bitrate and duration not parsed."); return; }
    m.bitrateKbps = (ver === 3 ? MP3_BR1 : MP3_BR2)[bri];
    const spf = ver === 3 ? 1152 : 576;
    const side = ver === 3 ? (m.channels === 1 ? 17 : 32) : (m.channels === 1 ? 9 : 17);
    const tag = i + 4 + side + ((b[i + 1] & 1) === 0 ? 2 : 0), t = str(b, tag, 4);
    m.vbr = t === "Xing" ? true : t === "Info" ? false : null;
    if ((t === "Xing" || t === "Info") && (b[tag + 7] & 1)) {
      const fr = be32(b, tag + 8); m.frames = fr; m.durationSec = r(fr * spf / m.sampleRate, 3); m.durationBasis = "Xing/Info frame count";
    } else { m.durationSec = r((b.length - i) * 8 / (m.bitrateKbps * 1000), 2); m.durationBasis = "estimate from first-frame bitrate (inaccurate for VBR)"; }
    const region = str(b, tag, 200), enc = region.match(/(LAME|Lavc|Lavf|GOGO|Xing)[\x20-\x7e]{3,12}/);
    if (enc) m.encoder = enc[0].trim();
    return;
  }
  m.notes.push("No valid MP3 frame header found in the first 64 KB.");
}
function parseWav(b, m) {
  m.container = "wav"; m.chunks = [];
  const riffSize = le32(b, 4);
  if (riffSize + 8 > b.length + 1) m.notes.push("RIFF header declares " + (riffSize + 8) + " bytes but file has " + b.length + " (truncated file?).");
  let pos = 12, dataSize = null;
  while (pos + 8 <= b.length && m.chunks.length < 64) {
    const id = str(b, pos, 4), sz = le32(b, pos + 4), body = pos + 8; m.chunks.push(id);
    if (id === "fmt " && sz >= 16) {
      let tag = le16(b, body); m.channels = le16(b, body + 2); m.sampleRate = le32(b, body + 4); m.bitDepth = le16(b, body + 14);
      if (tag === 0xFFFE && sz >= 26) tag = le16(b, body + 24);
      m.codec = tag === 1 ? "PCM integer" : tag === 3 ? "PCM float" : "WAVE format 0x" + tag.toString(16);
      m.lossy = tag === 1 || tag === 3 ? false : null;
    } else if (id === "data") { dataSize = Math.min(sz, b.length - body); if (sz > b.length - body) m.notes.push("data chunk larger than file."); }
    else if (id === "LIST" && str(b, body, 4) === "INFO") {
      let p = body + 4; const e = Math.min(body + sz, b.length);
      while (p + 8 <= e) { const k = str(b, p, 4), s = le32(b, p + 4); m.tags["INFO:" + k] = decText(b, p + 8, Math.min(p + 8 + s, e), 0); p += 8 + s + (s & 1); }
    } else if (id === "bext") { m.tags["bext:description"] = decText(b, body, body + 256, 0); m.tags["bext:originator"] = decText(b, body + 256, body + 288, 0); }
    else if (id === "iXML") m.tags["iXML"] = decText(b, body, Math.min(body + sz, body + 400), 3);
    pos = body + sz + (sz & 1);
    if (sz === 0xFFFFFFFF) break;
  }
  if (dataSize != null && m.channels && m.bitDepth && m.sampleRate) m.durationSec = r(dataSize / (m.channels * (m.bitDepth / 8)) / m.sampleRate, 3);
  else m.notes.push("Could not derive duration (missing fmt/data chunk).");
  if (dataSize == null) m.error = "WAV has no data chunk.";
}
function parseFlac(b, off, m) {
  m.container = "flac"; m.codec = "FLAC"; m.lossy = false; let pos = off + 4, last = false; m.blocks = [];
  while (!last && pos + 4 <= b.length && m.blocks.length < 32) {
    last = !!(b[pos] & 0x80); const type = b[pos] & 0x7F, len = (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3], d = pos + 4;
    m.blocks.push(type);
    if (type === 0 && len >= 34) {
      m.sampleRate = (b[d + 10] << 12) | (b[d + 11] << 4) | (b[d + 12] >> 4); m.channels = ((b[d + 12] >> 1) & 7) + 1;
      m.bitDepth = (((b[d + 12] & 1) << 4) | (b[d + 13] >> 4)) + 1;
      const total = (b[d + 13] & 15) * 4294967296 + be32(b, d + 14);
      if (total > 0) m.durationSec = r(total / m.sampleRate, 3);
    } else if (type === 4) {
      let p = d; const vl = le32(b, p); p += 4; m.tags["vendor"] = decText(b, p, p + vl, 3); p += vl;
      const n = le32(b, p); p += 4;
      for (let i = 0; i < n && p + 4 <= d + len && i < 100; i++) { const l = le32(b, p); p += 4; const s = decText(b, p, p + l, 3), q = s.indexOf("="); if (q > 0) m.tags[s.slice(0, q).toUpperCase()] = s.slice(q + 1); p += l; }
    }
    pos = d + len;
  }
}
function parseMetadata(arrayBuffer) {
  const b = new Uint8Array(arrayBuffer);
  const m = { bytes: b.length, container: "unknown", supported: false, tags: {}, notes: [], provenance: {} };
  if (b.length < 12) { m.error = "File is too small to be an audio file (" + b.length + " bytes)."; return m; }
  if (b.length > MAX_BYTES) { m.error = "File larger than 200 MB: refused to protect browser memory."; return m; }
  let off = 0;
  if (str(b, 0, 3) === "ID3") { parseId3(b, m, ss32(b, 6)); off = 10 + ss32(b, 6); }
  if (str(b, 0, 4) === "RIFF" && str(b, 8, 4) === "WAVE") parseWav(b, m);
  else if (str(b, off, 4) === "fLaC") parseFlac(b, off, m);
  else if (str(b, off, 4) === "OggS") { m.container = "ogg"; m.notes.push("Ogg recognised; deep metadata parsing not implemented."); }
  else if (str(b, 4, 4) === "ftyp") { m.container = "mp4/m4a"; m.notes.push("MP4 recognised; deep metadata parsing not implemented."); }
  else parseMp3(b, off, m);
  m.supported = m.container !== "unknown";
  if (!m.supported) m.error = "Unrecognised audio container (first bytes: " + Array.from(b.slice(0, 8)).map(x => x.toString(16).padStart(2, "0")).join(" ") + "). Supported: WAV, MP3, FLAC (Ogg and MP4 are recognised but not deeply parsed).";
  m.encoder = m.encoder || m.tags.TSSE || m.tags["INFO:ISFT"] || m.tags.vendor || undefined;
  // Provenance: marker search only. This does NOT validate a C2PA manifest.
  let c2pa = false;
  for (let i = 0; i < b.length - 4; i++) if (b[i] === 0x63 && b[i + 1] === 0x32 && b[i + 2] === 0x70 && b[i + 3] === 0x61) { c2pa = true; break; }
  m.provenance = { c2paMarkerBytes: c2pa, id3PrivOrGeobFrames: m.id3 ? m.id3.frames.filter(f => f === "PRIV" || f === "GEOB") : [],
    note: "A marker is not a verified manifest. An absent marker proves nothing about origin. No AI-origin detection is performed." };
  return m;
}

/* ---------------- FFT + analysis ---------------- */
function makeFFT(n) {
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
  for (let i = 0; i < n; i++) { let x = 0; for (let j = 0; j < bits; j++) if (i & (1 << j)) x |= 1 << (bits - 1 - j); rev[i] = x; }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, c = a + half, tr = re[c] * cos[k] - im[c] * sin[k], ti = re[c] * sin[k] + im[c] * cos[k];
        re[c] = re[a] - tr; im[c] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  };
}
const BANDS = [["sub", 20, 60], ["bass", 60, 250], ["low-mid", 250, 2000], ["high-mid", 2000, 6000], ["presence/treble", 6000, 12000], ["air", 12000, 20000]];
const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const pearson = (a, b) => { let ma = 0, mb = 0; for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; } ma /= 12; mb /= 12; let n = 0, da = 0, dbb = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2; } return n / Math.sqrt(da * dbb || 1); };

function estimateKey(chroma) {
  if (chroma.reduce((a, c) => a + c, 0) < 1e-9) return { status: "no-result", reason: "no pitched energy in 65–2100 Hz" };
  const res = [];
  for (let t = 0; t < 12; t++) {
    const rot = Array.from({ length: 12 }, (_, i) => chroma[(i + t) % 12]);
    res.push({ key: NOTE[t] + " major", corr: pearson(rot, KS_MAJ) }, { key: NOTE[t] + " minor", corr: pearson(rot, KS_MIN) });
  }
  res.sort((a, b) => b.corr - a.corr);
  const margin = res[0].corr - res[1].corr;
  return { status: "ok", key: res[0].key, correlation: r(res[0].corr, 3), runnerUp: res[1].key, margin: r(margin, 3),
    confidence: res[0].corr >= 0.75 && margin >= 0.08 ? "moderate" : res[0].corr < 0.55 || margin < 0.03 ? "low" : "low-moderate",
    note: "Krumhansl–Schmuckler profile match, A=440 Hz assumed. Relative major/minor and modulations are often confused." };
}
function estimateTempo(flux, fr) {
  if (flux.length < fr * 8) return { status: "not-run", reason: "needs at least 8 s of analysed audio" };
  const n = flux.length, cum = new Float64Array(n + 1), w = Math.round(fr / 2), x = new Float64Array(n);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + flux[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - w), e = Math.min(n, i + w + 1); x[i] = Math.max(0, flux[i] - (cum[e] - cum[a]) / (e - a)); }
  const xs = new Float64Array(n), K = [1, 2, 3, 2, 1];
  for (let i = 0; i < n; i++) { let q = 0; for (let j = -2; j <= 2; j++) { const idx = i + j; if (idx >= 0 && idx < n) q += K[j + 2] * x[idx]; } xs[i] = q / 9; }
  x.set(xs);
  let e0 = 0; for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (e0 < 1e-9) return { status: "no-result", reason: "no rhythmic energy (flat onset envelope)" };
  const lo = Math.floor(fr * 60 / 200), hi = Math.ceil(fr * 60 / 60), ac = new Float64Array(hi + 2);
  for (let l = lo - 1; l <= hi + 1; l++) { let s = 0; for (let i = 0; i + l < n; i++) s += x[i] * x[i + l]; ac[l] = s / e0; }
  const wt = l => Math.exp(-0.5 * Math.log2((60 * fr / l) / 120) ** 2);
  let best = lo; for (let l = lo; l <= hi; l++) if (ac[l] * wt(l) > ac[best] * wt(best)) best = l;
  const a = ac[best - 1], c = ac[best], d = ac[best + 1], den = a - 2 * c + d, lag = best + (den !== 0 ? 0.5 * (a - d) / den : 0);
  const conf = c;
  const bpm = 60 * fr / lag, alt = [bpm / 2, bpm * 2].filter(v => v >= 60 && v <= 200).map(v => r(v, 1));
  return { status: "ok", bpm: r(bpm, 1), alternativeOctaveBpm: alt, prior: "log-normal around 120 BPM, sigma = 1 octave", confidence: conf >= 0.5 ? "moderate" : conf >= 0.25 ? "low-moderate" : "low", autocorrPeak: r(conf, 3),
    searchRangeBpm: [60, 200], note: "Onset-envelope autocorrelation. Half/double-tempo errors are common; accuracy about ±2 BPM when the beat is steady." };
}

async function analyze(chs, sr, opts) {
  opts = opts || {}; const prog = opts.onProgress || (() => {});
  if (!chs || !chs.length || !chs[0].length) throw new Error("No audio samples to analyse.");
  if (!(sr > 0)) throw new Error("Invalid sample rate.");
  const C = chs.length, N = chs[0].length;
  if (N / sr > MAX_SEC) throw new Error("Audio is longer than 30 minutes: analysis refused to protect memory.");
  const methods = [], warnings = [];
  const log = (name, params, t) => methods.push({ name, params, ms: Math.round(now() - t) });
  let t = now();

  // 1. Time-domain statistics
  const mix = new Float32Array(N), dc = new Float64Array(C), ss = new Float64Array(C);
  let peak = 0, nonFinite = 0, clipped = 0, clipRuns = 0;
  for (let c = 0; c < C; c++) {
    const d = chs[c]; let run = 0;
    for (let i = 0; i < N; i++) {
      let v = d[i]; if (!Number.isFinite(v)) { nonFinite++; v = 0; }
      const a = Math.abs(v); if (a > peak) peak = a;
      ss[c] += v * v; dc[c] += v; mix[i] += v / C;
      if (a >= 0.999) { clipped++; if (++run === 3) clipRuns++; } else run = 0;
    }
  }
  let sumSq = 0; for (let c = 0; c < C; c++) sumSq += ss[c];
  const rms = Math.sqrt(sumSq / (N * C)), win = Math.max(1, Math.round(0.4 * sr)), st = [];
  for (let s = 0; s + win <= N; s += win) { let q = 0; for (let i = s; i < s + win; i++) q += mix[i] * mix[i]; st.push(db(Math.sqrt(q / win))); }
  const loud = st.filter(x => x > -60);
  let zc = 0; for (let i = 1; i < N; i++) if ((mix[i - 1] < 0) !== (mix[i] < 0)) zc++;
  const time = { durationSec: r(N / sr, 3), samplesPerChannel: N, peakDbfs: peak > 0 ? r(db(peak)) : null, rmsDbfs: rms > 0 ? r(db(rms)) : null,
    crestFactorDb: peak > 0 && rms > 0 ? r(db(peak) - db(rms)) : null, dcOffset: Array.from(dc, x => r(x / N, 5)), clippedSamples: clipped, clippedRuns3plus: clipRuns,
    nonFiniteSamples: nonFinite, silentWindowRatio: st.length ? r(1 - loud.length / st.length, 3) : null,
    percentileRangeDb: loud.length >= 10 ? r(pct(loud, 0.95) - pct(loud, 0.10)) : null, zeroCrossingsPerSec: r(zc / (N / sr), 1) };
  if (nonFinite) warnings.push(nonFinite + " NaN/Infinity samples were treated as 0.");
  log("Time-domain statistics", { windowSec: 0.4, clipThreshold: 0.999 }, t); t = now();

  // 2. STFT features
  const FFT = 2048, H = FFT / 2, MAXF = 24000; let hop = 1024;
  if ((N - FFT) / hop + 1 > MAXF) hop = Math.ceil((N - FFT) / (MAXF - 1));
  const frames = N < FFT ? 1 : Math.floor((N - FFT) / hop) + 1, fft = makeFFT(FFT), hann = new Float64Array(FFT);
  for (let i = 0; i < FFT; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT);
  const norm = FFT / 4, freq = new Float64Array(H + 1), bandOf = new Int8Array(H + 1).fill(-1), pc = new Int8Array(H + 1).fill(-1);
  for (let k = 0; k <= H; k++) {
    freq[k] = k * sr / FFT;
    BANDS.forEach((b, i) => { if (freq[k] >= b[1] && freq[k] < b[2]) bandOf[k] = i; });
    if (freq[k] >= 65 && freq[k] <= 2100) pc[k] = ((Math.round(12 * Math.log2(freq[k] / 440) + 69) % 12) + 12) % 12;
  }
  const re = new Float64Array(FFT), im = new Float64Array(FFT), mag = new Float64Array(H + 1), prev = new Float64Array(H + 1);
  const avg = new Float64Array(H + 1), bandPow = new Float64Array(BANDS.length), chroma = new Float64Array(12), flux = new Float32Array(frames);
  let nF = 0, sCen = 0, sCen2 = 0, sRoll = 0, sFlat = 0, sFlux = 0;
  for (let f = 0; f < frames; f++) {
    const s = f * hop;
    for (let i = 0; i < FFT; i++) { re[i] = (s + i < N ? mix[s + i] : 0) * hann[i]; im[i] = 0; }
    fft(re, im);
    let tot = 0, wsum = 0, lg = 0, fl = 0;
    for (let k = 0; k <= H; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / norm, P = m * m; mag[k] = m; avg[k] += P;
      if (k >= 1) { tot += P; wsum += P * freq[k]; lg += Math.log(P + 1e-12); }
      fl += Math.max(0, m - prev[k]);
      if (bandOf[k] >= 0) bandPow[bandOf[k]] += P;
      if (pc[k] >= 0) chroma[pc[k]] += m;
    }
    flux[f] = f === 0 ? 0 : fl; sFlux += flux[f]; prev.set(mag);
    if (tot > 1e-10) {
      nF++; const cen = wsum / tot; sCen += cen; sCen2 += cen * cen;
      let cum = 0, k = 1; for (; k <= H; k++) { cum += mag[k] * mag[k]; if (cum >= 0.85 * tot) break; }
      sRoll += freq[Math.min(k, H)]; sFlat += Math.exp(lg / H) / (tot / H);
    }
    if ((f & 255) === 255 && opts.yield !== false) { prog(f / frames); await new Promise(res => setTimeout(res, 0)); }
  }
  let spectral, tempo, key;
  if (nF === 0) {
    spectral = { status: "no-signal", reason: "all analysed frames are silent" };
    tempo = { status: "no-result", reason: "no signal" }; key = { status: "no-result", reason: "no signal" };
    log("STFT (Hann, 2048)", { frames }, t);
  } else {
    for (let k = 0; k <= H; k++) avg[k] /= frames;
    const totBand = bandPow.reduce((a, b) => a + b, 0) || 1;
    let dk = 2; for (let k = 2; k < H; k++) if (avg[k] > avg[dk]) dk = k;
    const L = x => 10 * Math.log10(x + 1e-20), ya = L(avg[dk - 1]), yb = L(avg[dk]), yc = L(avg[dk + 1]), den = ya - 2 * yb + yc;
    const dom = (dk + (den !== 0 ? 0.5 * (ya - yc) / den : 0)) * sr / FFT;
    const sm = new Float64Array(H + 1);
    for (let k = 0; k <= H; k++) { let q = 0, c = 0; for (let j = Math.max(0, k - 4); j <= Math.min(H, k + 4); j++) { q += avg[j]; c++; } sm[k] = L(q / c); }
    const tail = Array.from(sm.subarray(Math.floor(H * 0.9), H)).sort((a, b) => a - b), floor = tail[tail.length >> 1];
    let smax = -Infinity; for (let k = 1; k <= H; k++) if (sm[k] > smax) smax = sm[k];
    let cut = 0; if (smax - floor < 20) cut = sr / 2; else for (let k = H; k > 0; k--) if (sm[k] > floor + 15) { cut = freq[k]; break; }
    const mean = sCen / nF, shortWindow = frames * hop < N * 0.9;
    spectral = { status: "ok", fftSize: FFT, hop, frames, framesWithSignal: nF, sampleCoverage: r(Math.min(1, frames * hop / N), 3),
      centroidHz: { mean: r(mean, 1), std: r(Math.sqrt(Math.max(0, sCen2 / nF - mean * mean)), 1) }, rolloff85Hz: r(sRoll / nF, 1),
      flatness: r(sFlat / nF, 4), meanFlux: r(sFlux / frames, 4), dominantHz: r(dom, 1), dominantLevelDb: r(yb, 1),
      bandSharePercent: BANDS.map((b, i) => ({ band: b[0], rangeHz: [b[1], b[2]], percent: r(100 * bandPow[i] / totBand, 2) })),
      noiseFloorTopBandsDb: r(floor, 1), bandwidthCutoffHz: r(cut, 0), lowpassBelowNyquist: cut < 0.92 * sr / 2,
      note: "Levels are dB relative to a full-scale sine. Cutoff = highest frequency 15 dB above the noise floor of the top 10% of bins; a low value suggests a lossy source or band-limited material, not proof of either. Unquantised float material with an extremely low noise floor can report a higher cutoff than its filter corner." };
    if (shortWindow) warnings.push("Long file: STFT hop enlarged to " + hop + " samples; tempo not run.");
    log("STFT (Hann 2048, hop " + hop + ") features", { frames, bands: BANDS.length }, t); t = now();
    tempo = hop === 1024 ? estimateTempo(flux, sr / hop) : { status: "not-run", reason: "file too long for fixed-hop onset analysis" };
    log("Tempo: onset-flux autocorrelation", { searchBpm: "60–200" }, t); t = now();
    key = estimateKey(Array.from(chroma));
    log("Key: chroma + Krumhansl profiles", { rangeHz: "65–2100" }, t);
  }
  t = now();

  // 3. Stereo
  let stereo = { status: "not-applicable", reason: "mono file" };
  if (C >= 2) {
    const A = chs[0], B = chs[1]; let lr = 0, ll = 0, rr = 0, mm = 0, sd = 0;
    for (let i = 0; i < N; i++) { const l = A[i] || 0, q = B[i] || 0; lr += l * q; ll += l * l; rr += q * q; const mid = (l + q) / 2, side = (l - q) / 2; mm += mid * mid; sd += side * side; }
    stereo = { status: "ok", correlation: r(lr / (Math.sqrt(ll * rr) || 1), 3), leftRightRmsDiffDb: r(db(Math.sqrt(ll / N)) - db(Math.sqrt(rr / N))),
      sideToMidDb: r(db(Math.sqrt(sd / N)) - db(Math.sqrt(mm / N))), monoFoldLossDb: r(db(Math.sqrt(mm / N)) - db((Math.sqrt(ll / N) + Math.sqrt(rr / N)) / 2)),
      channelsAnalysed: 2, note: C > 2 ? "Only the first two channels were used for stereo statistics." : undefined };
    log("Stereo statistics", { pair: "ch0/ch1" }, t);
  }

  const models = ["Vocal / instrumental classification", "Instrument recognition", "Musical-structure segmentation", "Neural enhancement / separation"].map(n => ({
    name: n, status: "unavailable", reason: "No model is installed in this build. Nothing was run and no result is shown." }));
  return { engine: VERSION, sampleRate: sr, channels: C, time, spectral, tempo, key, stereo, methods, models, warnings,
    limitations: ["Statistics describe the decoded signal, not its origin. This tool does not detect AI vs human creation.",
      "Tempo and key are heuristic estimates with the stated confidence; verify by ear.", "Loudness is not EBU R128; percentileRangeDb is a simple 95th−10th percentile of 0.4 s RMS windows."] };
}
return { VERSION, parseMetadata, analyze, MAX_BYTES };
});
