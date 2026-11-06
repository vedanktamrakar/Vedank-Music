import {splitMidSide,combineMidSide,widthProcess} from './separation.js';
import {varispeedRate} from './pitch.js';
import {processBreathGaps} from './breath-gaps.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mappedSlice(sourceChannels,sr,outStart,outFrames,rate){
  const out=sourceChannels.map(()=>new Float32Array(outFrames));
  for(let c=0;c<sourceChannels.length;c++){
    const src=sourceChannels[c];
    for(let j=0;j<outFrames;j++){
      const pos=(outStart+j)*rate,idx=Math.floor(pos),frac=pos-idx;
      const a=src[clamp(idx,0,src.length-1)]||0,b=src[clamp(idx+1,0,src.length-1)]||0;
      out[c][j]=a+(b-a)*frac;
    }
  }
  return out;
}
function applyGateAndTransient(channels,sr,gatePct,transientPct,expressionPct){
  const gate=gatePct/100,transient=transientPct/100,expression=expressionPct/100;
  if(!gate&&!transient&&!expression)return;
  const attack=Math.exp(-1/(sr*.006)),release=Math.exp(-1/(sr*.09));
  for(const d of channels){let env=0,slow=0;const slowCoeff=Math.exp(-1/(sr*.14));
    for(let i=0;i<d.length;i++){
      const x=d[i],a=Math.abs(x),c=a>env?attack:release;env=c*env+(1-c)*a;slow=slowCoeff*slow+(1-slowCoeff)*a;
      let g=1;
      if(gate>0){const th=.004+gate*.05;if(env<th)g=Math.pow(env/Math.max(th,1e-5),.65+gate*1.8);}
      let v=x*g;
      if(transient>0){const transientPart=a-slow;v+=Math.sign(x)*transientPart*transient*.75;}
      if(expression>0){const target=.12+expression*.13;const level=slow;const leveling=clamp(target/Math.max(.03,level),.88,1.22);v*=1+(leveling-1)*expression*.55;}
      d[i]=v;
    }
  }
}
function makeImpulse(ctx,seconds=1.2){
  const len=Math.floor(ctx.sampleRate*seconds),ir=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){const d=ir.getChannelData(c);let seed=1234+c;for(let i=0;i<len;i++){seed=(seed*16807)%2147483647;const noise=(seed/2147483647)*2-1;d[i]=noise*Math.pow(1-i/len,3.2)*.14;}}
  return ir;
}
async function renderSegment(channels,sr,settings){
  const frames=channels[0].length,ctx=new OfflineAudioContext(channels.length,frames,sr),input=ctx.createBuffer(channels.length,frames,sr);
  channels.forEach((data,c)=>input.copyToChannel(data,c));
  const source=ctx.createBufferSource();source.buffer=input;
  const low=ctx.createBiquadFilter();low.type='lowshelf';low.frequency.value=140;low.gain.value=settings.low;
  const mid=ctx.createBiquadFilter();mid.type='peaking';mid.frequency.value=2600;mid.Q.value=.85;mid.gain.value=settings.mid;
  const high=ctx.createBiquadFilter();high.type='highshelf';high.frequency.value=7600;high.gain.value=settings.high-settings.deEss*.08;
  source.connect(low);low.connect(mid);mid.connect(high);let last=high;
  if(settings.comp>0){const comp=ctx.createDynamicsCompressor();comp.threshold.value=-8-settings.comp*.28;comp.knee.value=8;comp.ratio.value=1+settings.comp*.08;comp.attack.value=.008;comp.release.value=.16;last.connect(comp);last=comp;}
  if(settings.warm>0){const sat=ctx.createWaveShaper(),curve=new Float32Array(2048),drive=1+settings.warm/8;for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1;curve[i]=Math.tanh(drive*x)/Math.tanh(drive);}sat.curve=curve;sat.oversample='2x';last.connect(sat);last=sat;}
  if(settings.vibrato>0||settings.timing>0){
    const delay=ctx.createDelay(.08);delay.delayTime.value=.012;const lfo=ctx.createOscillator(),depth=ctx.createGain();
    const vibratoDepth=settings.vibrato/100*.0035,timingDepth=settings.timing/100*.0012;
    lfo.type='sine';lfo.frequency.value=settings.vibrato>0?settings.vibratoRate:.35;depth.gain.value=vibratoDepth+timingDepth;lfo.connect(depth);depth.connect(delay.delayTime);lfo.start();last.connect(delay);last=delay;
  }
  const out=ctx.createGain();out.gain.value=Math.pow(10,settings.gain/20)*(1+settings.expression/100*.10);
  if(settings.reverb>0){const dry=ctx.createGain(),wet=ctx.createGain(),conv=ctx.createConvolver();conv.buffer=makeImpulse(ctx);dry.gain.value=1-settings.reverb/100*.45;wet.gain.value=settings.reverb/100*.7;last.connect(dry);last.connect(conv);conv.connect(wet);dry.connect(out);wet.connect(out);}else last.connect(out);
  out.connect(ctx.destination);source.start(0);
  return ctx.startRendering();
}

export async function renderHumanizer(audio,settings,onProgress=()=>{},isCancelled=()=>false){
  const sr=audio.sampleRate,rate=varispeedRate(settings.pitch,settings.tempo);
  const outLength=Math.max(1,Math.ceil(audio.length/rate)),chunkFrames=sr*12,preFrames=Math.round(sr*1.5),tailFrames=Math.round(sr*1.8);
  let baseChannels=audio.channels.map(a=>a);
  let side=null,centerMode=!!settings.centerFocus;
  if(centerMode&&audio.channels.length>=2){const split=splitMidSide(audio.channels[0],audio.channels[1]);baseChannels=[split.mid];side=split.side;}
  let gapMeta={gaps:[],phraseCount:0};
  if(settings.breath>0){
    if(!centerMode || audio.channels.length<2){
      const skippedReason=audio.channels.length<2?'Breath gaps skipped: a mono mix has no separate centre layer.':'Breath gaps skipped: enable centre focus first.';
      gapMeta={gaps:[],phraseCount:0,skippedReason};
      onProgress({stage:'breath',message:skippedReason});
    } else {
      const gaps=processBreathGaps(baseChannels,sr,settings.breath,{thresholdDb:settings.breathThreshold,maxGaps:settings.breathMax,varispeedRate:rate});
      baseChannels=gaps.channels;gapMeta={gaps:gaps.gaps,phraseCount:gaps.phraseCount};
    }
  }
  const renderedChannels=Array.from({length:centerMode&&audio.channels.length>=2?2:audio.channels.length},()=>new Float32Array(outLength));
  let done=0;
  for(let outStart=0;outStart<outLength;outStart+=chunkFrames){
    if(isCancelled())throw new DOMException('Processing cancelled.','AbortError');
    const outCount=Math.min(chunkFrames,outLength-outStart),segStart=Math.max(0,outStart-preFrames),segEnd=Math.min(outLength,outStart+outCount+tailFrames),segFrames=segEnd-segStart;
    const inputStart=Math.round(segStart*rate),mapped=mappedSlice(baseChannels,sr,segStart,segFrames,rate);
    applyGateAndTransient(mapped,sr,settings.gate,settings.transient,settings.expression);
    const rendered=await renderSegment(mapped,sr,settings);
    const copyStart=outStart-segStart,copyEnd=copyStart+outCount;
    if(centerMode&&audio.channels.length>=2){
      const mid=rendered.getChannelData(0),sideMapped=mappedSlice([side],sr,segStart,segFrames,rate)[0];
      const left=renderedChannels[0],right=renderedChannels[1];
      for(let i=0;i<outCount;i++){const k=copyStart+i,sideSample=sideMapped[k]||0;left[outStart+i]=mid[k]+sideSample;right[outStart+i]=mid[k]-sideSample;}
    }else{
      for(let c=0;c<renderedChannels.length;c++){const src=rendered.getChannelData(Math.min(c,rendered.numberOfChannels-1)),dst=renderedChannels[c];for(let i=0;i<outCount;i++)dst[outStart+i]=src[copyStart+i]||0;}
    }
    done+=outCount;onProgress({stage:'render',percent:Math.min(100,done/outLength*100),message:`Rendering ${Math.round(done/outLength*100)}%`});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  let finalChannels=renderedChannels;
  if(finalChannels.length>=2)finalChannels=widthProcess(finalChannels[0],finalChannels[1],settings.width);
  let peak=0;for(const ch of finalChannels)for(let i=0;i<ch.length;i++)peak=Math.max(peak,Math.abs(ch[i]));
  // Safety limiter to prevent hard clipping on export.
  if(peak>0.999){const g=.999/peak;for(const ch of finalChannels)for(let i=0;i<ch.length;i++)ch[i]*=g;}
  return {sampleRate:sr,length:outLength,duration:outLength/sr,numberOfChannels:finalChannels.length,channels:finalChannels,gapMeta,settings:{...settings,rate}};
}
