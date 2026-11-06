export function splitMidSide(left, right) {
  if (!right) return {mid:new Float32Array(left), side:new Float32Array(left.length).fill(0)};
  const mid = new Float32Array(left.length), side = new Float32Array(left.length);
  for (let i=0;i<left.length;i++) { mid[i]=(left[i]+right[i])*0.5; side[i]=(left[i]-right[i])*0.5; }
  return {mid,side};
}
export function combineMidSide(mid, side) {
  const left=new Float32Array(mid.length),right=new Float32Array(mid.length);
  for(let i=0;i<mid.length;i++){left[i]=mid[i]+(side?.[i]||0);right[i]=mid[i]-(side?.[i]||0);}
  return [left,right];
}
export function widthProcess(left,right,widthPercent){
  const width=Math.max(0,Math.min(1.5,widthPercent/100));
  const l=left,r=right||left;
  for(let i=0;i<l.length;i++){const a=l[i],b=r[i],m=(a+b)*.5,s=(a-b)*.5*width;l[i]=m+s;r[i]=m-s;}
  return [l,r];
}
