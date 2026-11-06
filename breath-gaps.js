/* Phrase-gap processor. Use only on a centre-focused / isolated vocal path.
   It is not a vocal separator and does not synthesize breathing sounds. */
function seededRandom(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rmsDb(channels,start,end){let sum=0,count=0;for(const d of channels){for(let i=start;i<end&&i<d.length;i++){sum+=d[i]*d[i];count++;}}return 10*Math.log10(sum/Math.max(1,count)+1e-12);}
export function processBreathGaps(channels,sampleRate,amount=0,options={}){
  const cloned=channels.map(a=>new Float32Array(a));if(!amount)return{channels:cloned,gaps:[],phraseCount:0};
  const hop=Math.max(1,Math.round(sampleRate*.005)),frames=Math.ceil(cloned[0].length/hop),levels=new Float32Array(frames);let peak=-200;
  for(let f=0;f<frames;f++){levels[f]=rmsDb(cloned,f*hop,Math.min(cloned[0].length,(f+1)*hop));peak=Math.max(peak,levels[f]);}
  const thresholdDb=Math.max(20,Math.min(60,Number(options.thresholdDb??40)));
  const threshold=peak-thresholdDb,minFrames=16,quietFrames=8,phrases=[];let start=-1,quiet=-1;
  for(let f=0;f<frames;f++){if(levels[f]>threshold){if(start<0)start=f;quiet=-1;}else if(start>=0){if(quiet<0)quiet=f;if(f-quiet+1>=quietFrames){if(quiet-start>=minFrames)phrases.push({start:start*hop,end:quiet*hop});start=-1;quiet=-1;}}}
  if(start>=0&&frames-start>=minFrames)phrases.push({start:start*hop,end:cloned[0].length});
  const rand=seededRandom(741),rate=Math.max(.5,Math.min(2,Number(options.varispeedRate??1)));
  const minMs=20*rate,maxMs=30*rate,fade=Math.max(1,Math.round(sampleRate*.004));
  const requested=Math.max(0,Math.round(phrases.length*amount/100));
  const cap=Math.max(0,Math.floor(Number(options.maxGaps??(phrases.length-1))));
  const maxGaps=Math.min(Math.max(0,phrases.length-1),requested,cap);
  const gaps=[];
  for(let k=0;k+1<phrases.length&&gaps.length<maxGaps;k++){
    const left=phrases[k],right=phrases[k+1],pause=Math.max(0,right.start-left.end),want=Math.round(sampleRate*(minMs+(maxMs-minMs)*rand())/1000);
    let a,b,mode;if(pause>=want+fade*2){a=left.end+Math.floor((pause-want)/2);b=a+want;mode='existing pause';}else{b=Math.min(cloned[0].length,right.start);a=Math.max(left.start,b-want);mode='phrase-tail trim';}
    if(b-a<1)continue;const fadeN=Math.min(fade,Math.floor((b-a)/2));
    for(const ch of cloned){for(let i=Math.max(0,a-fadeN);i<a;i++)ch[i]*=1-(i-(a-fadeN)+1)/Math.max(1,fadeN);ch.fill(0,a,b);for(let i=b;i<Math.min(ch.length,b+fadeN);i++)ch[i]*=(i-b+1)/Math.max(1,fadeN);}
    gaps.push({startSeconds:a/(sampleRate*rate),endSeconds:b/(sampleRate*rate),durationMs:(b-a)*1000/(sampleRate*rate),mode});
  }
  return {channels:cloned,gaps,phraseCount:phrases.length};
}
