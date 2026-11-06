export function revokeUrl(url){if(url){try{URL.revokeObjectURL(url);}catch{}}}
export function clearSession(session){
  session.abortController.abort();
  session.abortController=new AbortController();
  Object.values(session.urls||{}).forEach(revokeUrl);
  session.urls={};
  (session.workers||[]).forEach(w=>{try{w.terminate();}catch{}});
  session.workers=[];
  session.original=null;session.rendered=null;session.metrics=null;session.renderMetrics=null;session.file=null;
}
