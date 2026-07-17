//! name=TANKS color=80,220,100
async function run(api){
 const {display,colors,drawRect,drawText,setPx,sleep,piezo,Effects,joyX,joyY,held,gameOverScreen}=api;
 let p={x:10,y:52,a:0,hp:3}, enemies=[],shots=[],score=0,lastSpawn=0,lastShot=0;
 function spawn(){let side=Math.floor(Math.random()*3),x=side===0?3:side===1?60:3+Math.random()*57,y=side===2?3:3+Math.random()*35;enemies.push({x,y,hp:2,cd:25+Math.random()*25})}
 function fire(from,enemy){let sp=enemy?0.85:1.7;shots.push({x:from.x,y:from.y,vx:Math.cos(from.a)*sp,vy:Math.sin(from.a)*sp,enemy,life:90});try{piezo.playSong(Effects.laser||Effects.menuSelect)}catch(e){}}
 api.joyClickHandler=()=>{if(Date.now()-lastShot>240){fire(p,false);lastShot=Date.now()}};
 api.dpadHandler=d=>{if(d==='right'&&Date.now()-lastShot>240){fire(p,false);lastShot=Date.now()}};
 while(!api.exitRequested){let now=Date.now(),jx=joyX(),jy=joyY();let mx=(held.right?1:0)-(held.left?1:0)+jx,my=(held.down?1:0)-(held.up?1:0)+jy;if(Math.abs(mx)+Math.abs(my)>.2){let len=Math.sqrt(mx*mx+my*my);p.x+=mx/len*.75;p.y+=my/len*.75;p.a=Math.atan2(my,mx)}p.x=Math.max(3,Math.min(61,p.x));p.y=Math.max(9,Math.min(61,p.y));
 if(now-lastSpawn>1300&&enemies.length<7){spawn();lastSpawn=now}
 for(const e of enemies){let dx=p.x-e.x,dy=p.y-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;e.a=Math.atan2(dy,dx);if(d>12){e.x+=dx/d*.22;e.y+=dy/d*.22}e.cd--;if(e.cd<=0&&d<48){fire(e,true);e.cd=45+Math.random()*35}}
 for(const s of shots){s.x+=s.vx;s.y+=s.vy;s.life--;if(s.x<1||s.x>63){s.vx*=-1;s.life-=12}if(s.y<8||s.y>63){s.vy*=-1;s.life-=12}}
 for(const s of shots){if(s.life<=0)continue;if(s.enemy){if((s.x-p.x)**2+(s.y-p.y)**2<10){s.life=0;p.hp--;try{piezo.playSong(Effects.error)}catch(e){}if(p.hp<=0){await gameOverScreen(score);return}}}else for(const e of enemies){if(e.hp>0&&(s.x-e.x)**2+(s.y-e.y)**2<12){s.life=0;e.hp--;if(e.hp<=0){score+=10;try{piezo.playSong(Effects.coin)}catch(x){}}break}}}
 shots=shots.filter(s=>s.life>0);enemies=enemies.filter(e=>e.hp>0);
 display.clear();drawRect(0,0,64,7,colors.rgb(15,25,35));drawText(1,1,'S'+score,colors.white);drawText(43,1,'HP'+p.hp,colors.green);
 for(let x=0;x<64;x+=8)setPx(x,8,colors.rgb(35,70,50));
 for(const s of shots)drawRect(s.x-1,s.y-1,2,2,s.enemy?colors.red:colors.yellow);
 for(const e of enemies){drawRect(e.x-3,e.y-3,7,7,colors.rgb(180,60,40));setPx(e.x+Math.cos(e.a)*5,e.y+Math.sin(e.a)*5,colors.white)}
 drawRect(p.x-3,p.y-3,7,7,colors.rgb(30,220,100));for(let i=0;i<6;i++)setPx(p.x+Math.cos(p.a)*i,p.y+Math.sin(p.a)*i,colors.white);
 display.show();await sleep(35);
 }
}
export default run;
