const MAX_BYTES = 100 * 1024 * 1024;
const MIN_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 10 * 60;

export async function decodeAudioFile(file) {
  if (!file) throw new Error('Choose an audio file first.');
  if (file.size > MAX_BYTES) throw new Error('This file is larger than 100 MB. Use a smaller audio file.');
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const allowed = new Set(['wav','mp3','m4a','aac','flac','ogg','opus','aiff','aif','weba']);
  if (!(file.type.startsWith('audio/') || allowed.has(ext))) {
    throw new Error('This does not look like a supported audio file.');
  }
  const raw = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser does not support Web Audio.');
  const context = new AudioContextClass({sampleRate: 44100});
  try {
    const decoded = await context.decodeAudioData(raw);
    if (decoded.duration < MIN_DURATION_SECONDS || decoded.duration > MAX_DURATION_SECONDS) {
      throw new Error('Song length must be between 30 seconds and 10 minutes. The recommended range is 2–5 minutes.');
    }
    if (!Number.isFinite(decoded.duration) || decoded.length < 1) throw new Error('The browser could not read this audio.');
    if (decoded.numberOfChannels > 2) throw new Error('This version supports mono or stereo files only. Please export a stereo mix and try again.');
    const channels = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    return {
      sampleRate: decoded.sampleRate,
      length: decoded.length,
      duration: decoded.duration,
      numberOfChannels: decoded.numberOfChannels,
      channels
    };
  } finally {
    await context.close().catch(() => {});
  }
}

export function makeAudioBuffer(context, channelArrays, sampleRate) {
  const length = channelArrays[0]?.length || 0;
  const buffer = context.createBuffer(channelArrays.length, length, sampleRate);
  channelArrays.forEach((data, index) => buffer.copyToChannel(data, index));
  return buffer;
}
