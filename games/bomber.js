//! name=BOMBER color=255,150,0
async function run(api) {
  const {display, colors, drawRect, drawText, setPx, sleep, piezo, Effects, joyX, joyY, held, gameOverScreen} = api;
  const W=9,H=9,C=7;
  let map=[], px=1,py=1, score=0, bombs=[], enemies=[];
  function resetMap(){
    map=[];
    for(let y=0;y<H;y++){let r=[];for(let x=0;x<W;x++){
      let v=(x===0||y===0||x===W-1||y===H-1||(x%2===0&&y%2===0))?1:(Math.random()<0.34?2:0);
      if((x<3&&y<3))v=0;r.push(v);
    }map.push(r)}
    enemies=[]; for(let i=0;i<4;i++){let x,y;do{x=1+Math.floor(Math.random()*(W-2));y=1+Math.floor(Math.random()*(H-2));}while(map[y][x]!==0||(x<4&&y<4));enemies.push({x,y,dead:false})}
  }
  resetMap();
  function placeBomb(){if(!bombs.some(b=>b.x===px&&b.y===py)){bombs.push({x:px,y:py,t:22});try{piezo.playSong(Effects.menuSelect)}catch(e){}}}
  api.joyClickHandler=placeBomb;
  api.dpadHandler=d=>{if(d==='right')placeBomb()};
  function blastCells(b){const out=[[b.x,b.y]];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){for(let n=1;n<=2;n++){let x=b.x+dx*n,y=b.y+dy*n;if(map[y][x]===1)break;out.push([x,y]);if(map[y][x]===2)break;}}return out}
  function movePlayer(dx,dy){let nx=px+dx,ny=py+dy;if(map[ny]&&map[ny][nx]===0&&!bombs.some(b=>b.x===nx&&b.y===ny)){px=nx;py=ny}}
  let lastMove=0,lastEnemy=0;
  while(!api.exitRequested){
    const now=Date.now();
    if(now-lastMove>135){let dx=0,dy=0,jx=joyX(),jy=joyY();if(held.left||jx<-.55)dx=-1;else if(held.right||jx>.55)dx=1;else if(held.up||jy<-.55)dy=-1;else if(held.down||jy>.55)dy=1;if(dx||dy){movePlayer(dx,dy);lastMove=now}}
    let blasts=[];
    for(const b of bombs)b.t--;
    const exploding=bombs.filter(b=>b.t<=0); bombs=bombs.filter(b=>b.t>0);
    for(const b of exploding){const cells=blastCells(b);blasts.push(...cells);for(const [x,y] of cells){if(map[y][x]===2){map[y][x]=0;score++}for(const e of enemies)if(!e.dead&&e.x===x&&e.y===y){e.dead=true;score+=5}if(px===x&&py===y){await gameOverScreen(score);return}}try{piezo.playSong(Effects.explosion||Effects.error)}catch(e){}}
    if(now-lastEnemy>420){lastEnemy=now;for(const e of enemies){if(e.dead)continue;const dirs=[[1,0],[-1,0],[0,1],[0,-1]].sort(()=>Math.random()-.5);for(const [dx,dy] of dirs){let nx=e.x+dx,ny=e.y+dy;if(map[ny][nx]===0&&!bombs.some(b=>b.x===nx&&b.y===ny)&&!enemies.some(o=>!o.dead&&o!==e&&o.x===nx&&o.y===ny)){e.x=nx;e.y=ny;break}}if(e.x===px&&e.y===py){await gameOverScreen(score);return}}}
    if(enemies.every(e=>e.dead)){score+=20;resetMap();px=1;py=1;bombs=[]}
    display.clear();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){let c=map[y][x]===1?colors.rgb(45,65,90):map[y][x]===2?colors.rgb(155,85,25):colors.rgb(8,18,22);drawRect(x*C,y*C,C-1,C-1,c)}
    for(const b of bombs){drawRect(b.x*C+1,b.y*C+1,5,5,b.t%6<3?colors.yellow:colors.rgb(70,70,70));setPx(b.x*C+5,b.y*C+1,colors.red)}
    for(const [x,y] of blasts)drawRect(x*C,y*C,C-1,C-1,colors.rgb(255,180,30));
    for(const e of enemies)if(!e.dead){drawRect(e.x*C+1,e.y*C+1,5,5,colors.red);setPx(e.x*C+2,e.y*C+2,colors.white);setPx(e.x*C+4,e.y*C+2,colors.white)}
    drawRect(px*C+1,py*C+1,5,5,colors.rgb(0,220,255));drawText(1,59,String(score),colors.white);
    display.show(); await sleep(45);
  }
}
export default run;
