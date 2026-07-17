//! name=PHOTO color=255,80,200
export default async function(api){
const{setPx,drawText,display,sleep,joyX,held,colors,udpRequest}=api;
let items=[];
let index=0;
let nav=0;
let joyArmed=true;
let buttonPrev={up:!!(held&&held.up),down:!!(held&&held.down),left:!!(held&&held.left),right:!!(held&&held.right)};

const PIXEL_COLORS=new Array(256);
for(let v=0;v<256;v++){
const r=Math.round(((v>>5)&7)*255/7);
const g=Math.round(((v>>2)&7)*255/7);
const b=(v&3)*85;
PIXEL_COLORS[v]=colors.rgb(r,g,b);
}

const B64MAP=new Array(128);
for(let i=0;i<128;i++)B64MAP[i]=-1;
const B64CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
for(let i=0;i<B64CHARS.length;i++)B64MAP[B64CHARS.charCodeAt(i)]=i;
function b64Into(s,out,offset){
let val=0,bits=0,written=0;
for(let i=0;i<s.length;i++){
const code=s.charCodeAt(i);
if(code===61)break;
const n=code<128?B64MAP[code]:-1;
if(n<0)continue;
val=(val<<6)|n;
bits+=6;
if(bits>=8){bits-=8;out[offset+written]=(val>>bits)&255;written++}
}
return written;
}
function u32(a,p){return(a[p]|(a[p+1]<<8)|(a[p+2]<<16)|(a[p+3]<<24))>>>0}
function label(name){return String(name||"IMAGE").toUpperCase().replace(/[^A-Z0-9 ]/g," ").slice(0,10)}
function pixel(pos,v){if(pos>=0&&pos<4096)setPx(pos&63,pos>>6,PIXEL_COLORS[v])}
function loadingScreen(name="",done=0,total=1){
display.clear();
drawText(14,15,"LOADING",colors.rgb(0,200,255));
if(name)drawText(2,27,label(name),colors.white);
const width=Math.max(0,Math.min(60,Math.floor((done/Math.max(1,total))*60)));
for(let x=0;x<60;x++)setPx(2+x,40,x<width?colors.rgb(0,200,255):colors.rgb(30,30,30));
display.show();
}
function noItems(){
display.clear();
drawText(16,20,"NO IMG",colors.rgb(255,80,200));
drawText(12,32,"UPLOAD",colors.rgb(100,100,100));
display.show();
}
function errorScreen(text){
display.clear();
drawText(4,24,text,colors.red);
display.show();
}
function installControls(){
api.dpadHandler=(d)=>{
if(d==="left"||d==="right"||d==="up"||d==="down")buttonPrev[d]=true;
if(d==="left"||d==="up")nav=-1;
else if(d==="right"||d==="down")nav=1;
};
api.joyClickHandler=()=>{nav=1};
}
async function request(obj,tries=3,timeoutMs=1800){
for(let i=0;i<tries&&!api.exitRequested;i++){
// Some loader/network paths can replace the active callbacks. Restore them
// before and after every request so D-pad navigation stays available.
installControls();
const r=await udpRequest(obj,timeoutMs);
installControls();
if(r)return r;
}
return null;
}
function pollJoy(){
const x=joyX();
if(Math.abs(x)<.25)joyArmed=true;
if(joyArmed&&x>.55){joyArmed=false;nav=1}
else if(joyArmed&&x<-.55){joyArmed=false;nav=-1}
}
function pollButtons(){
if(!held)return;
const now={up:!!held.up,down:!!held.down,left:!!held.left,right:!!held.right};
// LEFT+RIGHT is reserved globally for leaving the game.
if(!(now.left&&now.right)){
if((now.left&&!buttonPrev.left)||(now.up&&!buttonPrev.up))nav=-1;
else if((now.right&&!buttonPrev.right)||(now.down&&!buttonPrev.down))nav=1;
}
buttonPrev=now;
}
function pollControls(){pollButtons();pollJoy()}
async function waitUntilNavigation(){
installControls();
while(!api.exitRequested&&nav===0){pollControls();await sleep(20)}
}
async function waitUntil(deadline){
installControls();
while(!api.exitRequested&&nav===0){
pollControls();
const remaining=deadline-Date.now();
if(remaining<=0){
// Always yield at least once. Without this, a fast/late GIF can spin through
// frames and starve timer callbacks, leaving a piezo note sounding forever.
await sleep(1);
return true;
}
await sleep(Math.max(1,Math.min(5,remaining)));
}
return false;
}

function parseBundle(data){
if(!data||data.length<8||data[0]!==82||data[1]!==71||data[2]!==70||data[3]!==49)return null;
const count=u32(data,4);
if(count<1||count>100000)return null;
const frames=[];
let pos=8;
for(let i=0;i<count;i++){
if(pos+9>data.length)return null;
const durationMs=Math.max(1,u32(data,pos));
const format=data[pos+4];
const length=u32(data,pos+5);
pos+=9;
if(format>2||length>data.length-pos)return null;
frames.push({durationMs,format,offset:pos,length});
pos+=length;
}
if(pos!==data.length)return null;
return{data,frames};
}

async function downloadItem(itemIndex){
nav=0;
const item=items[itemIndex];
loadingScreen(item.name,0,1);
const meta=await request({t:"gibundleopen",index:itemIndex});
if(!meta||typeof meta.data!=="string"||!Number.isFinite(Number(meta.bundleBytes)))return null;
const totalBytes=Math.floor(Number(meta.bundleBytes));
const chunks=Math.max(1,Math.floor(Number(meta.chunks)||1));
if(totalBytes<8||totalBytes>16*1024*1024)return null;
const bytes=new Uint8Array(totalBytes);
let written=b64Into(meta.data,bytes,0);
loadingScreen(item.name,1,chunks);
for(let i=1;i<chunks&&!api.exitRequested&&nav===0;i++){
const part=await request({t:"gibundlechunk",index:itemIndex,i});
if(!part||typeof part.data!=="string")return null;
written+=b64Into(part.data,bytes,written);
if(i===chunks-1||i%4===0)loadingScreen(item.name,i+1,chunks);
}
if(api.exitRequested||nav!==0||written!==totalBytes)return null;
return parseBundle(bytes);
}

function renderFrame(bundle,frame){
const data=bundle.data;
let p=frame.offset;
const end=p+frame.length;
if(frame.format===0){
if(frame.length!==4096)return false;
display.clear();
for(let i=0;i<4096;i++)pixel(i,data[p+i]);
return true;
}
if(frame.format===1){
display.clear();
let out=0;
while(p<end&&out<4096){
const control=data[p++];
const count=(control&127)+1;
if(control&128){
if(p>=end)return false;
const value=data[p++];
for(let i=0;i<count&&out<4096;i++)pixel(out++,value);
}else{
if(p+count>end)return false;
for(let i=0;i<count&&out<4096;i++)pixel(out++,data[p++]);
}
}
return p===end&&out===4096;
}
if(frame.format===2){
let outPos=0;
while(p<end){
if(p+3>end)return false;
const skip=(data[p]<<8)|data[p+1];
const run=data[p+2];
p+=3;
outPos+=skip;
if(run<1||outPos+run>4096||p+run>end)return false;
for(let i=0;i<run;i++)pixel(outPos++,data[p++]);
}
return p===end&&outPos<=4096;
}
return false;
}

async function showItem(itemIndex){
nav=0;
const bundle=await downloadItem(itemIndex);
if(!bundle){
if(nav===0&&!api.exitRequested){errorScreen("NET ERR");await waitUntilNavigation()}
return;
}
const frames=bundle.frames;
if(frames.length===1){
if(!renderFrame(bundle,frames[0])){errorScreen("BAD IMG");await waitUntilNavigation();return}
display.show();
await waitUntilNavigation();
return;
}

let frameIndex=0;
let deadline=Date.now();
while(!api.exitRequested&&nav===0){
installControls();
const frame=frames[frameIndex];
if(!renderFrame(bundle,frame)){errorScreen("BAD GIF");await waitUntilNavigation();return}
display.show();
deadline+=frame.durationMs;
if(!(await waitUntil(deadline)))return;
frameIndex++;
if(frameIndex>=frames.length){
if(items[itemIndex].loop===false){await waitUntilNavigation();return}
frameIndex=0;
}
}
// bundle and all frame data become unreachable here, so the old GIF can be freed.
}

if(typeof udpRequest!=="function"){
errorScreen("API OLD");
while(!api.exitRequested)await sleep(50);
return;
}
const list=await request({t:"glist"});
items=list&&Array.isArray(list.images)?list.images:[];
installControls();
if(items.length===0){noItems();while(!api.exitRequested){installControls();pollControls();await sleep(25)}return}
while(!api.exitRequested){
installControls();
await showItem(index);
if(api.exitRequested)break;
const delta=nav===0?1:nav;
nav=0;
index=(index+delta+items.length)%items.length;
}
}
