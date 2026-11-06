const abortError=()=>new DOMException('MP3 export cancelled.','AbortError');

async function tryNativeMp3(audio,bitrate,onProgress,signal){
  if(signal?.aborted)throw abortError();
  if(typeof AudioEncoder==='undefined'||typeof AudioData==='undefined'||typeof AudioEncoder.isConfigSupported!=='function')return null;
  let supported;
  try{supported=await AudioEncoder.isConfigSupported({codec:'mp3',sampleRate:audio.sampleRate,numberOfChannels:Math.min(2,audio.channels.length),bitrate:bitrate*1000});}catch{return null;}
  if(signal?.aborted)throw abortError();
  if(!supported?.supported)return null;
  return new Promise((resolve,reject)=>{
    const chunks=[];let failure=null,settled=false,encoder;
    const finish=(handler,value)=>{
      if(settled)return;settled=true;signal?.removeEventListener('abort',abort);
      try{encoder?.close();}catch{}
      handler(value);
    };
    const abort=()=>finish(reject,abortError());
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    try{
      encoder=new AudioEncoder({
        output(chunk){if(settled)return;const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);chunks.push(bytes);},
        error(error){failure=error;}
      });
      encoder.configure(supported.config);
      const count=Math.min(2,audio.channels.length),total=audio.length,step=4096;
      for(let start=0;start<total;start+=step){
        if(signal?.aborted){abort();return;}
        const frames=Math.min(step,total-start),interleaved=new Float32Array(frames*count);
        for(let i=0;i<frames;i++)for(let c=0;c<count;c++)interleaved[i*count+c]=audio.channels[c][start+i]||0;
        const packet=new AudioData({format:'f32',sampleRate:audio.sampleRate,numberOfFrames:frames,numberOfChannels:count,timestamp:Math.round(start/audio.sampleRate*1e6),data:interleaved});
        encoder.encode(packet);packet.close();onProgress(Math.round((start+frames)/total*100));
      }
      encoder.flush().then(()=>{
        if(failure)finish(reject,failure);else finish(resolve,new Blob(chunks,{type:'audio/mpeg'}));
      }).catch(error=>finish(reject,error));
    }catch(error){finish(reject,error);}
  });
}

export async function exportMp3(audio, bitrate=320, onProgress=()=>{}, signal=null){
  const native=await tryNativeMp3(audio,bitrate,onProgress,signal).catch(error=>{
    if(error?.name==='AbortError')throw error;
    return null;
  });
  if(native)return native;
  if(signal?.aborted)throw abortError();
  return new Promise((resolve,reject)=>{
    const worker=new Worker('/humanizer/workers/mp3-worker.js');let settled=false;
    const finish=(handler,value)=>{
      if(settled)return;settled=true;signal?.removeEventListener('abort',abort);worker.terminate();handler(value);
    };
    const abort=()=>finish(reject,abortError());
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{
      const msg=event.data||{};
      if(msg.type==='progress')onProgress(msg.percent||0);
      if(msg.type==='result')finish(resolve,new Blob(msg.parts,{type:'audio/mpeg'}));
      if(msg.type==='error')finish(reject,new Error(msg.message||'MP3 encoding failed.'));
    };
    worker.onerror=()=>finish(reject,new Error('The MP3 worker stopped unexpectedly.'));
    try{
      const copies=audio.channels.map(ch=>new Float32Array(ch));
      worker.postMessage({type:'encode',channels:copies,sampleRate:audio.sampleRate,bitrate:Number(bitrate)},copies.map(a=>a.buffer));
    }catch(error){finish(reject,error);}
  });
}
