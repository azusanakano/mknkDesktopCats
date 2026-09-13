import fs from 'node:fs';
import crypto from 'node:crypto';
export const SOURCES = {
  yuri: {file:'yuri_walk_sheet.jpeg',sha256:'78e670d6afe8cb87643abfe1c37089a4c433bcc639a6b40932921d4de5ff0bbe',groundExclusive:364},
  onyankopon: {file:'onyankopon_walk_sheet.jpeg',sha256:'555c51736a7b7078ab4c77686633d805a2b527367853ad58a2ab6d900f808ac2',groundExclusive:343}
};
export const CELL_SIZE = 384;
export const FRAME_COUNT = 8;
export const CYCLE_MS = Object.freeze({slow:2400,normal:1200,fast:800});
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
// Exact replacements supplied by the user on 2026-09-13. Derive alpha only.
// Never align separate poses, warp the body, reorder frames, or recolor pixels.
export async function importReference(sharp,inputPath,name) {
  const input=fs.readFileSync(inputPath);
  if(!SOURCES[name] || hash(input)!==SOURCES[name].sha256) throw new Error(`Unapproved source: ${name}`);
  const {data:rgb,info}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==1536 || info.height!==768 || info.channels!==3) throw new Error('Expected the supplied 1536 x 768 JPEG');
  const n=CELL_SIZE,cells=[],records=[];
  for(let slot=0;slot<FRAME_COUNT;slot++) {
    const col=slot%4,row=Math.floor(slot/4),left=col*n,top=row*n;
    const width=n,height=n;
    const cell=Buffer.alloc(n*n*4),candidate=new Uint8Array(n*n);
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
      const p=y*n+x,q=p*4;
      if(x>=width || y>=height) {candidate[p]=1;continue;}
      const t=((top+y)*1536+left+x)*3,r=rgb[t],g=rgb[t+1],b=rgb[t+2];
      cell[q]=r;cell[q+1]=g;cell[q+2]=b;cell[q+3]=255;
      const max=Math.max(r,g,b),spread=max-Math.min(r,g,b);
      candidate[p]=max<=24 || (max<=36 && spread<=8) ? 1 : 0;
    }
    const outside=new Uint8Array(n*n),queue=new Int32Array(n*n);
    let head=0,tail=0;
    const add=p=>{if(candidate[p] && !outside[p]) {outside[p]=1;queue[tail++]=p;}};
    for(let v=0;v<n;v++) {add(v);add((n-1)*n+v);add(v*n);add(v*n+n-1);}
    while(head<tail) {
      const p=queue[head++],x=p%n,y=Math.floor(p/n);
      if(x) add(p-1);if(x<n-1) add(p+1);if(y) add(p-n);if(y<n-1) add(p+n);
    }
    // Keep the connected cat. Dark internal fur is not globally color-keyed.
    const labels=new Int32Array(n*n);
    let label=0,largestLabel=0,largestSize=0;
    for(let start=0;start<labels.length;start++) {
      if(outside[start] || labels[start]) continue;
      label++;head=0;tail=0;labels[start]=label;queue[tail++]=start;
      while(head<tail) {
        const p=queue[head++],x=p%n,y=Math.floor(p/n);
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
          const nx=x+dx,ny=y+dy;
          if((!dx&&!dy)||nx<0||ny<0||nx>=n||ny>=n) continue;
          const v=ny*n+nx;
          if(!outside[v]&&!labels[v]) {labels[v]=label;queue[tail++]=v;}
        }
      }
      if(tail>largestSize) {largestSize=tail;largestLabel=label;}
    }
    // Close narrow notches in the matte caused by near-black tail stripes.
    // This alters coverage only, keeping the source pixels and coordinates.
    const mask=new Uint8Array(n*n),dilated=new Uint8Array(n*n),closed=new Uint8Array(n*n),kernel=[];
    for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++) if(dx*dx+dy*dy<=16) kernel.push([dx,dy]);
    for(let p=0;p<n*n;p++) mask[p]=!outside[p]&&labels[p]===largestLabel?1:0;
    for(let y=4;y<n-4;y++) for(let x=4;x<n-4;x++) {
      const p=y*n+x;
      if(mask[p]) {dilated[p]=1;continue;}
      for(const [dx,dy] of kernel) if(mask[p+dy*n+dx]) {dilated[p]=1;break;}
    }
    for(let y=4;y<n-4;y++) for(let x=4;x<n-4;x++) {
      const p=y*n+x;
      if(mask[p]) {closed[p]=1;continue;}
      let all=true;
      for(const [dx,dy] of kernel) if(!dilated[p+dy*n+dx]) {all=false;break;}
      closed[p]=all?1:0;
    }
    // Protect near-black bands in the elevated tail only. A wider closing
    // here cannot bridge the leg gaps, which are below this fixed region.
    const tailKernel=[],tailDilated=new Uint8Array(n*n);
    for(let dy=-10;dy<=10;dy++) for(let dx=-10;dx<=10;dx++)
      if(dx*dx+dy*dy<=100) tailKernel.push([dx,dy]);
    const tailRight=Math.floor(n/3),tailBottom=Math.floor(n*0.40);
    for(let y=0;y<tailBottom+10;y++) for(let x=0;x<tailRight+10;x++) {
      const p=y*n+x;
      for(const [dx,dy] of tailKernel) {
        const xx=x+dx,yy=y+dy;
        if(xx>=0&&yy>=0&&xx<n&&yy<n&&closed[yy*n+xx]) {tailDilated[p]=1;break;}
      }
    }
    for(let y=10;y<tailBottom;y++) for(let x=10;x<tailRight;x++) {
      const p=y*n+x;if(closed[p])continue;
      let all=true;
      for(const [dx,dy] of tailKernel)if(!tailDilated[p+dy*n+dx]){all=false;break;}
      if(all)closed[p]=1;
    }
    // Fill only tiny enclosed matte holes (e.g. dark stripes at a curled tip).
    const visited=new Uint8Array(n*n);
    for(let start=0;start<n*n;start++) {
      if(closed[start]||visited[start]) continue;
      head=0;tail=0;queue[tail++]=start;visited[start]=1;let border=false;
      while(head<tail) {
        const p=queue[head++],x=p%n,y=Math.floor(p/n);
        if(!x||!y||x===n-1||y===n-1) border=true;
        for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx=x+dx,ny=y+dy;
          if(nx<0||ny<0||nx>=n||ny>=n) continue;
          const v=ny*n+nx;
          if(!closed[v]&&!visited[v]) {visited[v]=1;queue[tail++]=v;}
        }
      }
      if(!border&&tail<=128) for(let i=0;i<tail;i++) closed[queue[i]]=1;
    }
    let visible=0,minX=n,minY=n,maxX=-1,maxY=-1;
    for(let p=0;p<n*n;p++) {
      if(!closed[p]) {cell[p*4+3]=0;continue;}
      visible++;minX=Math.min(minX,p%n);maxX=Math.max(maxX,p%n);
      minY=Math.min(minY,Math.floor(p/n));maxY=Math.max(maxY,Math.floor(p/n));
    }
    if(visible<20000||visible>80000) throw new Error(`${name} F${slot+1}: bad coverage ${visible}`);
    if(minX<2||minY<2||maxX>=width-2||maxY>=height-2) throw new Error(`${name} F${slot+1}: clipped foreground`);
    cells.push(cell);
    records.push({frame:slot+1,crop:{x:left,y:top,width,height},padding:{right:n-width,bottom:n-height},
      visiblePixels:visible,bounds:{minX,minY,maxX,maxY},rgbaSha256:hash(cell)});
  }
  return {cells,report:{name,source:SOURCES[name].file,sha256:hash(input),sourceWidth:1536,sourceHeight:768,
    columns:4,rows:2,cellSize:n,frames:records,order:'row-major: F01..F08',perFrameTranslation:false,
    poseWarp:false,interpolation:false,rgbModified:false,alphaMethod:'border-connected near-black mask; largest foreground; radius-4 matte closing; radius-10 closing in upper-left tail region only; fill enclosed holes up to 128px',
    alphaGroundTruthAvailable:false,sourceHasTiming:false,defaultCycleMs:1200,cycleMs:CYCLE_MS,
    displayGroundExclusive:SOURCES[name].groundExclusive}};
}
