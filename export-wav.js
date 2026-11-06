export function wavBlob(audio, bits=16){
  const channels=audio.channels.length,samples=audio.length,bytesPerSample=bits/8,dataBytes=samples*channels*bytesPerSample;
  if(dataBytes+44>0xffffffff)throw new Error('WAV file would exceed the RIFF 4 GB limit.');
  const out=new ArrayBuffer(44+dataBytes),view=new DataView(out),ascii=(off,s)=>{for(let i=0;i<s.length;i++)view.setUint8(off+i,s.charCodeAt(i));};
  ascii(0,'RIFF');view.setUint32(4,36+dataBytes,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*channels*bytesPerSample,true);view.setUint16(32,channels*bytesPerSample,true);view.setUint16(34,bits,true);ascii(36,'data');view.setUint32(40,dataBytes,true);
  let pos=44;
  for(let i=0;i<samples;i++)for(let c=0;c<channels;c++){
    const x=Math.max(-1,Math.min(1,audio.channels[c][i]||0));
    if(bits===16){view.setInt16(pos,x<0?Math.round(x*32768):Math.round(x*32767),true);pos+=2;}
    else{let v=x<0?Math.round(x*8388608):Math.round(x*8388607);if(v<0)v+=0x1000000;view.setUint8(pos,v&255);view.setUint8(pos+1,(v>>8)&255);view.setUint8(pos+2,(v>>16)&255);pos+=3;}
  }
  return new Blob([out],{type:'audio/wav'});
}
