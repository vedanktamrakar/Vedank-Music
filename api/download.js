<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
(function(){
  var COBALT="https://cobalt-latest-33pl.onrender.com";
  var HOSTS=["youtube.com","youtu.be","youtube-nocookie.com","instagram.com","facebook.com","fb.watch","snapchat.com"];
  var type="video",$=function(i){return document.getElementById(i)};
  var q=$("quality"),f=$("format"),msg=$("msg"),bar=$("bar"),go=$("go");

  function opts(){
    var a=type==="audio",t=type==="thumbnail";
    q.style.display=(a||t)?"none":"";
    f.style.display=t?"none":"";
    f.innerHTML=a?'<option value="mp3">MP3</option><option value="opus">Opus</option><option value="wav">WAV</option>':'<option value="mp4">MP4</option><option value="webm">WebM</option>';
  }
  $("tabs").onclick=function(e){var t=e.target.getAttribute("data-t");if(!t)return;type=t;
    [].forEach.call(document.querySelectorAll(".tab"),function(b){b.classList.toggle("on",b===e.target)});opts();};
  $("paste").onclick=function(){
    if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(function(t){$("url").value=t}).catch(function(){$("url").focus()});}
    else $("url").focus();
  };
  function show(h){msg.innerHTML=h;msg.style.display="block"}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
  function esc(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;")}
  function host(u){try{return new URL(u).hostname.toLowerCase().replace(/^www\./,"")}catch(e){return ""}}
  function okHost(u){var h=host(u);return !!h&&HOSTS.some(function(d){return h===d||h.slice(-d.length-1)==="."+d})}
  function isImg(v){return typeof v==="string"&&/\.(jpe?g|png|webp|avif|gif|bmp|heic)$/.test(v.split("?")[0].split("#")[0].toLowerCase())}
  function friendly(d,st){
    var c=d&&d.error&&d.error.code?String(d.error.code):"";
    if(c.indexOf("login")>-1)return "The platform is asking for sign-in. Try another public link or try again later.";
    if(c.indexOf("not_available")>-1||c.indexOf("unavailable")>-1)return "This video is not available (private, removed or region-locked).";
    if(c.indexOf("age")>-1)return "This video is age-restricted.";
    if(st===429||c.indexOf("rate")>-1)return "Too many requests right now. Please try again in a moment.";
    return c?"Could not download this link ("+c+"). Try another public link.":"Could not process this link. Make sure the post is public.";
  }
  function post(body){
    return fetch(COBALT+"/",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(d){return {st:r.status,d:d}})});
  }
  function ytId(u){
    try{var p=new URL(u),id=p.searchParams.get("v");
      if(!id&&p.hostname.indexOf("youtu.be")>-1)id=p.pathname.split("/").filter(Boolean)[0];
      if(!id&&p.pathname.indexOf("/shorts/")>-1)id=p.pathname.split("/shorts/")[1].split("/")[0];
      if(!id&&p.pathname.indexOf("/embed/")>-1)id=p.pathname.split("/embed/")[1].split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id||"")?id:null}catch(e){return null}
  }
  function done(tab,href){
    if(tab){try{tab.location.href=href}catch(e){}}
    else window.location.href=href;
    show('Your file opened in a new tab. Use the Download option in Chrome there. If it did not open, <a href="'+esc(href)+'" target="_blank" rel="noopener">tap here</a>.');
  }
  function end(){go.disabled=false;go.textContent="Download";bar.style.display="none"}

  go.onclick=function(){
    var u=$("url").value.trim();
    if(!u){show("Please paste a link first.");return}
    if(!okHost(u)){show("Only public YouTube, Instagram, Facebook and Snapchat links are supported.");return}
    var tab=null;
    try{tab=window.open("about:blank","_blank")}catch(e){}
    function fail(t){if(tab){try{tab.close()}catch(e){}}show(t);end()}

    if(type==="thumbnail"){
      var id=ytId(u);
      if(!id)return fail("Thumbnails work for YouTube links only.");
      return done(tab,"https://img.youtube.com/vi/"+id+"/maxresdefault.jpg"),end();
    }

    go.disabled=true;go.textContent="Preparing…";bar.style.display="block";msg.style.display="none";
    var body={url:u,downloadMode:type==="audio"?"audio":"auto",filenameStyle:"pretty",localProcessing:"disabled"};
    if(type==="audio")body.audioFormat=f.value;
    else{body.videoQuality=q.value;body.youtubeVideoCodec="h264";
      var h=host(u);if(h==="youtube.com"||h.slice(-12)===".youtube.com"||h==="youtu.be")body.youtubeVideoContainer=f.value;}

    post(body).catch(function(){
      show("Waking up the download server, please wait…");
      return sleep(5000).then(function(){return post(body)});
    }).then(function(x){
      var d=x.d;
      if(x.st>=400||d.status==="error")return fail(friendly(d,x.st));
      var href=null;
      if(d.status==="picker"){
        var items=d.picker||[],p=null;
        for(var i=0;i<items.length;i++){if(items[i]&&items[i].type==="video"&&items[i].url){p=items[i];break}}
        if(type==="audio"&&d.audio)href=d.audio;
        else if(p&&!isImg(p.url)&&!isImg(p.filename))href=p.url;
        else return fail("No downloadable video was found in this post.");
      }else if(d.status==="tunnel"||d.status==="redirect"){
        if(type==="video"&&(isImg(d.filename)||isImg(d.url)))return fail("This link points to an image, not a video.");
        href=d.url;
      }else return fail("Unexpected response. Please try again later.");
      done(tab,href);end();
    }).catch(function(){
      fail("Could not reach the download server. Please try again in a minute. (In Claude preview this is expected.)");
    });
  };
  opts();

  try{
    var c=$("bg"),r=new THREE.WebGLRenderer({canvas:c,alpha:true,antialias:true});
    r.setPixelRatio(Math.min(devicePixelRatio,2));
    var s=new THREE.Scene(),cam=new THREE.PerspectiveCamera(55,1,.1,100);cam.position.z=9;
    s.add(new THREE.AmbientLight(0xffffff,.6));
    var l=new THREE.PointLight(0xff5fa8,1.4,40);l.position.set(5,5,6);s.add(l);
    var l2=new THREE.PointLight(0x8a6dff,1.4,40);l2.position.set(-6,-3,5);s.add(l2);
    var m1=new THREE.Mesh(new THREE.TorusKnotGeometry(1.5,.45,140,18),new THREE.MeshStandardMaterial({color:0x8a6dff,metalness:.6,roughness:.25}));
    m1.position.set(2.6,1.2,-1);s.add(m1);
    var m2=new THREE.Mesh(new THREE.IcosahedronGeometry(1.1,0),new THREE.MeshStandardMaterial({color:0xff5fa8,metalness:.5,roughness:.3,flatShading:true}));
    m2.position.set(-3.2,-1.6,0);s.add(m2);
    var m3=new THREE.Mesh(new THREE.OctahedronGeometry(.7,0),new THREE.MeshBasicMaterial({color:0x6ee7ff,wireframe:true}));
    m3.position.set(-2.4,2.6,-2);s.add(m3);
    var m4=new THREE.Mesh(new THREE.TorusGeometry(.8,.22,16,48),new THREE.MeshStandardMaterial({color:0xffc857,metalness:.7,roughness:.25}));
    m4.position.set(3.4,-2.6,0);s.add(m4);
    var mx=0,my=0;
    addEventListener("pointermove",function(e){mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5});
    function rs(){r.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()}
    rs();addEventListener("resize",rs);
    (function a(t){requestAnimationFrame(a);var k=t*.001;
      m1.rotation.x=k*.4;m1.rotation.y=k*.6;m2.rotation.x=-k*.5;m2.rotation.y=k*.4;m3.rotation.y=k;m4.rotation.x=k*.7;m4.rotation.z=k*.3;
      m1.position.y=1.2+Math.sin(k)*.4;m2.position.y=-1.6+Math.cos(k*.8)*.4;
      cam.position.x+=(mx*2-cam.position.x)*.05;cam.position.y+=(-my*2-cam.position.y)*.05;cam.lookAt(0,0,0);
      r.render(s,cam)})(0);
  }catch(e){}
})();
</script>
