export function setupABPlayer(before,after){
  const pause=()=>{before.pause();after.pause();};
  before.addEventListener('play',()=>{after.pause();after.currentTime=before.currentTime;});
  after.addEventListener('play',()=>{before.pause();before.currentTime=after.currentTime;});
  before.addEventListener('seeking',()=>{if(Math.abs(after.currentTime-before.currentTime)>.18)after.currentTime=before.currentTime;});
  after.addEventListener('seeking',()=>{if(Math.abs(before.currentTime-after.currentTime)>.18)before.currentTime=after.currentTime;});
  before.addEventListener('timeupdate',()=>{if(!after.paused&&Math.abs(after.currentTime-before.currentTime)>.25)after.currentTime=before.currentTime;});
  after.addEventListener('timeupdate',()=>{if(!before.paused&&Math.abs(before.currentTime-after.currentTime)>.25)before.currentTime=after.currentTime;});
  return {pause,playBefore:()=>{pause();before.currentTime=0;before.play();},playAfter:()=>{pause();after.currentTime=0;after.play();},matchLoudness(beforeRms,afterRms){const target=Math.min(beforeRms||0,afterRms||0);before.volume=beforeRms>0?Math.min(1,target/beforeRms):1;after.volume=afterRms>0?Math.min(1,target/afterRms):1;}};
}
