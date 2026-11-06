import {decodeAudioFile} from './decode.js';
import {analyzeAudio} from './analysis.js';
import {renderHumanizer} from './effects.js';
import {wavBlob} from './export-wav.js';
import {exportMp3} from './export-mp3.js';
import {clearSession} from './cleanup.js';

export function createEngine(){
  let generation=0;
  const session={file:null,original:null,rendered:null,metrics:null,renderMetrics:null,urls:{},players:{},workers:[],abortController:new AbortController()};
  return {
    session,
    async load(file,onProgress){
      this.clear();
      const ticket=generation;
      session.file=file;
      const decoded=await decodeAudioFile(file);
      if(ticket!==generation)throw new DOMException('Loading cancelled.','AbortError');
      session.original=decoded;
      const metrics=await analyzeAudio(decoded,onProgress,session.abortController.signal);
      if(ticket!==generation)throw new DOMException('Loading cancelled.','AbortError');
      session.metrics=metrics;
      return {audio:session.original,metrics:session.metrics};
    },
    async render(settings,onProgress,isCancelled){if(!session.original)throw new Error('Load a song first.');session.rendered=await renderHumanizer(session.original,settings,onProgress,isCancelled);return session.rendered;},
    wav(bits=16){if(!session.rendered)throw new Error('Render the processed version first.');return wavBlob(session.rendered,bits);},
    async mp3(bitrate=320,onProgress){if(!session.rendered)throw new Error('Render the processed version first.');return exportMp3(session.rendered,bitrate,onProgress,session.abortController.signal);},
    clear(){generation++;clearSession(session);}
  };
}
