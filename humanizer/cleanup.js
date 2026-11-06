export function revokeUrl(url){if(url){try{URL.revokeObjectURL(url);}catch{}}}
export function clearAudioElement(element){if(!element)return;element.pause();element.removeAttribute('src');element.load();}
export function clearSession(session){
  if(!session)return;
  try{session.abortController?.abort();}catch{}
  session.abortController=new AbortController();
  Object.values(session.urls||{}).forEach(revokeUrl);
  Object.values(session.players||{}).forEach(clearAudioElement);
  if(session.workers)session.workers.forEach(worker=>{try{worker.terminate();}catch{}});
  session.original=null;session.rendered=null;session.metrics=null;session.renderMetrics=null;session.file=null;session.urls={};session.players={};session.workers=[];
}
