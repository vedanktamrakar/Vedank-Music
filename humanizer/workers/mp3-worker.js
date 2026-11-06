self.onmessage=event=>{
  const {channels,sampleRate,bitrate}=event.data||{};
  try{
    // Keep the LGPL encoder as a separate, replaceable file. No code is bundled into this worker.
    importScripts('/humanizer/vendor/lame.min.js');
    if(!self.lamejs?.Mp3Encoder)throw new Error('The local LAME encoder was not found at /humanizer/vendor/lame.min.js. Add the separate lame.min.js file before using MP3 export.');
    if(!Array.isArray(channels)||!channels.length)throw new Error('No processed audio was received.');
    const count=Math.min(2,channels.length),encoder=new self.lamejs.Mp3Encoder(count,sampleRate,bitrate),total=channels[0].length,step=1152*20,parts=[];
    const to16=(data,start,end)=>{const out=new Int16Array(end-start);for(let i=start;i<end;i++){const x=Math.max(-1,Math.min(1,data[i]||0));out[i-start]=x<0?Math.round(x*32768):Math.round(x*32767);}return out;};
    for(let start=0;start<total;start+=step){const end=Math.min(total,start+step),left=to16(channels[0],start,end),encoded=count===2?encoder.encodeBuffer(left,to16(channels[1],start,end)):encoder.encodeBuffer(left);if(encoded?.length)parts.push(encoded.buffer.slice(encoded.byteOffset,encoded.byteOffset+encoded.byteLength));self.postMessage({type:'progress',percent:Math.round(end/total*100)});}
    const tail=encoder.flush();if(tail?.length)parts.push(tail.buffer.slice(tail.byteOffset,tail.byteOffset+tail.byteLength));
    self.postMessage({type:'result',parts},parts);
  }catch(error){self.postMessage({type:'error',message:error?.message||'MP3 encoding failed.'});}
};
