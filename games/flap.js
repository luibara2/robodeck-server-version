//! name=FLAP color=255,220,0
export default async function(api){
const{setPx,drawText,drawRect,display,piezo,Effects,sleep,gameOverScreen,flashScreen,explode,colors}=api;
const BIRD_X=15,GAP=22;
let birdY=30,vy=0,pipes=[{x:66,gapY:22,passed:false}],score=0,ticks=0,started=false;
const flap=()=>{started=true;vy=-1.7;piezo.playSong(Effects.jump)};
api.dpadHandler=flap;
api.joyClickHandler=flap;
while(!api.exitRequested){
ticks++;
if(started){vy+=0.16;birdY+=vy}else birdY=30+Math.sin(ticks*.2)*2;
if(birdY<0||birdY>61){await flashScreen(colors.rgb(80,80,80),1);await gameOverScreen(score);return}
if(started){
const speed=.75+score*.015;
for(const p of pipes)p.x-=speed;
if(pipes[pipes.length-1].x<30)pipes.push({x:66,gapY:6+Math.floor(Math.random()*(44-GAP)),passed:false});
pipes=pipes.filter(p=>p.x>-7);
for(const p of pipes){
if(p.x<BIRD_X+3&&p.x+6>BIRD_X&&(birdY<p.gapY||birdY+3>p.gapY+GAP)){await explode(BIRD_X+1,Math.round(birdY)+1);await gameOverScreen(score);return}
if(!p.passed&&p.x+6<BIRD_X){p.passed=true;score++;piezo.playSong(Effects.coin)}
}
}
display.clear();
for(const p of pipes){const x=Math.round(p.x);drawRect(x,0,6,p.gapY,colors.green);drawRect(x,p.gapY+GAP,6,64-p.gapY-GAP,colors.green);drawRect(x-1,p.gapY-2,8,2,colors.rgb(0,180,0));drawRect(x-1,p.gapY+GAP,8,2,colors.rgb(0,180,0))}
const y=Math.round(birdY);drawRect(BIRD_X,y,3,3,colors.yellow);setPx(BIRD_X+2,y+1,colors.white);setPx(BIRD_X,y+(vy<0?0:2),colors.rgb(255,150,0));drawText(1,1,String(score),colors.rgb(80,80,80));if(!started)drawText(20,50,"FLAP",colors.rgb(60,60,60));display.show();
await sleep(40)
}
}
