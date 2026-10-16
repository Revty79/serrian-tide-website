/** Original small-subset illustrations for independent visual review, not a promoted library. */
type Pair = [number, number];
const f = (n: number) => Number(n.toFixed(2));
function random(seed: number) { let s=seed; return () => {s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;}; }
function contour(points: Pair[]) {
  const at=(i:number)=>points[(i+points.length)%points.length];
  return `M${points[0].join(" ")}`+points.map((p,i)=>{const a=at(i-1),b=at(i+1),c=at(i+2);return `C${f(p[0]+(b[0]-a[0])*.14)} ${f(p[1]+(b[1]-a[1])*.14)} ${f(b[0]-(c[0]-p[0])*.14)} ${f(b[1]-(c[1]-p[1])*.14)} ${b.join(" ")}`;}).join("")+"Z";
}
const line=(d:string,color="#67715e",width=.8,opacity=.65)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;

export function studyMountain() {
  const rnd=random(239), art:string[]=[];
  art.push('<path d="M-235 19Q-184-8-138 5-90-6-41 6 10-6 63 9 126-5 174 12 219 6 251 27 182 45 128 38 64 51 8 37-60 49-114 34-179 45-235 19Z" fill="#adb294" opacity=".18"/>');
  const masses=[
    {body:"M-218 9Q-195-16-178-48L-159-56-146-84-133-94-120-127-103-145-97-131-84-120-72-91-57-83-31-39Q-8-13 12 13-55 28-108 19-168 31-218 9Z",shade:"M-103-145-100-106-114-89-98-73-102-51-87-31-76 17Q-32 24 12 13-24-23-57-83L-72-91-84-120-97-131Z",ridge:"M-103-145Q-110-118-120-103L-114-89-130-63Q-138-48-157-31M-114-89-98-73-102-51-87-31-76 17M-146-84Q-145-61-167-45L-174-21M-98-73-75-59-63-31M-130-63-117-39-122-16",fill:"#c5c7ad",x:-105,top:-145,w:112,h:155},
    {body:"M-126 19Q-105-7-94-30L-77-41-63-69-67-79-43-108-36-127-16-151-19-165 5-198 14-211 27-193 27-180 49-151 59-142 62-123 84-102 90-82 107-70 120-41Q142-13 165 18 114 39 64 28 14 42-36 29-84 39-126 19Z",shade:"M14-211 16-179 6-163 19-149 10-127 30-106 24-89 47-67 43-43 64-20 74 30Q122 35 165 18 137-7 120-41L107-70 90-82 84-102 62-123 59-142 49-151 27-180 27-193Z",ridge:"M14-211 6-188-3-177 6-163-10-143-8-125-28-108-26-90-48-65-49-46-69-28M6-163 19-149 10-127 30-106 24-89 47-67 43-43 64-20 74 30M-8-125 4-107-2-89 11-65-1-38M30-106 52-96 61-70 79-57 91-28M47-67 66-66 78-43 102-24M-43-108-43-87-63-69-65-45-83-26M24-89 13-74 24-57 20-36 35-16",fill:"#c4c6b2",x:14,top:-211,w:141,h:237},
    {body:"M87 23Q112-4 121-29L140-47 151-75 169-88 173-102 185-116 195-108 200-93 217-78 223-59 237-46 244-25Q254-4 273 19 236 37 195 28 143 39 87 23Z",shade:"M185-116 184-92 176-78 186-59 184-43 198-20 201 30Q241 35 273 19 253-6 244-25L237-46 223-59 217-78 200-93 195-108Z",ridge:"M185-116 176-99 176-78 162-61 151-48 143-28M176-78 186-59 184-43 198-20 201 30M186-59 204-54 214-30 232-14M151-75 148-59 135-43 127-22",fill:"#cbd0b5",x:185,top:-116,w:90,h:149},
  ];
  for(const [index,m] of masses.entries()) {
    art.push(`<path d="${m.body}" fill="${m.fill}" stroke="#737760" stroke-width="1.25" stroke-linejoin="round"/>`);
    art.push(`<path d="${m.shade}" fill="#80968a" opacity=".56"/>`);
    // Broken translucent washes follow the slopes rather than making one flat triangular face.
    for(let i=0;i<9;i++) {const t=.32+rnd()*.56,x=m.x+(rnd()-.32)*m.w*t,y=m.top+m.h*t,wide=8+rnd()*17;art.push(`<path d="M${f(x)} ${f(y)}q${f(wide*.5)} ${f(-wide*.3)} ${f(wide)} ${f(wide*.4)}l${f(wide*.6)} ${f(18+rnd()*24)}q${f(-wide)} 5 ${f(-wide*1.3)}-5Z" fill="${i%3?"#8b9c84":"#d7d5ba"}" opacity="${f(.08+rnd()*.13)}"/>`);}
    art.push(line(m.ridge,"#636e5c",1.05,.8));
    let hatches="";
    for(let i=0;i<132;i++){const t=.33+rnd()*.58,side=i%4?1:-1,x=m.x+side*m.w*t*(.08+rnd()*.43),y=m.top+m.h*t,len=3+rnd()*9;hatches+=`M${f(x)} ${f(y)}q${f(side*(1+rnd()*3))} ${f(len*.35)} ${f(side*(3+rnd()*5))} ${f(len)}`;}
    art.push(line(hatches,"#69765f",.55,.43));
    if(index===1)art.push('<path d="M14-211 6-188-3-177 6-181 9-175 15-184 22-178 21-190 27-193Z" fill="#ece8d3" stroke="#8b927b" stroke-width=".55"/>');
  }
  art.push('<path d="M-236 25Q-211 10-191 13-174-5-150 6-131 18-115 25M-160 33Q-123 14-93 27-63 18-43 35M80 35Q112 17 135 26-14 5-24 20M136 41Q159 26 184 35-5-13 17-19M207 37Q233 25 261 31" fill="none" stroke="#889479" stroke-width=".9" opacity=".7"/>');
  art.push(line("M-238 32q22 6 43 1m20 5q29 9 55 2m15 4q30 4 52-1M-10 43q30 7 59 0m26 2q26 7 51 0m41-2q20 4 38-1m17-4q23 4 43-1","#9b9e7d",.7,.8));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-250 -225 535 280">${art.join("")}</svg>\n`;
}

export function studyWoodland(footprint=0) {
  const rnd=random(981+footprint*79),art:string[]=[];
  art.push('<path d="M-142 17Q-122-1-85 6-55-9-24 2 7-6 29 7 49-7 76 6 107-1 134 20 98 29 62 25 36 40 2 29-33 36-59 25-109 34-142 17Z" fill="#9eac7c" opacity=".16"/>');
  const trees=footprint?[{x:-98,y:5,h:86,w:36,lean:-15},{x:-16,y:-2,h:124,w:54,lean:-18},{x:78,y:28,h:145,w:34,lean:15}]:[{x:-80,y:0,h:111,w:46,lean:-8},{x:33,y:-6,h:164,w:49,lean:8},{x:99,y:19,h:100,w:35,lean:5},{x:-18,y:31,h:139,w:56,lean:-9}];
  for(const [index,t] of trees.entries()) {
    const {x,y,h,w,lean}=t, top=y-h;
    art.push(`<path d="M${x-6} ${y}q6 ${f(-h*.24)} 2 ${f(-h*.44)}l${f(-w*.61)} ${f(-h*.2)} 3-5 ${f(w*.64)} ${f(h*.14)} ${f(lean)} ${f(-h*.28)} 4-1 ${f(-lean+4)} ${f(h*.31)} ${f(w*.55)} ${f(-h*.19)} 5 4 ${f(-w*.56)} ${f(h*.28)} 2 ${f(h*.28)} 7 8q-9 4-13-1Z" fill="#b1a47c" stroke="#656f50" stroke-width=".9"/>`);
    art.push(line(`M${x-2} ${y-3}q4 ${f(-h*.18)} 1 ${f(-h*.36)}m6 ${f(h*.1)}l-2 ${f(h*.24)}M${x-5} ${y-1}l-8 5m14-4 8 3`,"#617053",.7,.8));
    // Unequal lateral boughs leave open branch windows and an asymmetric woodland edge.
    const boughs=[[-.62,.48,.52,.16],[-.84,.34,.52,.15],[-.25,.18,.64,.24],[.46,.20,.54,.20],[.83,.39,.53,.19],[.13,.43,.67,.20]];
    for(const [bi,[dx,dy,sx,sy]] of boughs.entries()) {
      const cx=x+lean+dx*w,cy=top+dy*h,rx=w*sx,ry=h*sy,points:Pair[]=[];
      for(let i=0;i<34;i++){const a=i/34*Math.PI*2,r=.86+rnd()*.27,notch=i%3===0?.86:1;points.push([f(cx+Math.cos(a)*rx*r*notch),f(cy+Math.sin(a)*ry*r*notch)]);}
      const colors=["#a5af87","#b0b893","#a4b28b","#9eac80"];
      art.push(`<path d="${contour(points)}" fill="${colors[index]}" stroke="#687851" stroke-width=".75"/>`);
      art.push(`<path d="M${f(cx-rx*.9)} ${f(cy+ry*.2)}q${f(rx*.4)} ${f(ry*.5)} ${f(rx*.9)} ${f(ry*.22)}t${f(rx*.87)} ${f(-ry*.11)}q${f(-rx*.15)} ${f(ry*.6)} ${f(-rx*.74)} ${f(ry*.46)}t${f(-rx)} ${f(-ry*.57)}Z" fill="#748e63" opacity=".39"/>`);
      let leaves="",lit="";
      for(let j=0;j<34;j++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*.78,px=cx+Math.cos(a)*rx*r,py=cy+Math.sin(a)*ry*r;const mark=`M${f(px)} ${f(py)}q${f(1+rnd()*2)}-${f(1+rnd()*3)} ${f(3+rnd()*3)}-${f(rnd()*2)}l${f(1+rnd()*2)} ${f(1+rnd()*2)}`;if(j%5===0)lit+=mark;else leaves+=mark;}
      art.push(line(leaves,"#647950",.55,.6));art.push(line(lit,"#d9d7b0",1,.75));
      if(bi===5)art.push(line(`M${f(cx-rx*.2)} ${f(cy+ry*.5)}q8-5 14 1m-7 2 11-2`,"#5e7350",.6,.8));
    }
    art.push(line(`M${x-w*.7} ${y+8}q${w*.3}-5 ${w*.6}-2m${w*.4} 1 ${w*.3} 4m-7 5 13-1`,"#8d9b73",.65,.8));
  }
  art.push(line("M-137 23l-1-5 4 2m2 4 4-4m12 7 7 1m-17-6-2-4M119 29l2-8 3 3m-5 8 9-2M49 37l3-5 3 3M-59 34l4-6 2 3","#82916b",.8,.7));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -185 305 230">${art.join("")}</svg>\n`;
}

export function studyCity() {
  const rnd=random(57),art:string[]=[];
  art.push('<path d="M-128 28Q-99-3-61 4-38-17-1-8 34-18 63-2 93-3 126 21 101 43 66 39 34 53-3 45-44 55-77 41-105 45-128 28Z" fill="#a6aa87" opacity=".23"/>');
  art.push(line("M-123 35q22-8 40-3m-2 9 32 2M22 44q35 8 61-2m14-9 26-3M-16 41q-8 13-5 25m8-25q-5 13-3 25","#a1a17e",.7,.8));
  // Enclosing wall and internal lane are ground structure, not an emblem backdrop.
  art.push('<path d="M-107 9-90-43-54-65-4-75 56-57 97-22 110 16 88 34 39 43-14 38-62 37Z" fill="#d3c9a6" stroke="#7a7960" stroke-width=".9"/>');
  art.push('<path d="M-12 33Q-1 12 15-2T26-39M12 5Q-25 11-47-8M20-9Q51 4 78-5" fill="none" stroke="#e9dfc0" stroke-width="8"/>');
  const buildings=[[-62,-31,22,22,13],[-24,-48,24,27,16],[32,-40,23,24,13],[-87,0,21,25,13],[-42,8,26,28,17],[25,15,28,31,15],[66,17,24,23,14]];
  for(const [x,y,w,h,r] of buildings){const dx=10,dy=-7;
    art.push(`<path d="M${x+w} ${y}l${dx} ${dy}v-${h}l-${dx} 7Z" fill="#b5b293" stroke="#71735b" stroke-width=".8"/>`);
    art.push(`<path d="M${x} ${y}v-${h}l${w/2} -${r} ${w/2} ${r}v${h}Z" fill="#e1d7b8" stroke="#71735b" stroke-width=".8"/>`);
    art.push(`<path d="M${x-3} ${y-h}l${w/2+3} -${r+2} ${dx} ${dy} -${w/2+3} ${r+2}Z" fill="#b19773" stroke="#72735c" stroke-width=".75"/><path d="M${x+w/2} ${y-h-r-2}l${dx} ${dy} ${w/2+4} ${r+2}-${dx} 7Z" fill="#867f64" stroke="#666e58" stroke-width=".75"/>`);
    art.push(line(`M${x-4} ${y-h+1}l${w/2+4}-${r+3} ${w/2+4} ${r+3}M${x+3} ${y-h+2}v${h-3}m${w-8}-${h-1}v${h-1}`,"#6b6e57",.65,.8));
    art.push(`<path d="M${x+w*.42} ${y}v-9q3-3 6 0v9M${x+4} ${y-h+7}h4v5h-4m${w-12} 1h4v5h-4" fill="#80816a" stroke="#6e715b" stroke-width=".5"/>`);
    let hatch="";for(let i=0;i<12;i++){const px=x+2+rnd()*(w-4),py=y-h+4+rnd()*(h-9);hatch+=`M${f(px)} ${f(py)}h${f(1+rnd()*3)}`;}art.push(line(hatch,"#9f9f80",.5,.65));
    art.push(line(`M${x+2} ${y-h-2}l7-5m-2 8 7-5m-1-7 5 4m3 3 5 3`,"#6e735a",.55,.6));
  }
  art.push('<path d="M1-55 1-113 14-121 26-114 26-54 14-47Z" fill="#ded2ac" stroke="#69705a" stroke-width="1"/><path d="M14-121 26-114 26-54 14-47Z" fill="#b1b096" stroke="#69705a" stroke-width=".7"/><path d="M-3-112 13-148 30-114 14-121Z" fill="#798d81" stroke="#616e5a" stroke-width=".9"/><path d="M13-148 14-121 30-114Z" fill="#647b71"/>');
  art.push(line("M13-148v-7m-3 5h6M8-109v11m10-8v11M6-89h5v8H6m12-2v8M4-71h8m4 3h8","#6a725b",.7,.9));
  art.push('<path d="M-111 12-103-7-94-9-94 5-70 16-40 20-12 19 17 26 45 21 69 27 91 17 94 1 103-1 111 15 109 26 87 40 59 45 28 44-4 37-30 40-60 36-86 30-111 24Z" fill="#c9c2a0" stroke="#69715a" stroke-width="1.1"/>');
  art.push('<path d="M-12 37-12 22q7-14 16-2l2 18" fill="#777b63" stroke="#5e6b54" stroke-width=".85"/><path d="M-17 38-17 21q12-22 26-3l3 22" fill="none" stroke="#e5dbb9" stroke-width="2"/>');
  let stones="";for(let i=0;i<45;i++){const x=-100+rnd()*202,y=22+rnd()*12;if(x>-19&&x<15)continue;stones+=`M${f(x)} ${f(y)}h${f(2+rnd()*5)}`;}art.push(line(stones,"#8b9475",.6,.65));
  art.push(line("M-111 15-104 14-101 4m-1 19 12 1M91 20l12-3m-4 12 9-4M-86 34l7-1 9 4m117 10 9-2M-20 55l5-2 3 2m3 9 4-2","#788467",.65,.8));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-140 -160 285 230">${art.join("")}</svg>\n`;
}
