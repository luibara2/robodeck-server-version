//! name=ASTRO color=180,80,255
export default async function(api){
const{setPx,drawText,display,piezo,Effects,sleep,gameOverScreen,flashScreen,joyX,joyY,colors}=api;
let x=32,y=32,vx=0,vy=0,a=-Math.PI/2,bullets=[],rocks=[],hits=[],score=0,lives=3,inv=0,wave=0,lastShot=0;
const wrap=n=>n<0?n+64:n>=64?n-64:n;
const delta=(to,from)=>{let d=to-from;if(d>32)d-=64;else if(d<-32)d+=64;return d};
function line(x0,y0,x1,y1,c){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,e=dx+dy;while(true){setPx(wrap(x0),wrap(y0),c);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}}}
function addRock(r){let rx,ry;do{rx=Math.random()*64;ry=Math.random()*64}while(delta(rx,x)*delta(rx,x)+delta(ry,y)*delta(ry,y)<180);rocks.push({x:rx,y:ry,vx:(Math.random()-.5)*.7,vy:(Math.random()-.5)*.7,r})}
function newWave(){wave++;for(let i=0;i<3+wave;i++)addRock(5.5)}
function shoot(){const now=Date.now();if(now-lastShot<180||bullets.length>=5)return;lastShot=now;bullets.push({x:wrap(x+Math.cos(a)*4),y:wrap(y+Math.sin(a)*4),vx:Math.cos(a)*2.5+vx,vy:Math.sin(a)*2.5+vy,t:45});piezo.playSong(Effects.jump)}
function bulletHit(b,r){const rx=delta(r.x,b.x),ry=delta(r.y,b.y),m2=b.vx*b.vx+b.vy*b.vy;let t=m2>0?(rx*b.vx+ry*b.vy)/m2:0;if(t<0)t=0;else if(t>1)t=1;const dx=rx-b.vx*t,dy=ry-b.vy*t,rr=r.r+1;return dx*dx+dy*dy<=rr*rr}
api.dpadHandler=d=>{if(d==="left")a-=.22;else if(d==="right")a+=.22;else if(d==="up"){vx+=Math.cos(a)*.18;vy+=Math.sin(a)*.18}else if(d==="down")shoot()};api.joyClickHandler=shoot;newWave();
while(!api.exitRequested){
const jx=joyX(),jy=joyY();a+=jx*.08;if(jy<-.35){vx+=Math.cos(a)*.08*-jy;vy+=Math.sin(a)*.08*-jy}
vx*=.992;vy*=.992;x=wrap(x+vx);y=wrap(y+vy);if(inv>0)inv--;
for(const r of rocks){r.x=wrap(r.x+r.vx);r.y=wrap(r.y+r.vy)}
const fragments=[];
for(const b of bullets){
if(b.t<=0)continue;
for(const r of rocks){
if(r.r<=0||!bulletHit(b,r))continue;
const oldR=r.r;b.t=0;r.r=0;r.oldR=oldR;score+=Math.round(8-oldR);piezo.playSong(Effects.coin);hits.push({x:r.x,y:r.y,t:0});
break;
}
b.x=wrap(b.x+b.vx);b.y=wrap(b.y+b.vy);b.t--;
}
for(const r of rocks){if(r.r===0&&r.oldR&&r.oldR*.62>2.4){const nr=r.oldR*.62;for(let i=0;i<2;i++)fragments.push({x:r.x,y:r.y,vx:r.vx+(Math.random()-.5)*1.3,vy:r.vy+(Math.random()-.5)*1.3,r:nr})}}
rocks=rocks.filter(r=>r.r>0);for(const f of fragments)rocks.push(f);bullets=bullets.filter(b=>b.t>0);
if(inv===0){for(const r of rocks){const dx=delta(r.x,x),dy=delta(r.y,y);if(dx*dx+dy*dy<(r.r+2)*(r.r+2)){lives--;piezo.playSong(Effects.damage);if(lives<=0){await flashScreen(colors.rgb(80,0,0),2);await gameOverScreen(score);return}x=32;y=32;vx=0;vy=0;inv=55;break}}}
if(!rocks.length)newWave();
display.clear();
for(const r of rocks){const c=r.r>4?colors.rgb(150,80,255):colors.rgb(100,100,180),rr=Math.round(r.r);setPx(Math.round(r.x-rr),Math.round(r.y),c);setPx(Math.round(r.x+rr),Math.round(r.y),c);setPx(Math.round(r.x),Math.round(r.y-rr),c);setPx(Math.round(r.x),Math.round(r.y+rr),c);line(r.x-rr,r.y,r.x,r.y-rr,c);line(r.x,r.y-rr,r.x+rr,r.y,c);line(r.x+rr,r.y,r.x,r.y+rr,c);line(r.x,r.y+rr,r.x-rr,r.y,c)}
for(const h of hits){h.t++;const rr=h.t,c=h.t<2?colors.white:colors.rgb(255,120,0);setPx(Math.round(h.x-rr),Math.round(h.y),c);setPx(Math.round(h.x+rr),Math.round(h.y),c);setPx(Math.round(h.x),Math.round(h.y-rr),c);setPx(Math.round(h.x),Math.round(h.y+rr),c)}hits=hits.filter(h=>h.t<4);
for(const b of bullets)setPx(Math.round(b.x),Math.round(b.y),colors.white);
if(inv===0||inv%6<3){const fx=x+Math.cos(a)*4,fy=y+Math.sin(a)*4,lx=x+Math.cos(a+2.45)*3,ly=y+Math.sin(a+2.45)*3,rx=x+Math.cos(a-2.45)*3,ry=y+Math.sin(a-2.45)*3;line(fx,fy,lx,ly,colors.rgb(0,220,255));line(lx,ly,rx,ry,colors.rgb(0,220,255));line(rx,ry,fx,fy,colors.rgb(0,220,255))}
drawText(1,1,String(score),colors.rgb(70,70,70));for(let i=0;i<lives;i++)setPx(62-i*2,1,colors.red);display.show();await sleep(32)
}
}
