//! name=CATCH color=0,255,150
export default async function(api){
const{setPx,drawText,drawRect,display,piezo,Effects,sleep,gameOverScreen,makeHControl,flashScreen,colors}=api;
const W=12,Y=59,ctrl=makeHControl(26,0,64-W,2.2);
let x=26,items=[],score=0,lives=3,ticks=0,spawn=12;
api.dpadHandler=()=>{};
while(!api.exitRequested){
ticks++;x=ctrl.update();spawn--;
if(spawn<=0){spawn=Math.max(8,18-Math.floor(score/8));items.push({x:2+Math.floor(Math.random()*59),y:-3,gold:Math.random()<.13})}
const speed=.65+score*.018;
for(const o of items)o.y+=speed;
for(const o of items){
if(o.y+3>=Y&&o.y<Y+4&&o.x>=x-2&&o.x<=x+W+1){score+=o.gold?3:1;o.y=999;piezo.playSong(o.gold?Effects.upgrade:Effects.coin)}
else if(o.y>63&&o.y<900){lives--;o.y=999;piezo.playSong(Effects.damage);if(lives<=0){await flashScreen(colors.rgb(70,0,0),1);await gameOverScreen(score);return}}
}
items=items.filter(o=>o.y<900);
display.clear();
for(const o of items){const c=o.gold?colors.yellow:colors.rgb(0,200,255);drawRect(o.x-1,Math.round(o.y),3,3,c);if(o.gold)setPx(o.x,Math.round(o.y)+1,colors.white)}
drawRect(Math.round(x),Y,W,2,colors.white);drawRect(Math.round(x)+2,Y-1,W-4,1,colors.rgb(0,160,255));drawText(1,1,String(score),colors.rgb(70,70,70));for(let i=0;i<lives;i++)setPx(62-i*2,1,colors.green);display.show();
await sleep(40)
}
}
