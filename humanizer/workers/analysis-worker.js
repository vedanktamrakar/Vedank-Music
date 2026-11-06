self.onmessage = event => {
  const {samples, sampleRate, originalSampleRate, length, duration, channels} = event.data || {};
  try {
    const n = samples.length;
    let peak = 0, sum = 0, dc = 0, clipped = 0;
    const block = Math.max(1, Math.floor(sampleRate * 0.05));
    const rmsEnvelope = [];
    for (let i = 0; i < n; i++) {
      const x = samples[i], a = Math.abs(x);
      if (a > peak) peak = a;
      sum += x*x; dc += x;
      if (a >= 0.999) clipped++;
      if (i % block === block - 1 || i === n - 1) {
        const start = Math.max(0, i - block + 1);
        let s = 0;
        for (let j = start; j <= i; j++) s += samples[j]*samples[j];
        rmsEnvelope.push(Math.sqrt(s / (i - start + 1)));
      }
      if (i && i % Math.floor(n/4 || 1) === 0) self.postMessage({type:'progress', value:Math.round(i/n*35)});
    }
    const rms = Math.sqrt(sum / Math.max(1,n));
    const rmsDb = rms > 0 ? 20*Math.log10(rms) : -120;
    const peakDb = peak > 0 ? 20*Math.log10(peak) : -120;
    const crestDb = peak > 0 && rms > 0 ? 20*Math.log10(peak/rms) : 0;
    const dcOffset = dc / Math.max(1,n);
    const spectrum = averageSpectrum(samples, sampleRate);
    const bpm = estimateBpm(rmsEnvelope, 0.05);
    const key = estimateKey(samples, sampleRate);
    const result = {
      duration, sampleRate: originalSampleRate, channels,
      peak, peakDb, rms, rmsDb, crestDb,
      clipped, clippedPercent:clipped/Math.max(1,n)*100,
      dcOffset, rmsEnvelope, spectrum, bpm, key,
      note:'Tempo and key are approximate DSP estimates. No AI/human classification is computed.'
    };
    self.postMessage({type:'progress', value:100});
    self.postMessage({type:'result', result});
  } catch (error) {
    self.postMessage({type:'error', message:error?.message || 'Analysis failed.'});
  }
};

function averageSpectrum(samples, sr) {
  const size = 2048, bins = size/2, sums = new Float32Array(bins), frames = Math.min(90, Math.max(1, Math.floor(samples.length/512)));
  for (let f=0; f<frames; f++) {
    const start = Math.floor(f * Math.max(1,(samples.length-size)/Math.max(1,frames-1)));
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i=0;i<size;i++) {
      const x=samples[start+i] || 0, win=0.5-0.5*Math.cos(2*Math.PI*i/(size-1)); re[i]=x*win;
    }
    fft(re,im);
    for(let b=1;b<bins;b++) sums[b]+=Math.hypot(re[b],im[b]);
  }
  const out=[]; for(let b=1;b<bins;b++) out.push({hz:b*sr/size, magnitude:sums[b]/frames});
  return out;
}
function fft(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr0=Math.cos(a),wi0=Math.sin(a);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const u=i+j,v=i+j+len/2,tr=wr*re[v]-wi*im[v],ti=wr*im[v]+wi*re[v];re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;}}}
}
function estimateBpm(env, hopSeconds){
  if(env.length<100)return null;
  const envMean=mean(env);
  const minLag=Math.max(1,Math.round(60/200/hopSeconds)),maxLag=Math.min(env.length-2,Math.round(60/55/hopSeconds));
  let bestLag=0,best=-Infinity;
  for(let lag=minLag;lag<=maxLag;lag++){let sum=0,a=0,b=0;for(let i=lag;i<env.length;i++){const x=env[i]-envMean,y=env[i-lag]-envMean;sum+=x*y;a+=x*x;b+=y*y;}const score=sum/Math.sqrt(Math.max(1e-12,a*b));if(score>best){best=score;bestLag=lag;}}
  if(!bestLag||best<0.08)return null;
  let bpm=60/(bestLag*hopSeconds);while(bpm<70)bpm*=2;while(bpm>180)bpm/=2;return Math.round(bpm*10)/10;
}
function mean(a){let s=0;for(const v of a)s+=v;return s/Math.max(1,a.length);}
function estimateKey(samples,sr){
  const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const major=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const minor=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  const chroma=new Float64Array(12),size=4096,hop=4096*2,frames=Math.min(80,Math.ceil(samples.length/hop));
  for(let f=0;f<frames;f++){const start=f*hop;if(start+size>samples.length)break;const re=new Float64Array(size),im=new Float64Array(size);for(let i=0;i<size;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(size-1));re[i]=samples[start+i]*w;}fft(re,im);for(let b=2;b<size/2;b++){const hz=b*sr/size;if(hz<55||hz>2000)continue;const midi=69+12*Math.log2(hz/440),nearest=Math.round(midi),err=Math.abs(midi-nearest);if(err<.35)chroma[((nearest%12)+12)%12]+=Math.hypot(re[b],im[b])*(1-err/.35);}}
  let best={score:-Infinity,name:'Unknown'};for(let root=0;root<12;root++)for(const [mode,profile] of [['major',major],['minor',minor]]){let score=0;for(let i=0;i<12;i++)score+=chroma[(i+root)%12]*profile[i];if(score>best.score)best={score,name:`${names[root]} ${mode}`};}return best.score>0?best.name:'Unknown';
}
