//! name=LIQUID color=0,160,255
async function tmp_default(api){
const{setPx,drawText,drawRect,display,piezo,Effects,sleep,sliderPos,held,mpu,colors}=api;
if(!mpu){display.clear();drawText(7,24,"NO GYRO",colors.red);display.show();piezo.playSong(Effects.error);await sleep(1500);return}
api.dpadHandler=()=>{};
const liquids=[
 {n:"WATER",c:(x,y,t)=>colors.rgb(0,120+Math.floor(35*Math.sin((x+t)/7)),255)},
 {n:"OIL",c:(x,y,t)=>colors.rgb(210,170+Math.floor(30*Math.sin((x+y+t)/9)),20)},
 {n:"LAVA",c:(x,y,t)=>colors.rgb(255,55+Math.floor(80*Math.sin((x*3+y+t)/8)),0)},
 {n:"ACID",c:(x,y,t)=>colors.rgb(60+Math.floor(60*Math.sin((x+t)/5)),255,40)},
 {n:"MILK",c:(x,y,t)=>colors.rgb(220,230,235)},
 {n:"SLIME",c:(x,y,t)=>colors.rgb(30,180+Math.floor(60*Math.sin((y+t)/6)),80)},
 {n:"RAINBOW",c:(x,y,t)=>{const k=(x*5+y*3+t*4)%96;if(k<16)return colors.rgb(255,k*12,0);if(k<32)return colors.rgb(255-(k-16)*12,255,0);if(k<48)return colors.rgb(0,255,(k-32)*12);if(k<64)return colors.rgb(0,255-(k-48)*12,255);if(k<80)return colors.rgb((k-64)*12,0,255);return colors.rgb(255,0,255-(k-80)*12)}}
];
let liq=0,fill=.45,lastS=sliderPos(),shake=0,frame=0,lastUp=false,lastDown=false,lastLeft=false,lastRight=false;
function tap(now,last){return now&&!last}
function clamp(v,a,b){return v<a?a:v>b?b:v}
while(!api.exitRequested){frame++;
 if(tap(held.up,lastUp)){fill=clamp(fill+.08,.03,.97);piezo.playSong(Effects.menuMove)}
 if(tap(held.down,lastDown)){fill=clamp(fill-.08,.03,.97);piezo.playSong(Effects.menuMove)}
 if(tap(held.right,lastRight)){liq=(liq+1)%liquids.length;shake=8;piezo.playSong(Effects.menuSelect)}
 if(tap(held.left,lastLeft)){liq=(liq+liquids.length-1)%liquids.length;shake=8;piezo.playSong(Effects.menuSelect)}
 lastUp=held.up;lastDown=held.down;lastLeft=held.left;lastRight=held.right;
 const s=sliderPos();const sd=s-lastS;lastS=s;if(Math.abs(sd)>.18){shake=Math.min(24,shake+Math.floor(Math.abs(sd)*70));piezo.playSong(Effects.menuMove)}
 const acc=mpu.getAcceleration();let gx=-acc[1],gy=-acc[0]; // Y axis inverted so liquid falls to the real bottom when held normallyconst gl=Math.sqrt(gx*gx+gy*gy);if(gl>.05){gx/=gl;gy/=gl}else{gx=0;gy=1}
 display.clear();
 drawText(1,1,liquids[liq].n,colors.white);drawText(42,1,String(Math.round(fill*100)),colors.rgb(130,130,130));
 const x0=5,y0=9,w=54,h=52,cx=x0+w/2,cy=y0+h/2;
 drawRect(x0-1,y0-1,w+2,1,colors.rgb(110,110,110));drawRect(x0-1,y0+h,w+2,1,colors.rgb(110,110,110));drawRect(x0-1,y0-1,1,h+2,colors.rgb(110,110,110));drawRect(x0+w,y0-1,1,h+2,colors.rgb(110,110,110));
 const max=Math.abs(gx)*w/2+Math.abs(gy)*h/2;let th=max*(1-fill*2);
 const wave=shake>0?shake*.12:0;
 for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){
   let v=(x-cx)*gx+(y-cy)*gy;
   if(shake>0)v+=Math.sin((x*0.55+y*0.2+frame)*0.55)*wave+((Math.random()-.5)*shake*.15);
   if(v>th){setPx(x,y,liquids[liq].c(x,y,frame));if(shake>10&&Math.random()<.018)setPx(x,y,colors.white)}
 }
 if(shake>0){for(let i=0;i<shake;i++){const bx=x0+Math.floor(Math.random()*w),by=y0+Math.floor(Math.random()*h);setPx(bx,by,colors.white)}shake--}
 const px=x0+Math.floor(fill*w);for(let i=0;i<fill*w;i++)setPx(x0+i,63,liquids[liq].c(i,0,frame));
 display.show();await sleep(35)
}
}
export{tmp_default as default};
