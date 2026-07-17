//! name=TETRI color=0,200,255
export default async function(api){
const{drawText,drawRect,display,piezo,Effects,sleep,gameOverScreen,joyX,joyY,colors}=api;
const W=10,H=20,OX=17,OY=2;
const shapes=[
[[[0,1],[1,1],[2,1],[3,1]],[[2,0],[2,1],[2,2],[2,3]]],
[[[1,0],[2,0],[1,1],[2,1]]],
[[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[2,1],[1,2]],[[1,0],[0,1],[1,1],[1,2]]],
[[[0,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[0,2],[1,2]]],
[[[2,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,1],[0,2]],[[0,0],[1,0],[1,1],[1,2]]],
[[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]]],
[[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]]]
];
const cols=[colors.rgb(0,220,255),colors.yellow,colors.rgb(180,80,255),colors.rgb(255,140,0),colors.blue,colors.green,colors.red];
let board=Array.from({length:H},()=>Array(W).fill(-1)),piece=null,next=Math.floor(Math.random()*7),score=0,lines=0,dropAt=Date.now()+650,lastJoy=0,lastJDir="";
function spawn(){piece={t:next,r:0,x:3,y:-1};next=Math.floor(Math.random()*7);if(!valid(piece.x,piece.y,piece.r))return false;return true}
function cells(p=piece,r=p.r){return shapes[p.t][r%shapes[p.t].length]}
function valid(nx,ny,nr){for(const c of cells(piece,nr)){const x=nx+c[0],y=ny+c[1];if(x<0||x>=W||y>=H)return false;if(y>=0&&board[y][x]>=0)return false}return true}
function move(dx,dy){if(valid(piece.x+dx,piece.y+dy,piece.r)){piece.x+=dx;piece.y+=dy;return true}return false}
function rotate(){const nr=(piece.r+1)%shapes[piece.t].length;if(valid(piece.x,piece.y,nr))piece.r=nr;else if(valid(piece.x-1,piece.y,nr)){piece.x--;piece.r=nr}else if(valid(piece.x+1,piece.y,nr)){piece.x++;piece.r=nr}}
function lock(){for(const c of cells()){const x=piece.x+c[0],y=piece.y+c[1];if(y>=0)board[y][x]=piece.t}let cleared=0;for(let y=H-1;y>=0;y--)if(board[y].every(v=>v>=0)){board.splice(y,1);board.unshift(Array(W).fill(-1));cleared++;y++}if(cleared){const pts=[0,100,300,500,800][cleared];score+=pts*(1+Math.floor(lines/10));lines+=cleared;piezo.playSong(Effects.upgrade)}else piezo.playSong(Effects.menuMove);return spawn()}
function hard(){let d=0;while(move(0,1))d++;score+=d*2;if(!lock())return false;dropAt=Date.now()+Math.max(140,650-Math.floor(lines/10)*55);return true}
api.dpadHandler=d=>{if(d==="left")move(-1,0);else if(d==="right")move(1,0);else if(d==="up")rotate();else if(d==="down"){if(move(0,1))score++}};api.joyClickHandler=()=>{if(piece)piece.hard=true};
if(!spawn()){await gameOverScreen(0);return}
while(!api.exitRequested){
const now=Date.now(),jx=joyX(),jy=joyY();let jd="";if(Math.abs(jx)>.65||Math.abs(jy)>.65)jd=Math.abs(jx)>Math.abs(jy)?(jx>0?"r":"l"):(jy>0?"d":"u");if(jd&&(jd!==lastJDir||now-lastJoy>170)){if(jd==="l")move(-1,0);else if(jd==="r")move(1,0);else if(jd==="u")rotate();else if(jd==="d")move(0,1);lastJoy=now}lastJDir=jd;
if(piece.hard){piece.hard=false;if(!hard()){await gameOverScreen(score);return}}
if(now>=dropAt){if(!move(0,1)&&!lock()){await gameOverScreen(score);return}dropAt=now+Math.max(140,650-Math.floor(lines/10)*55)}
display.clear();
for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(board[y][x]>=0)drawRect(OX+x*3,OY+y*3,2,2,cols[board[y][x]]);
for(const c of cells()){const x=piece.x+c[0],y=piece.y+c[1];if(y>=0)drawRect(OX+x*3,OY+y*3,2,2,cols[piece.t])}
for(let y=1;y<63;y++){drawRect(OX-2,y,1,1,colors.rgb(45,45,45));drawRect(OX+30,y,1,1,colors.rgb(45,45,45))}
drawText(1,1,String(Math.floor(score/100)).slice(0,3),colors.rgb(90,90,90));drawText(51,1,String(lines).slice(0,3),colors.rgb(90,90,0));display.show();await sleep(30)
}
}
