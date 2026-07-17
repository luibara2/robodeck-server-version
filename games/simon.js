//! name=SIMON color=255,220,0
export default async function(api){
const{drawRect,display,piezo,Effects,sleep,gameOverScreen,flashScreen,colors}=api;
const pads=[
{dir:"up",x:20,y:0,color:colors.red,dim:colors.rgb(40,0,0),tone:262},
{dir:"right",x:40,y:20,color:colors.green,dim:colors.rgb(0,40,0),tone:330},
{dir:"down",x:20,y:40,color:colors.blue,dim:colors.rgb(0,0,40),tone:392},
{dir:"left",x:0,y:20,color:colors.yellow,dim:colors.rgb(40,40,0),tone:523}
];
function draw(lit){display.clear();for(let i=0;i<4;i++)drawRect(pads[i].x,pads[i].y,24,24,i===lit?pads[i].color:pads[i].dim);display.show()}
async function flash(i,ms){draw(i);await piezo.playNote([pads[i].tone,ms]);draw(-1);await sleep(80)}
const seq=[];
let round=0;
while(!api.exitRequested){
seq.push(Math.floor(Math.random()*4));round++;draw(-1);await sleep(500);
for(const s of seq){if(api.exitRequested)return;await flash(s,300)}
for(let i=0;i<seq.length;i++){
let pressed=-1;
api.dpadHandler=d=>{const n=pads.findIndex(p=>p.dir===d);if(n>=0)pressed=n};
while(pressed<0&&!api.exitRequested)await sleep(20);
api.dpadHandler=()=>{};
if(api.exitRequested)return;
await flash(pressed,200);
if(pressed!==seq[i]){await flashScreen(colors.rgb(80,0,0),2);await gameOverScreen(round-1);return}
}
piezo.playSong(Effects.upgrade);await sleep(400)
}
}
