export function varispeedRate(semitones, tempoPercent) {
  return Math.pow(2, Number(semitones||0)/12) * (1 + Number(tempoPercent||0)/100);
}

// YIN-style estimate. Intended for a mostly monophonic vocal phrase, not a full mix verdict.
export function estimatePitchYIN(samples, sampleRate, frameSize=2048, threshold=0.15) {
  const minTau=Math.floor(sampleRate/1000), maxTau=Math.min(Math.floor(sampleRate/55),Math.floor(frameSize/2));
  const diff=new Float64Array(maxTau+1);
  for(let tau=minTau;tau<=maxTau;tau++){
    let sum=0;for(let i=0;i<frameSize-maxTau;i++){const d=samples[i]-samples[i+tau];sum+=d*d;}diff[tau]=sum;
  }
  let running=0;const cmnd=new Float64Array(maxTau+1);
  for(let tau=minTau;tau<=maxTau;tau++){running+=diff[tau];cmnd[tau]=diff[tau]*tau/Math.max(1e-12,running);}
  let chosen=-1;for(let tau=minTau+1;tau<maxTau;tau++){if(cmnd[tau]<threshold&&cmnd[tau]<=cmnd[tau-1]&&cmnd[tau]<=cmnd[tau+1]){chosen=tau;break;}}
  if(chosen<0)return {hz:null,confidence:0,note:'Unclear'};
  const a=cmnd[chosen-1],b=cmnd[chosen],c=cmnd[chosen+1],shift=.5*(a-c)/(a-2*b+c||1),period=chosen+shift;
  const hz=sampleRate/period,confidence=Math.max(0,Math.min(1,1-b));
  const midi=Math.round(69+12*Math.log2(hz/440));
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return {hz,confidence,note:names[(midi%12+12)%12]+(Math.floor(midi/12)-1)};
}
