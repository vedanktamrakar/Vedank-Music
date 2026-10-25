// Run: node test-analysis.js   (needs Node 18+; ffmpeg optional for MP3/FLAC cases)
const fs = require("fs"), cp = require("child_process"), crypto = require("crypto"), os = require("os"), path = require("path");
const A = require("./ai-analysis.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aal-"));
let pass = 0, fail = 0;
const ok = (c, name, extra) => { (c ? pass++ : fail++); console.log((c ? "PASS " : "FAIL ") + name + (extra !== undefined ? "  -> " + extra : "")); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sha = buf => crypto.createHash("sha256").update(Buffer.from(buf)).digest("hex");
const ab = file => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };

function writeWav(file, chs, sr, bits = 16) {
  const C = chs.length, N = chs[0].length, bps = bits / 8, data = N * C * bps, buf = Buffer.alloc(44 + data);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + data, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(bits === 32 ? 3 : 1, 20); buf.writeUInt16LE(C, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * C * bps, 28);
  buf.writeUInt16LE(C * bps, 32); buf.writeUInt16LE(bits, 34); buf.write("data", 36); buf.writeUInt32LE(data, 40);
  let o = 44;
  for (let i = 0; i < N; i++) for (let c = 0; c < C; c++) {
    const v = Math.max(-1, Math.min(1, chs[c][i]));
    if (bits === 32) { buf.writeFloatLE(v, o); o += 4; } else { buf.writeInt16LE(Math.round(v * 32767), o); o += 2; }
  }
  fs.writeFileSync(file, buf);
}
function readWav(file) { // test-only reader for 16-bit PCM and 32-bit float
  const b = fs.readFileSync(file); let p = 12, fmt, data;
  while (p + 8 <= b.length) { const id = b.toString("latin1", p, p + 4), sz = b.readUInt32LE(p + 4); if (id === "fmt ") fmt = { tag: b.readUInt16LE(p + 8) === 0xFFFE ? b.readUInt16LE(p + 32) : b.readUInt16LE(p + 8), C: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) }; if (id === "data") { data = b.subarray(p + 8, p + 8 + sz); break; } p += 8 + sz + (sz & 1); }
  const bps = fmt.bits / 8, N = data.length / (fmt.C * bps), chs = Array.from({ length: fmt.C }, () => new Float32Array(N));
  for (let i = 0; i < N; i++) for (let c = 0; c < fmt.C; c++) { const o = (i * fmt.C + c) * bps; chs[c][i] = fmt.tag === 3 ? data.readFloatLE(o) : data.readInt16LE(o) / 32768; }
  return { chs, sr: fmt.sr };
}
const sine = (f, a, sr, sec, ph = 0) => Float32Array.from({ length: sr * sec }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr + ph));
const add = (...xs) => xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0));
const sh = cmd => { try { cp.execSync(cmd, { stdio: "pipe" }); return true; } catch (e) { return false; } };

(async () => {
  const SR = 44100;
  // 1. Known sine: 440 Hz, amplitude 0.5, stereo, 16-bit WAV
  const f1 = path.join(tmp, "sine440.wav"); writeWav(f1, [sine(440, 0.5, SR, 3), sine(440, 0.5, SR, 3)], SR, 16);
  const raw1 = ab(f1), h1 = sha(raw1);
  const m1 = A.parseMetadata(raw1);
  ok(m1.container === "wav" && m1.bitDepth === 16 && m1.channels === 2 && m1.sampleRate === SR && near(m1.durationSec, 3, 0.001), "WAV header parsed from bytes (not guessed)", JSON.stringify({ b: m1.bitDepth, c: m1.channels, sr: m1.sampleRate, d: m1.durationSec }));
  const w1 = readWav(f1), r1 = await A.analyze(w1.chs, w1.sr, { yield: false });
  ok(near(r1.spectral.dominantHz, 440, 1.5), "FFT dominant frequency = 440 Hz", r1.spectral.dominantHz);
  ok(near(r1.time.peakDbfs, -6.02, 0.05), "Peak = -6.02 dBFS", r1.time.peakDbfs);
  ok(near(r1.time.rmsDbfs, -9.03, 0.05), "RMS = -9.03 dBFS", r1.time.rmsDbfs);
  ok(near(r1.time.crestFactorDb, 3.01, 0.06), "Crest factor = 3.01 dB", r1.time.crestFactorDb);
  ok(r1.time.clippedSamples === 0, "No clipping reported on clean sine");
  ok(near(r1.stereo.correlation, 1, 0.001) && near(r1.stereo.sideToMidDb, -240, 200) , "Identical L/R -> correlation 1", r1.stereo.correlation);
  ok(r1.tempo.status !== "ok", "Pure tone: tempo NOT reported as success", r1.tempo.status);
  ok(r1.models.every(m => m.status === "unavailable"), "Models labelled unavailable, none faked");
  ok(sha(raw1) === h1 && sha(ab(f1)) === h1, "Original bytes unchanged after parse + analysis (SHA-256)");

  // 2. Different input -> different result (analysis is computed from input)
  const f2 = path.join(tmp, "sine1000.wav"); writeWav(f2, [sine(1000, 0.25, SR, 3)], SR, 16);
  const w2 = readWav(f2), r2 = await A.analyze(w2.chs, w2.sr, { yield: false });
  ok(near(r2.spectral.dominantHz, 1000, 2) && near(r2.time.peakDbfs, -12.04, 0.05) && r2.stereo.status === "not-applicable", "1 kHz mono file gives different, correct results", r2.spectral.dominantHz + " Hz / " + r2.time.peakDbfs + " dBFS");

  // 3. Clipping
  const f3 = path.join(tmp, "clip.wav"); const cl = sine(200, 2.0, SR, 2); writeWav(f3, [cl], SR, 16);
  const w3 = readWav(f3), r3 = await A.analyze(w3.chs, w3.sr, { yield: false });
  ok(r3.time.clippedSamples > 1000 && r3.time.clippedRuns3plus > 10, "Clipped signal detected", r3.time.clippedSamples + " samples");

  // 4. Silence
  const f4 = path.join(tmp, "silence.wav"); writeWav(f4, [new Float32Array(SR * 3)], SR, 16);
  const r4 = await A.analyze(readWav(f4).chs, SR, { yield: false });
  ok(r4.spectral.status === "no-signal" && r4.tempo.status === "no-result" && r4.key.status === "no-result" && r4.time.peakDbfs === null, "Silence: no fabricated tempo/key/levels");

  // 5. Tempo: 120 BPM noise-burst click track
  const click = new Float32Array(SR * 20); let seed = 1; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let beat = 0; beat * 0.5 < 20; beat++) { const s = Math.round(beat * 0.5 * SR); for (let i = 0; i < 900 && s + i < click.length; i++) click[s + i] = 0.8 * rnd() * Math.exp(-i / 150); }
  const r5 = await A.analyze([click], SR, { yield: false });
  ok(r5.tempo.status === "ok" && near(r5.tempo.bpm, 120, 3), "Tempo of 120 BPM click track", JSON.stringify({ bpm: r5.tempo.bpm, conf: r5.tempo.confidence }));

  // 6. Key: C major triad (C4 E4 G4) with harmonics
  const tri = [261.63, 329.63, 392.0].map(f => add(sine(f, 0.2, SR, 6), sine(2 * f, 0.08, SR, 6), sine(3 * f, 0.04, SR, 6)));
  const r6 = await A.analyze([add(...tri)], SR, { yield: false });
  ok(r6.key.status === "ok" && /^C major$/.test(r6.key.key), "Key of C-major triad", JSON.stringify({ key: r6.key.key, conf: r6.key.confidence, corr: r6.key.correlation }));

  // 7. Bandwidth cutoff: white noise through ffmpeg lowpass 8 kHz
  if (sh("ffmpeg -version")) {
    // brick-wall 8 kHz low-pass built in Node (513-tap Blackman-windowed sinc, stored as 16-bit like a real file) so the test does not depend on ffmpeg filter slopes
    { const n = SR * 4, x = Float32Array.from({ length: n }, () => 0.3 * rnd()), M = 512, h = new Float64Array(M + 1), fc = 8000 / SR;
      for (let i = 0; i <= M; i++) { const k = i - M / 2; h[i] = (k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k)) * (0.42 - 0.5 * Math.cos(2 * Math.PI * i / M) + 0.08 * Math.cos(4 * Math.PI * i / M)); }
      const y = new Float32Array(n); for (let i = M; i < n; i++) { let q = 0; for (let j = 0; j <= M; j++) q += h[j] * x[i - j]; y[i] = q; }
      const f7 = path.join(tmp, "brick8k.wav"); writeWav(f7, [y.subarray(M)], SR, 16); const r7 = await A.analyze(readWav(f7).chs, SR, { yield: false }); ok(r7.spectral.bandwidthCutoffHz > 7500 && r7.spectral.bandwidthCutoffHz < 9500 && r7.spectral.lowpassBelowNyquist, "Cutoff of 8 kHz brick-wall noise", r7.spectral.bandwidthCutoffHz + " Hz"); }
    // 7b. Full-band noise vs the same noise after a 128 kbps MP3 round-trip (transcode signature)
    const fw = path.join(tmp, "white.wav"), fm = path.join(tmp, "white.mp3"), fd = path.join(tmp, "white_dec.wav");
    if (sh(`ffmpeg -y -f lavfi -i "anoisesrc=d=5:c=white:r=44100:a=0.3" -ac 2 -c:a pcm_s16le ${fw}`) && sh(`ffmpeg -y -i ${fw} -c:a libmp3lame -b:a 128k ${fm}`) && sh(`ffmpeg -y -i ${fm} -ac 1 -c:a pcm_s16le ${fd}`)) {
      const ra = await A.analyze([readWav(fw).chs[0]], SR, { yield: false }), rb = await A.analyze(readWav(fd).chs, SR, { yield: false });
      ok(!ra.spectral.lowpassBelowNyquist && ra.spectral.bandwidthCutoffHz > 20000, "Full-band WAV noise: no lowpass detected", ra.spectral.bandwidthCutoffHz + " Hz");
      ok(rb.spectral.lowpassBelowNyquist && rb.spectral.bandwidthCutoffHz > 14000 && rb.spectral.bandwidthCutoffHz < 20000, "Same noise after stereo 128k MP3: lowpass signature found", rb.spectral.bandwidthCutoffHz + " Hz");
    }
    // 8. MP3 (valid file produced by ffmpeg/libmp3lame) - metadata + analysis of decoded audio
    const f8 = path.join(tmp, "tone.mp3");
    if (sh(`ffmpeg -y -i ${f1} -c:a libmp3lame -b:a 128k -metadata title="Test Tone" -metadata artist="Vedank" ${f8}`)) {
      const raw8 = ab(f8), h8 = sha(raw8), m8 = A.parseMetadata(raw8);
      ok(m8.container === "mp3" && m8.sampleRate === SR && m8.channels === 2 && m8.bitrateKbps === 128 && m8.lossy === true && m8.bitDepth === null, "MP3 header parsed", JSON.stringify({ codec: m8.codec, kbps: m8.bitrateKbps, vbr: m8.vbr, enc: m8.encoder, dur: m8.durationSec, basis: m8.durationBasis }));
      ok(m8.tags.TIT2 === "Test Tone" && m8.tags.TPE1 === "Vedank", "ID3 tags read from bytes", JSON.stringify({ TIT2: m8.tags.TIT2, TPE1: m8.tags.TPE1 }));
      ok(near(m8.durationSec, 3.0, 0.15), "MP3 duration close to 3 s", m8.durationSec);
      const d8 = path.join(tmp, "tone_dec.wav");
      if (sh(`ffmpeg -y -i ${f8} -c:a pcm_f32le ${d8}`)) { const w8 = readWav(d8), r8 = await A.analyze(w8.chs, w8.sr, { yield: false }); ok(near(r8.spectral.dominantHz, 440, 2), "Decoded-MP3 analysis finds 440 Hz", r8.spectral.dominantHz); }
      ok(sha(ab(f8)) === h8, "MP3 original unchanged (SHA-256)");
    } else console.log("SKIP MP3 tests: ffmpeg has no libmp3lame");
    // 9. FLAC
    const f9 = path.join(tmp, "tone.flac");
    if (sh(`ffmpeg -y -i ${f1} -c:a flac ${f9}`)) { const m9 = A.parseMetadata(ab(f9)); ok(m9.container === "flac" && m9.bitDepth === 16 && m9.sampleRate === SR && m9.channels === 2 && near(m9.durationSec, 3, 0.01), "FLAC STREAMINFO parsed", JSON.stringify({ b: m9.bitDepth, d: m9.durationSec })); }
  } else console.log("SKIP ffmpeg-based tests (ffmpeg not installed)");

  // 10. Unsupported / broken inputs
  const txt = Buffer.from("this is definitely not audio, just text data...."); const mt = A.parseMetadata(txt.buffer.slice(txt.byteOffset, txt.byteOffset + txt.length));
  ok(mt.supported === false && /Unrecognised audio container/.test(mt.error), "Text file rejected with clear error", mt.error.slice(0, 60));
  const tiny = A.parseMetadata(new ArrayBuffer(5)); ok(!!tiny.error, "Tiny file rejected", tiny.error);
  const trunc = A.parseMetadata(raw1.slice(0, 1000)); ok(trunc.container === "wav" && trunc.notes.some(n => /truncated/.test(n)), "Truncated WAV flagged", trunc.notes[0]);
  let threw = false; try { await A.analyze([new Float32Array(0)], 44100); } catch (e) { threw = true; } ok(threw, "Empty sample array throws instead of returning a result");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
