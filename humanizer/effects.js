import {splitMidSide,combineMidSide,widthProcess} from './separation.js';
import {varispeedRate} from './pitch.js';
import {processBreathGaps} from './breath-gaps.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mappedSlice(sourceChannels,sr,outStart,outFrames,rate){
  const out=sourceChannels.map(()=>new Float32Array(outFrames));
  for(let c=0;c<sourceChannels.length;c++){
    const src=sourceChannels[c];
    for(let j=0;j<outFrames;j++){
      const pos=(outStart+j)*rate;
      const i=Math.floor(pos),frac=pos-i;
      const a=src[i]||0,b=src[i+1]||0;
      out[c][j]=a+(b-a)*frac;
    }
  }
  return out;
}
function applyGain(channels,db){
  const g=Math.pow(10,db/20);
  for(const ch of channels)for(let i=0;i<ch.length;i++)ch[i]*=g;
}
function softClip(channels,amount){
  if(!amount)return;
  const drive=1+amount*4;
  for(const ch of channels)for(let i=0;i<ch.length;i++)ch[i]=Math.tanh(ch[i]*drive)/Math.tanh(drive);
}
export async function renderHumanizer(audio,settings,onProgress,isCancelled){
  const rate=varispeedRate(settings.pitch,settings.tempo);
  const outLength=Math.max(1,Math.round(audio.length/rate));
  let channels=audio.channels.map(ch=>new Float32Array(ch));
  if(settings.width!==100)channels=widthProcess(channels[0],channels[1]||channels[0],settings.width);
  if(settings.centerFocus&&channels.length>1){
    const ms=splitMidSide(channels[0],channels[1]);
    channels=combineMidSide(ms.mid,ms.side.map(v=>v*0.35));
  }
  const breath=processBreathGaps(channels,audio.sampleRate,settings.breathGaps,{varispeedRate:rate,maxGaps:settings.maxBreathGaps});
  channels=breath.channels;
  const block=Math.max(1024,Math.round(audio.sampleRate*0.05));
  const outChannels=channels.map(()=>new Float32Array(outLength));
  for(let start=0;start<outLength;start+=block){
    if(isCancelled?.())throw new DOMException('Render cancelled.','AbortError');
    const frames=Math.min(block,outLength-start);
    const slice=mappedSlice(channels,audio.sampleRate,start,frames,rate);
    for(let c=0;c<slice.length;c++)outChannels[c].set(slice[c],start);
    onProgress(Math.round(start/outLength*80));
    await new Promise(r=>setTimeout(r,0));
  }
  // Simple dynamics & texture (existing DSP only)
  if(settings.comp){
    const thresh=Math.pow(10,(-12-settings.comp*0.2)/20);
    for(const ch of outChannels)for(let i=0;i<ch.length;i++){
      const a=Math.abs(ch[i]);
      if(a>thresh)ch[i]*=thresh/a*(1+(a/thresh-1)*0.3);
    }
  }
  if(settings.gate){
    const thresh=Math.pow(10,(-40-settings.gate*0.3)/20);
    for(const ch of outChannels)for(let i=0;i<ch.length;i++)if(Math.abs(ch[i])<thresh)ch[i]*=0.2;
  }
  if(settings.transient){
    // light transient emphasis via simple differentiator mix
    for(const ch of outChannels){
      let prev=0;
      for(let i=0;i<ch.length;i++){
        const d=ch[i]-prev;prev=ch[i];
        ch[i]+=d*settings.transient*0.15;
      }
    }
  }
  if(settings.vibrato){
    const depth=settings.vibrato/100*0.003,rateHz=settings.vibratoRate;
    for(let c=0;c<outChannels.length;c++){
      const src=outChannels[c],dst=new Float32Array(src);
      for(let i=0;i<src.length;i++){
        const t=i/audio.sampleRate,mod=Math.sin(2*Math.PI*rateHz*t)*depth*audio.sampleRate;
        const pos=i+mod,ii=Math.floor(pos),f=pos-ii;
        dst[i]=(src[ii]||0)*(1-f)+(src[ii+1]||0)*f;
      }
      outChannels[c]=dst;
    }
  }
  applyGain(outChannels,settings.gain);
  if(settings.saturation)softClip(outChannels,settings.saturation/100);
  onProgress(100);
  return {sampleRate:audio.sampleRate,length:outLength,duration:outLength/audio.sampleRate,numberOfChannels:outChannels.length,channels:outChannels,breath};
}
