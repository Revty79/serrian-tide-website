/** Original regional ink-and-wash subjects, extending the independently approved third study.
 * All contours, structures and texture marks are project-authored; no imported/traced artwork.
 */
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";

const f=(n:number)=>Number(n.toFixed(2));
const line=(d:string,color="#68735e",width=.8,opacity=.7)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape=(d:string,fill:string,width=1)=>`<path d="${d}" fill="${fill}" stroke="#707760" stroke-width="${width}" stroke-linejoin="round"/>`;
const svg=(box:string,body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>\n`;
function random(seed:number){let s=seed;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function ground(w:number,seed=1){const r=random(seed);let marks="";for(let i=0;i<20;i++){const x=-w+r()*w*2,y=12+r()*15;marks+=`M${f(x)} ${f(y)}q${f(3+r()*8)}-${f(1+r()*4)} ${f(8+r()*8)}-${f(r()*2)}`;}return `<path d="M${-w} 14Q${-w*.6} -3 0 8T${w} 15Q${w*.7} 33 0 27T${-w} 14" fill="#9eac87" opacity=".15"/>`+line(marks,"#8b9876",.65,.6);}

function mountain(snow=false){
 const r=random(snow?217:733),masses=snow?[
  {x:-96,y:-137,w:110,h:152,body:"M-201 7-171-31-157-49-141-57-131-84-112-107-108-124-96-137-86-122-84-107-63-82-46-68-38-44-13-19 14 14Q-70 33-119 22-170 29-201 7Z"},
  {x:12,y:-231,w:163,h:252,body:"M-149 20-117-16-108-42-87-54-76-86-50-112-44-137-19-171-7-197 12-231 28-207 34-184 62-155 68-131 91-111 99-85 122-59 131-33 156-10 175 20Q98 42 29 29-72 44-149 20Z"},
 ]:[
  {x:-87,y:-157,w:100,h:171,body:"M-176 8-150-18-143-38-124-43-122-66-102-83-102-107-87-157-76-138-76-112-52-100-55-80-29-64-32-41-12-26 16 15Q-70 32-120 22-155 30-176 8Z"},
  {x:18,y:-217,w:137,h:240,body:"M-107 21-89-7-88-32-65-43-68-69-39-84-41-108-19-131-14-159 10-176 18-217 31-198 29-174 52-163 50-138 75-116 73-88 99-72 103-42 128-17 155 22Q77 40 21 29-48 40-107 21Z"},
 ];let body=ground(snow?205:170,97);
 for(const m of masses){body+=shape(m.body,"#c7cbb6",1.15);body+=`<path d="M${m.x} ${m.y}l${f(m.w*.03)} ${f(m.h*.24)}-${f(m.w*.09)} ${f(m.h*.12)} ${f(m.w*.16)} ${f(m.h*.18)}-${f(m.w*.02)} ${f(m.h*.15)} ${f(m.w*.25)} ${f(m.h*.34)}Q${m.x+m.w*.7} 35 ${m.x+m.w} 20L${m.x+m.w*.55} ${f(m.y+m.h*.5)}Z" fill="#80968a" opacity=".49"/>`;
  body+=line(`M${m.x} ${m.y}l-10 ${m.h*.18} 6 14-18 19 3 14-20 23 3 16-24 25m56-78 17 14-2 20 20 19-3 17 21 20m-66-54-19 11-7 23m51-19 19 8 13 27`,"#64735f",1,.85);
  let hatch="";for(let i=0;i<110;i++){const t=.35+r()*.58,side=i%4?1:-1,x=m.x+side*m.w*t*(.04+r()*.47),y=m.y+m.h*t;hatch+=`M${f(x)} ${f(y)}q${f(side*(1+r()*3))} ${f(2+r()*3)} ${f(side*(3+r()*5))} ${f(4+r()*9)}`;}body+=line(hatch,"#66765f",.55,.42);
  if(snow)body+=shape(`M${m.x} ${m.y}l${m.w*.12} ${m.h*.15} ${m.w*.06} ${m.h*.08}-${m.w*.13}-${m.h*.04}-${m.w*.07} ${m.h*.07}-${m.w*.06}-${m.h*.06}-${m.w*.12} ${m.h*.08} ${m.w*.07}-${m.h*.15}Z`,"#eae9d8",.6);
 }body+=line("M-154 23q37-8 65 1m-39 10q39-9 61-2M-11 35q49-8 85-2m22-4 30-4","#8d997a",.8,.75);
 return svg(snow?"-220 -245 435 290":"-185 -230 360 275",body);
}
function hills(rocky=false){
 const r=random(rocky?340:166);let b=ground(150,382);
 if(!rocky){b+=shape("M-153 13Q-135 2-119-20-104-49-80-53-53-60-29-27-12-4 10 11Q-84 34-153 13Z","#bec6a5",1);b+=shape("M-68 22Q-42 7-21-34 4-79 32-76 61-76 80-36 103 3 151 19Q59 43-68 22Z","#c6ccb0",1);b+='<path d="M30-75Q34-23 70 27L126 23Q81-5 80-36 60-76 30-75Z" fill="#8fa48a" opacity=".42"/>';b+=line("M-129 10Q-102-21-84-29M-18 17Q12-25 30-38M58-25q15 24 45 34","#7c8d6a",.85,.7);}
 else {b+=shape("M-157 14Q-137-7-116-20L-109-40-92-44-77-73-61-58-39-54-20-31-9-8 12 16Q-71 34-157 14Z","#c6c8ac");b+=shape("M-64 23-38-9-26-32-4-42 9-66 28-90 49-81 58-55 76-49 85-25 108-10 152 19Q62 42-64 23Z","#bfc6ac");b+='<path d="M28-90 24-61 38-45 31-24 59 29 110 24 85-25 76-49 58-55 49-81Z" fill="#83998a" opacity=".45"/>';b+=line("M-77-73-78-43-92-25-96-6M28-90 24-61 38-45 31-24 48-6M-4-42-8-21-25 1M58-55 63-31 82-17","#6d7b65",1,.8);for(const [x,y,s] of [[-120,11,12],[-14,20,15],[102,22,17],[135,20,10]])b+=shape(`M${x-s} ${y}l${s*.45}-${s*.8} ${s*.9}-${s*.18} ${s*.65} ${s*.9}-${s} ${s*.3}Z`,"#aab49b",.7);}
 let d="";for(let i=0;i<65;i++){const x=-125+r()*260,y=-12+r()*36;d+=`M${f(x)} ${f(y)}q2-${f(r()*3)} ${f(3+r()*7)}-${f(r()*3)}`;}b+=line(d,"#7e9071",.55,.5);return svg("-165 -105 335 150",b);
}
function broadleaf(){
 const r=random(561);let b=ground(64,18);b+=shape("M-8 5Q-1-31-5-60L-33-80-28-85-4-69 6-120 11-117 6-66 33-88 38-83 9-53 12-3 20 9 2 10Z","#b3a47e",.9);b+=line("M-2 4Q3-35 0-56M7-31 8 3m-17 7-10 5m28-6 9 3","#697456",.8,.8);
 for(const [cx,cy,rx,ry] of [[-33,-85,28,23],[-33,-114,27,24],[0,-139,37,27],[31,-121,30,26],[34,-87,32,23],[0,-100,39,27]]){
  let d="";for(let i=0;i<36;i++){const a=i/36*Math.PI*2,k=.87+r()*.24;d+=`${i?'L':'M'}${f(cx+Math.cos(a)*rx*k)} ${f(cy+Math.sin(a)*ry*k)}`;}b+=shape(d+"Z","#a7b38d",.75);b+=`<path d="M${cx-rx*.8} ${cy+ry*.2}q${rx*.7} ${ry*.75} ${rx*1.55} 0q-${rx*.1} ${ry*.9}-${rx*.8} ${ry*.65}Z" fill="#769164" opacity=".36"/>`;let marks="";for(let i=0;i<30;i++){const a=r()*Math.PI*2,k=Math.sqrt(r())*.8;marks+=`M${f(cx+Math.cos(a)*rx*k)} ${f(cy+Math.sin(a)*ry*k)}q2-3 5-1`;}b+=line(marks,"#687d55",.55,.6);
 }return svg("-75 -175 155 210",b);
}
function coniferTree(x:number,y:number,h:number,w:number,seed:number){
 const r=random(seed);let b=shape(`M${x-3} ${y+6}l1-${h*.65} 4-1 3 ${h*.65}Z`,"#a49d78",.65);
 for(let i=0;i<8;i++){const t=i/7,cx=x+Math.sin(i*.8)*3,cy=y-h+t*h*.85,spread=(.11+t*.83)*w,left=spread*(.88+r()*.17),right=spread*(.88+r()*.21);b+=shape(`M${f(cx)} ${f(cy-15)}q-${f(left*.32)} 12-${f(left)} 26l${f(left*.3)}-2-${f(left*.13)} 5 ${f(left*.51)}-8 1 8 ${f(right*.28)}-6 ${f(right*.67)} 4-${f(right*.18)}-6 ${f(right*.33)} 2q-${f(right*.8)}-12-${f(right*.96)}-23Z`,i%2?"#9aab85":"#a5b18e",.65);b+=line(`M${f(cx)} ${f(cy-10)}q3 16 ${f(right*.81)} 30m-${f(right*.54)}-7 2 5m-${f(right*.25)}-10 1 5`,"#60785b",.65,.65);}
 b+=line(`M${x-5} ${y+8}l-8 4m15-4 9 3m-23 3 13 1`,"#849571",.65,.75);return b;
}
function conifer(grove=false){let b=ground(grove?140:60,13);const trees=grove?[[-83,0,116,35],[-24,-10,161,43],[71,8,133,40],[12,27,120,35]]:[[0,4,158,44]];for(const [i,[x,y,h,w]] of trees.entries())b+=coniferTree(x,y,h,w,83+i*71);return svg(grove?"-150 -190 310 240":"-65 -175 135 210",b);}
function cottage(x:number,y:number,w:number,h:number,roof:number,seed:number){
 const r=random(seed),side=10;let b=shape(`M${x+w} ${y}l${side}-7v-${h}l-${side} 7Z`,"#b6b396",.75)+shape(`M${x} ${y}v-${h}l${w/2}-${roof} ${w/2} ${roof}v${h}Z`,"#e1d7b8",.8);
 b+=shape(`M${x-3} ${y-h}l${w/2+3}-${roof+2} ${side}-7-${w/2+3} ${roof+2}Z`,"#b19773",.7)+shape(`M${x+w/2} ${y-h-roof-2}l${side}-7 ${w/2+4} ${roof+2}-${side} 7Z`,"#867f64",.7);
 b+=shape(`M${x+w*.4} ${y}v-10q4-4 7 0v10Z`,"#82856c",.5);b+=line(`M${x+4} ${y-h+6}h4v5h-4Z M${x+w-7} ${y-h+9}h4v5h-4Z`,"#69735b",.6,.9);let marks="";for(let i=0;i<16;i++)marks+=`M${f(x+3+r()*(w-6))} ${f(y-h+3+r()*(h-6))}h${f(2+r()*4)}`;b+=line(marks,"#969d7b",.5,.6);return b;
}
function village(){let b=ground(130,76);b+='<path d="M-14 39Q-4 6 18-20T39-58M8 2Q-27 11-65-1" fill="none" stroke="#d7cfad" stroke-width="9"/>';for(const [i,[x,y,w,h,r]]of [[-91,3,31,29,20],[-42,-16,28,35,19],[17,-38,35,33,22],[61,-2,31,29,18],[-7,22,39,39,24]].entries())b+=cottage(x,y,w,h,r,81+i);b+=line("M-105 24l22-3m-12 10 15-2m132 3 23-5M-15 41l-4 13m8-10-3 12M83 16l12 3m-6-7 13 3","#87916f",.8,.75);return svg("-145 -125 310 195",b);}
function port(){let b=ground(150,132);b+=shape("M-140 20-85-3-30 4 17-16 81-9 127 16 117 25 75 6 19-1-27 19-82 10-136 31Z","#c2baa0",1);for(const [i,[x,y,w,h,r]]of [[-107,-8,32,36,19],[-61,-28,38,35,21],[-6,-21,45,42,22],[65,-16,36,35,20]].entries())b+=cottage(x,y,w,h,r,191+i);
 for(const [x,y,len]of [[-100,22,41],[-25,18,57],[76,16,42]]){b+=shape(`M${x} ${y}l12-5 14 ${len}-12 5Z`,"#b4a383",.8);let boards="";for(let i=5;i<len;i+=6)boards+=`M${x+f(i*.25)} ${y+i}l12-5`;b+=line(boards,"#777e65",.6,.75);}
 b+=shape("M12 44Q32 49 54 37L48 48Q29 62 12 44Z","#b0a47d",.8);b+=line("M31 47v-55m0 2L7 36l23-6m3-34 19 36-19-4M-140 40q19 6 36-1m90 24q24 8 44-1m47-9q25 8 45-1","#7f9a94",.8,.85);return svg("-155 -145 325 240",b);}
function castle(){let b=ground(150,84);b+=shape("M-114 8-79-37 9-58 94-24 121 17 56 40-32 36Z","#c7c3a6",1);b+=cottage(-33,-18,63,77,27,341);
 for(const [x,y,w,h]of [[-105,12,32,74],[72,16,35,85],[-68,-33,25,64],[48,-36,25,64]]){b+=shape(`M${x} ${y}v-${h}l${w}-9v${h}l-${w} 9Z`,"#c5c4a9",.9);b+=shape(`M${x} ${y-h}v-10h7v6h7v-9h8v6h${w-22}v8Z`,"#ded6b8",.8);b+=line(`M${x+8} ${y-h+15}v10m${w-18}-13v10M${x+6} ${y-15}h${w-11}m-${w-17}-9h${w-9}M${x+w-6} ${y-h+7}v${h-13}`,"#7b846b",.7,.85);}
 b+=shape("M-102 18-44 24-5 20 53 29 91 19 97 32 56 48 8 41-36 44-98 32Z","#ccc6a5",1);b+=shape("M-8 40v-14q12-19 22-1v19Z","#77806a",.8);b+=line("M-14 42v-19q17-27 33 0v23M-84 29h21m9 7h17m65 1h19m11 4h23M8-121v-30l25 7-25 5","#6c795f",.8,.85);return svg("-160 -165 325 235",b);}
function wetland(){const r=random(572);let b=ground(130,194);b+='<path d="M-127 11Q-71-7-31 9T115 13L97 29Q46 23 3 34T-115 27Z" fill="#9fb9aa" opacity=".24"/>';let reeds="";for(let i=0;i<10;i++){const x=-108+i*23+r()*9,y=7+r()*17,h=34+r()*35;reeds+=`M${f(x)} ${f(y)}q7-${f(h*.6)} 1-${f(h)}m-1 22q-6-17-17-22m17 30q9-19 21-21M${f(x-7)} ${f(y+1)}q-2-21-10-35`;b+=`<path d="M${f(x+1)} ${f(y-h+6)}q-5-3-3-12 4-8 6-1 2 9-3 13Z" fill="#9b9670"/>`;}b+=line(reeds,"#77885f",.85,.85);b+=line("M-123 29q20-4 37 0m12 7q25-4 45-1m14-8q23 6 46 0m9 7q30-6 58-1M-61 17q21 5 33 0m29 3q27-3 47 0","#7f9f96",.75,.8);return svg("-145 -90 300 140",b);}

export const additionalIslandSubjects=[
 {id:"mountain-craggy",svg:mountain()}, {id:"mountain-snow-capped",svg:mountain(true)},
 {id:"hill-low",svg:hills()}, {id:"hill-rocky",svg:hills(true)},
 {id:"woodland-broadleaf-tree",svg:broadleaf()}, {id:"woodland-conifer-tree",svg:conifer()}, {id:"woodland-conifer-grove",svg:conifer(true)},
 {id:"settlement-village",svg:village()}, {id:"settlement-port",svg:port()}, {id:"settlement-castle",svg:castle()}, {id:"wetland-reeds",svg:wetland()},
];
async function main(){for(const subject of additionalIslandSubjects){const file=`public/cartography/serrian-atlas-island/1/${subject.id}-1.svg`;try{assert.equal((await readFile(file,"utf8")).replaceAll("\r\n","\n"),subject.svg,"Never replace published source; append a revision");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;await writeFile(file,subject.svg);}}console.log(`Verified ${additionalIslandSubjects.length} original additional subjects; existing artwork files retained.`);}
if(process.argv[1]?.endsWith("worlds-ux0a-library-subjects.ts"))main().catch(e=>{console.error(e);process.exitCode=1;});
