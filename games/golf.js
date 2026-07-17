//! name=GOLF color=80,255,140
async function run(api){
 const {display,colors,drawRect,drawText,setPx,sleep,piezo,Effects,joyX,joyY,sliderPos,gameOverScreen}=api;
 let hole=1,strokes=0,total=0,ball,holePos,walls,aim=0,moving=false,vx=0,vy=0;
 function newHole(){ball={x:8,y:54};holePos={x:48+Math.random()*10,y:12+Math.random()*22};walls=[];for(let i=0;i<2+Math.floor(hole/2);i++)walls.push({x:14+Math.random()*38,y:12+Math.random()*35,w:4+Math.random()*10,h:3+Math.random()*8});moving=false;vx=vy=0}
 newHole();
 function shoot(){if(moving)return;let power=.7+sliderPos()*2.2;vx=Math.cos(aim)*power;vy=Math.sin(aim)*power;moving=true;strokes++;try{piezo.playSong(Effects.menuSelect)}catch(e){}}
 api.joyClickHandler=shoot;api.dpadHandler=d=>{if(d==='right')shoot();else if(d==='left')aim-=.2;else if(d==='up')aim-=.12;else if(d==='down')aim+=.12};
 while(!api.exitRequested){if(!moving){let jx=joyX(),jy=joyY();if(Math.abs(jx)+Math.abs(jy)>.25)aim=Math.atan2(jy,jx)}else{let nx=ball.x+vx,ny=ball.y+vy;if(nx<2||nx>62){vx*=-.75;nx=ball.x+vx}if(ny<9||ny>62){vy*=-.75;ny=ball.y+vy}for(const r of walls){if(nx>r.x&&nx<r.x+r.w&&ny>r.y&&ny<r.y+r.h){let fromX=ball.x<=r.x||ball.x>=r.x+r.w;if(fromX)vx*=-.75;else vy*=-.75;nx=ball.x+vx;ny=ball.y+vy}}ball.x=nx;ball.y=ny;vx*=.965;vy*=.965;if(vx*vx+vy*vy<.015){moving=false;vx=vy=0}let dx=ball.x-holePos.x,dy=ball.y-holePos.y;if(dx*dx+dy*dy<7&&Math.sqrt(vx*vx+vy*vy)<1.4){total+=strokes;try{piezo.playSong(Effects.win||Effects.coin)}catch(e){}hole++;strokes=0;if(hole>5){await gameOverScreen(Math.max(0,100-total));return}newHole()}}
 display.clear();drawRect(0,0,64,7,colors.rgb(12,45,24));drawText(1,1,'H'+hole,colors.white);drawText(18,1,'S'+strokes,colors.yellow);drawText(38,1,'P'+Math.round(sliderPos()*9+1),colors.rgb(0,220,255));drawRect(0,8,64,56,colors.rgb(15,95,45));
 for(let y=10;y<64;y+=8)for(let x=(y%16?4:0);x<64;x+=8)setPx(x,y,colors.rgb(25,120,55));
 drawRect(holePos.x-3,holePos.y-2,6,4,colors.rgb(5,20,5));setPx(holePos.x,holePos.y-8,colors.white);for(let y=holePos.y-8;y<holePos.y;y++)setPx(holePos.x,y,colors.white);drawRect(holePos.x+1,holePos.y-8,5,3,colors.red);
 for(const r of walls)drawRect(r.x,r.y,r.w,r.h,colors.rgb(70,65,55));
 drawRect(ball.x-2,ball.y-2,4,4,colors.white);if(!moving)for(let i=4;i<15;i+=2)setPx(ball.x+Math.cos(aim)*i,ball.y+Math.sin(aim)*i,colors.yellow);
 display.show();await sleep(35);
 }
}
export default run;
