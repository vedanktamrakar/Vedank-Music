import {createEngine} from './engine.js';
import {setupABPlayer} from './ab-player.js';
import {revokeUrl} from './cleanup.js';
import {estimatePitchYIN} from './pitch.js';

const $=id=>document.getElementById(id);
const engine=createEngine();
const ab=setupABPlayer($('hzBeforeAB'),$('hzAfterAB'));
let cancelled=false,loadGeneration=0,activeUrls=[],originalFileUrl=null,afterWavUrl=null,lastSettings=null;

function status(message,bad=false){$('hzStatus').textContent=message;$('hzStatus').classList.toggle('is-error',bad);}
function renderStatus(message,bad=false){$('hzRenderStatus').textContent=message;$('hzRenderStatus').classList.toggle('is-error',bad);}
function fmtTime(s){if(!Number.isFinite(s))return '—';const mm=Math.floor(s/60),ss=String(Math.floor(s%60)).padStart(2,'0');return `${mm}:${ss}`;}
function safeName(name){return (name||'track').replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_.-]+/gu,'_').slice(0,72)||'track';}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>revokeUrl(url),30000);}
function metric(label,value){const el=document.createElement('div');el.className='hz-metric';const s=document.createElement('span'),v=document.createElement('strong');s.textContent=label;v.textContent=value;el.append(s,v);return el;}
function showMetrics(rootId,m){const root=$(rootId);root.replaceChildren();const rows=[['Duration',fmtTime(m.duration)],['Sample rate',`${Number(m.sampleRate).toLocaleString()} Hz`],['Channels',String(m.channels)],['Peak',`${m.peakDb.toFixed(2)} dBFS`],['RMS',`${m.rmsDb.toFixed(2)} dBFS`],['Crest factor',`${m.crestDb.toFixed(2)} dB`],['Clipped samples',`${m.clipped.toLocaleString()} (${m.clippedPercent.toFixed(4)}%)`],['DC offset',m.dcOffset.toFixed(6)],['Tempo estimate',m.bpm?`${m.bpm} BPM`:'Unclear'],['Key estimate',m.key||'Unknown'],['Estimated F0',m.f0?.note||'Unclear'],['L/R correlation',m.stereoCorrelation==null?'Not measured':m.stereoCorrelation.toFixed(3)]];rows.forEach(([a,b])=>root.append(metric(a,b)));}
function drawWave(canvas,audio){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,d=audio.channels[0],step=Math.max(1,Math.floor(d.length/w));
  ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(137,169,220,.22)';ctx.lineWidth=1;
  for(let y=0;y<5;y++){ctx.beginPath();ctx.moveTo(0,y*h/4);ctx.lineTo(w,y*h/4);ctx.stroke();}
  ctx.strokeStyle='#75a9ff';ctx.lineWidth=1.25;ctx.beginPath();
  for(let x=0;x<w;x++){let lo=1,hi=-1;const s=x*step,e=Math.min(d.length,s+step);for(let i=s;i<e;i++){if(d[i]<lo)lo=d[i];if(d[i]>hi)hi=d[i];}ctx.moveTo(x,(1-hi)*h/2);ctx.lineTo(x,(1-lo)*h/2);}ctx.stroke();
}
function drawSpectrum(canvas,points){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(137,169,220,.2)';for(let y=1;y<5;y++){ctx.beginPath();ctx.moveTo(0,y*h/5);ctx.lineTo(w,y*h/5);ctx.stroke();}
  if(!points?.length)return;const max=Math.max(...points.map(p=>p.magnitude),1e-9);ctx.beginPath();ctx.strokeStyle='#e9c36c';ctx.lineWidth=2;
  for(let i=0;i<points.length;i++){const x=i/(points.length-1)*w,y=h-(points[i].magnitude/max)*h*.9;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
}
function readSettings(){const n=id=>Number($(id).value);return{centerFocus:$('hzCenterFocus').checked,expression:n('hzExpression'),deEss:n('hzDeEss'),breath:n('hzBreath'),breathThreshold:n('hzBreathThreshold'),breathMax:n('hzBreathMax'),pitch:n('hzPitch'),tempo:n('hzTempo'),vibrato:n('hzVibrato'),vibratoRate:n('hzVibratoRate'),timing:n('hzTiming'),comp:n('hzComp'),gate:n('hzGate'),transient:n('hzTransient'),gain:n('hzGain'),low:n('hzLow'),mid:n('hzMid'),high:n('hzHigh'),warm:n('hzWarm'),reverb:n('hzReverb'),width:n('hzWidth')};}
function updateLabels(){const s=readSettings();const values={hzExpressionOut:`${s.expression}%`,hzDeEssOut:`${s.deEss}%`,hzBreathOut:s.breath?`${s.breath}%`:'Off',hzBreathThresholdOut:`${s.breathThreshold} dB`,hzBreathMaxOut:String(s.breathMax),hzPitchOut:`${s.pitch.toFixed(1)} semitones`,hzTempoOut:`${s.tempo.toFixed(1)}%`,hzVibratoOut:`${s.vibrato}%`,hzVibratoRateOut:`${s.vibratoRate.toFixed(1)} Hz`,hzTimingOut:`${s.timing}%`,hzCompOut:s.comp?`${s.comp}%`:'Off',hzGateOut:s.gate?`${s.gate}%`:'Off',hzTransientOut:`${s.transient}%`,hzGainOut:`${s.gain.toFixed(1)} dB`,hzLowOut:`${s.low.toFixed(1)} dB`,hzMidOut:`${s.mid.toFixed(1)} dB`,hzHighOut:`${s.high.toFixed(1)} dB`,hzWarmOut:`${s.warm}%`,hzReverbOut:`${s.reverb}%`,hzWidthOut:`${s.width}%`};for(const [id,value]of Object.entries(values))$(id).textContent=value;}
function cleanupRendered(){revokeUrl(afterWavUrl);afterWavUrl=null;engine.session.rendered=null;engine.session.renderMetrics=null;ab.pause();$('hzAfterAB').removeAttribute('src');$('hzAfterAB').load();$('hzAfterPanel').hidden=true;$('hzExportWav').disabled=true;$('hzExportMp3').disabled=true;}
function clearEverything(){cancelled=true;loadGeneration++;engine.clear();revokeUrl(originalFileUrl);originalFileUrl=null;cleanupRendered();activeUrls.forEach(revokeUrl);activeUrls=[];$('hzFile').value='';$('hzFileInfo').textContent='';$('hzOriginalPlayer').removeAttribute('src');$('hzOriginalPlayer').load();$('hzBeforeAB').removeAttribute('src');$('hzBeforeAB').load();$('hzAnalysisPanel').hidden=true;$('hzSeparationPanel').hidden=true;$('hzControlsPanel').hidden=true;$('hzProgressBar').style.width='0%';$('hzRender').disabled=true;$('hzCancel').disabled=true;$('hzReport').disabled=true;status('Choose a song to begin.');renderStatus('Adjust controls, then render a copy. The original stays unchanged.');}

$('hzFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  clearEverything();const ticket=loadGeneration;$('hzFile').value='';status('Reading and decoding your audio…');
  try{
    const result=await engine.load(file,p=>{if(ticket===loadGeneration&&p<35)status(`Analysing audio… ${p}%`);});
    if(ticket!==loadGeneration)return;
    const audio=result.audio,m=result.metrics;
    originalFileUrl=URL.createObjectURL(file);$('hzOriginalPlayer').src=originalFileUrl;$('hzBeforeAB').src=originalFileUrl;
    m.stereoCorrelation=measureCorrelation(audio.channels);
    const f0Samples=audio.channels[0].subarray(0,Math.min(audio.channels[0].length,4096));
    m.f0=estimatePitchYIN(f0Samples,audio.sampleRate);
    $('hzFileInfo').textContent=`${file.name} · ${(file.size/1048576).toFixed(2)} MB · ${fmtTime(audio.duration)} · ${audio.sampleRate.toLocaleString()} Hz · ${audio.numberOfChannels===1?'Mono':audio.numberOfChannels+' channels'}`;
    if(audio.numberOfChannels>2)status('Audio decoded, but this version supports mono or stereo only. Export a stereo mix and try again.',true);
    else if(audio.duration<120||audio.duration>300)status('Audio loaded. Recommended track length is 2–5 minutes; this file is outside that target range.');else status('Audio loaded. Analysis is ready.');
    drawWave($('hzWaveBefore'),audio);drawSpectrum($('hzSpectrum'),m.spectrum);showMetrics('hzMetrics',m);
    $('hzAnalysisNotes').textContent=`Peak and RMS are measured from a mono analysis signal. Tempo (${m.bpm??'unclear'}) and key (${m.key}) are rough estimates, not guaranteed musical transcription. ${m.note}`;
    $('hzAnalysisPanel').hidden=false;$('hzSeparationPanel').hidden=false;$('hzControlsPanel').hidden=false;$('hzRender').disabled=false;$('hzReport').disabled=false;
  }catch(error){if(ticket===loadGeneration){status(error?.message||'Could not open this audio file.',true);engine.clear();}}
});

function measureCorrelation(channels){if(channels.length<2)return null;const a=channels[0],b=channels[1],n=Math.min(a.length,b.length);let s=0,sa=0,sb=0;const step=Math.max(1,Math.floor(n/200000));for(let i=0;i<n;i+=step){s+=a[i]*b[i];sa+=a[i]*a[i];sb+=b[i]*b[i];}return s/Math.sqrt(Math.max(1e-12,sa*sb));}

$('hzRender').addEventListener('click',async()=>{
  cancelled=false;const ticket=loadGeneration;const settings=readSettings();lastSettings=settings;$('hzRender').disabled=true;$('hzCancel').disabled=false;renderStatus('Rendering…');$('hzProgressBar').style.width='0%';
  try{
    const rendered=await engine.render(settings,p=>{if(ticket===loadGeneration){$('hzProgressBar').style.width=`${p}%`;renderStatus(typeof p==='object'?p.message||`Rendering ${p.percent}%`:`Rendering ${p}%`);}},()=>cancelled||ticket!==loadGeneration);
    if(ticket!==loadGeneration)return;
    const wav=engine.wav(16);afterWavUrl=URL.createObjectURL(wav);$('hzAfterAB').src=afterWavUrl;$('hzAfterPanel').hidden=false;
    const metrics=await engine.session.metrics; // reuse or recompute if needed
    showMetrics('hzRenderMetrics',{...metrics,duration:rendered.duration,sampleRate:rendered.sampleRate,channels:rendered.numberOfChannels,peakDb:20*Math.log10(Math.max(...rendered.channels.map(ch=>Math.max(...ch.map(Math.abs))))||1e-9),note:''});
    ab.matchLoudness(metrics.rms,metrics.rms);
    $('hzExportWav').disabled=false;$('hzExportMp3').disabled=false;renderStatus('Render complete. Preview and export below.');$('hzProgressBar').style.width='100%';
  }catch(error){if(!(cancelled&&error?.name==='AbortError'))renderStatus(error?.message||'Render failed.',true);}
  finally{if(ticket===loadGeneration){$('hzRender').disabled=false;$('hzCancel').disabled=true;}}
});

$('hzCancel').addEventListener('click',()=>{cancelled=true;$('hzCancel').disabled=true;renderStatus('Cancel requested. The current short render block will finish before stopping.');});
$('hzReset').addEventListener('click',()=>{document.querySelectorAll('#hzControlsPanel input[type=range]').forEach(input=>input.value=input.defaultValue);$('hzCenterFocus').checked=false;updateLabels();cleanupRendered();renderStatus('Controls reset. The original audio remains loaded.');});
$('hzClear').addEventListener('click',clearEverything);
$('hzPlayBefore').addEventListener('click',()=>ab.playBefore());$('hzPlayAfter').addEventListener('click',()=>ab.playAfter());$('hzPauseAB').addEventListener('click',()=>ab.pause());
$('hzExportWav').addEventListener('click',()=>{try{download(engine.wav(Number($('hzWavBits').value)),`${safeName(engine.session.file?.name)}_humanized_${$('hzWavBits').value}bit.wav`);}catch(e){renderStatus(e.message,true);}});
$('hzExportMp3').addEventListener('click',async()=>{
  const ticket=loadGeneration;renderStatus('Starting MP3 export…');
  try{const blob=await engine.mp3(Number($('hzMp3Rate').value),p=>{if(ticket===loadGeneration)renderStatus(`MP3 encoding ${p}%…`);});if(ticket!==loadGeneration)return;download(blob,`${safeName(engine.session.file?.name)}_humanized_${$('hzMp3Rate').value}kbps.mp3`);renderStatus('MP3 export complete.');}
  catch(e){if(ticket===loadGeneration)renderStatus(e.message||'MP3 export failed.',true);}
});
$('hzReport').addEventListener('click',()=>{
  const m=engine.session.metrics,r=engine.session.renderMetrics,s=lastSettings||readSettings();
  const text=`Vedank Music Humanizer report\nFile: ${engine.session.file?.name||'unknown'}\nOriginal: ${fmtTime(m?.duration)} @ ${m?.sampleRate} Hz, peak ${m?.peakDb?.toFixed(1)} dBFS, tempo ~${m?.bpm||'?'} BPM, key ${m?.key||'?'}\nRendered: ${fmtTime(r?.duration||0)}, settings pitch ${s.pitch} st, tempo ${s.tempo}%, vibrato ${s.vibrato}%\n`;
  download(new Blob([text],{type:'text/plain'}),'humanizer-report.txt');
});
document.querySelectorAll('#hzControlsPanel input[type=range]').forEach(el=>el.addEventListener('input',updateLabels));
window.addEventListener('hz-auth-change',event=>{if(!event.detail?.signedIn)clearEverything();});
window.addEventListener('pagehide',clearEverything);
updateLabels();
status('Choose a song to begin.');
