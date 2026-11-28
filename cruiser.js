export function createCruiser(renderer) {
const model=new THREE.Group(); model.name='Лёгкий крейсер';
const loader=new THREE.TextureLoader();
function material(url){
 const map=loader.load(url);
 map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=renderer.capabilities.getMaxAnisotropy();
 return new THREE.MeshStandardMaterial({map,roughness:.86,metalness:.08,side:THREE.DoubleSide});
}
const paint=material('./hull.jpg'), timber=material('./deck.jpg');
function mesh(name,vertices,uv,indices,mat){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 const part=new THREE.Mesh(g,mat);part.name=name;model.add(part);
}
// Cross sections progress from the rounded stern to the raked stem.
const widths=[.21,.65,.85,.96,1,1,.98,.90,.73,.45,.02];
function catmull(t,a,b,c,d){return b+.5*t*((c-a)+t*((2*a-5*b+4*c-d)+t*(3*b-3*c+d-a)));}
function section(t){
 const i=Math.min(9,Math.floor(t*10)), blend=t*10-i;
 const wide=2.05*catmull(t===1?1:blend,widths[Math.max(0,i-1)],widths[i],widths[i+1],widths[Math.min(10,i+2)]);
 return {x:(t-.5)*31,w:wide,top:1.03+.69*t**4+.15*(1-t)**4,bottom:-1.68+.97*(1-t)**5+.58*t**6};
}
function point(t,frac,spread,side){
 const s=section(t),rake=(1-frac)*(.94*(1-t)**7-1.5*t**7);
 return [s.x+rake,s.bottom+(s.top-s.bottom)*frac,side*s.w*spread];
}
const rows=[[0,0],[.022,.24],[.065,.46],[.13,.63],[.20,.76],[.30,.85],[.40,.91],[.52,.95],[.64,.978],[.81,.99],[1,1]],N=86;
function strip(name,n,m,sample,mat,reverse=false){
 const p=[],uv=[],idx=[];
 for(let i=0;i<=n;i++)for(let j=0;j<m;j++){
  const [v,u]=sample(i/n,j);p.push(...v);uv.push(...u);
  if(i<n&&j<m-1){const a=i*m+j,b=a+m;idx.push(...(reverse?[a,a+1,b,b,a+1,b+1]:[a,b,a+1,b,b+1,a+1]));}
 }
 mesh(name,p,uv,idx,mat);
}
for(const side of [-1,1]){
 strip(side>0?'Port plating':'Starboard plating',N,rows.length,(t,j)=>{
  const v=point(t,...rows[j],side);return [v,[side>0?t:1-t,(v[1]+1.7)/3.45]];
 },paint,side<0);
}
strip('Deck',N,3,(t,j)=>[point(t,1,1,j-1),[t,.5+(j-1)*section(t).w/4.13]],timber,true);
for(const end of [0,1]){
 strip(end?'Stem':'Stern',1,rows.length,(s,j)=>{
 const v=point(end,...rows[j],2*s-1);return [v,[.4+s*.02,(v[1]+1.7)/3.45]];
 },paint,!!end);
}
const turret=new THREE.Group();
turret.name='Носовая башня';
const mountT=.70;
turret.position.set(section(mountT).x,section(mountT).top-.035,0);
model.add(turret);
const steel=new THREE.MeshStandardMaterial({color:0x89999e,roughness:.82,metalness:.19});
const trim=new THREE.MeshStandardMaterial({color:0x56666c,roughness:.78});
const dark=new THREE.MeshStandardMaterial({color:0x313e42,roughness:.95});
function part(name,shape,finish,x,y,z){
 const item=new THREE.Mesh(shape,finish);item.name=name;item.position.set(x,y,z);
 turret.add(item);return item;
}
part('Основание',new THREE.CylinderGeometry(1.17,1.2,.30,32),trim,0,.15,0);
// Three bevelled horizontal outlines form the silhouette of the housing.
const outlines=[[-1.46,1.48,1.22,.25],[-1.49,1.49,1.23,.42],[-1.28,1.09,.98,1.35]];
const shell=[], faces=[];
for(const [aft,front,w,y] of outlines){
 const ring=[[aft,-w+.28],[aft,w-.28],[aft+.28,w],[front-.34,w],[front,w-.34],[front,-w+.34],[front-.34,-w],[aft+.28,-w]];
 for(const [x,z] of ring)shell.push(x,y,z);
}
for(let j=0;j<2;j++)for(let i=0;i<8;i++){
 const a=j*8+i,b=j*8+(i+1)%8;faces.push(a,b,b+8,a,b+8,a+8);
}
for(let i=1;i<7;i++)faces.push(16,16+i,17+i,0,i+1,i);
const housing=new THREE.BufferGeometry();
housing.setAttribute('position',new THREE.Float32BufferAttribute(shell,3));housing.setIndex(faces);
const panels=housing.toNonIndexed();panels.computeVertexNormals();
part('Кожух',panels,steel,0,0,0);
for(const z of [-.57,0,.57]){
 const collar=part('Маска',new THREE.SphereGeometry(.32,14,10),trim,1.28,.77,z);
 collar.scale.set(1.15,1,.84);
 const axis=new THREE.Vector3(1,.055,0).normalize();
 function tube(label,start,length,base,tip,finish){
  const center=start+length/2;
  const p=part(label,new THREE.CylinderGeometry(tip,base,length,16),finish,1.36+axis.x*center,.77+axis.y*center,z);
  p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
 }
 tube('Обойма',0,.87,.23,.21,steel);
 tube('Ствол',.86,3.12,.166,.122,steel);
 tube('Срез',3.979,.004,.088,.088,dark);
}
// Deck fittings share the hull's coordinate frame: positive X points to the bow.
const fittings=new THREE.Group(); fittings.name='Надстройки и палубное оборудование';model.add(fittings);
function fitting(name,geometry,finish,x,y,z){
 const item=new THREE.Mesh(geometry,finish);item.name=name;item.position.set(x,y,z);fittings.add(item);return item;
}
const pale=new THREE.MeshStandardMaterial({color:0xaab5b3,roughness:.88});
const glass=new THREE.MeshStandardMaterial({color:0x364e58,roughness:.33});

const depthAt=x=>section(x/31+.5).top;
function box(name,x,y,z,l,h,w,finish){
 return fitting(name,new THREE.BoxGeometry(l,h,w),finish,x,y,z);
}
function oval(name,x,y,z,l,h,w,finish){
 const item=fitting(name,new THREE.CylinderGeometry(1,1,h,24),finish,x,y,z);
 item.scale.set(l/2,1,w/2);return item;
}
function house(name,x,y,l,w,h,finish){
 const path=new THREE.Shape(), a=l/2,b=w/2,c=Math.min(.35,w*.19,l*.18);
 const ring=[[-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c],[-a,-b+c]];
 ring.forEach(([u,v],i)=>i?path.lineTo(u,v):path.moveTo(u,v));path.closePath();
 const geo=new THREE.ExtrudeGeometry(path,{depth:h,bevelEnabled:true,bevelSize:.015,bevelThickness:.012,bevelSegments:1});geo.rotateX(-Math.PI/2);
 return fitting(name,geo,finish,x,y,0);
}
function spar(name,a,b,r,finish){
 const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
 const mid=start.lerp(end,.5);
 const item=fitting(name,new THREE.CylinderGeometry(r,r,delta.length(),8),finish,mid.x,mid.y,mid.z);
 item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
}
function sternGroup(name,x,z,angle){
 const g=new THREE.Group();g.name=name;g.position.set(x,depthAt(x),z);g.rotation.y=angle;model.add(g);return g;
}
function casting(g,name,geo,mat,x,y,z){
 const m=new THREE.Mesh(geo,mat);m.name=name;m.position.set(x,y,z);g.add(m);return m;
}
function turned(g,name,mat,start,end,r1,r2){
 const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),v=b.clone().sub(a);
 const m=casting(g,name,new THREE.CylinderGeometry(r2,r1,v.length(),20),mat,...a.lerp(b,.5).toArray());
 m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;
}
function plate(g,name,points,thickness,mat,z){
 const path=new THREE.Shape();points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();
 return casting(g,name,new THREE.ExtrudeGeometry(path,{depth:thickness,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:1}),mat,0,0,z);
}
const stern=sternGroup('Лёгкая кормовая пушка',-10.1,0,0);
turned(stern,'Монтажное кольцо',trim,[0,0,0],[0,.10,0],.77,.77);
turned(stern,'Поворотная тумба',steel,[0,.10,0],[0,.38,0],.59,.48);
const silhouette=[[-.70,.37],[-.79,.78],[-.49,1.13],[.25,1.06],[.64,.77],[.64,.42]];
for(const s of [-1,1]){
 plate(stern,'Боковина щита',silhouette,.05,pale,s*.54-.025);
 for(const [x,y] of [[-.57,.54],[-.45,.96],[.15,.92],[.49,.62]])casting(stern,'Головка заклёпки',new THREE.SphereGeometry(.031,8,6),trim,x,y,s*.578);
}
plate(stern,'Скошенный лоб',[[ -.78,.46],[-.79,.79],[-.49,1.13],[-.40,1.11],[-.70,.75],[-.69,.46]],1.03,steel,-.515);
plate(stern,'Козырёк',[[ -.49,1.13],[.25,1.06],[.37,.98],[-.44,1.055]],1.08,pale,-.54);
const barrelPoint=t=>[-.52-t,.76+.105*t,0];
for(const [a,b,r,R,m] of [[0,.50,.207,.18,trim],[.50,.58,.196,.196,steel],[.58,1.16,.139,.116,steel],[1.16,2.31,.113,.073,steel],[2.31,2.39,.081,.081,trim]])
 turned(stern,'Профиль ствола',m,barrelPoint(a),barrelPoint(b),r,R);
for(const side of [-1,1]){
 const g=sternGroup(side>0?'Левая зенитка':'Правая зенитка',-8.55,side*.99,side*.68);
 turned(g,'Площадка',trim,[0,.01,0],[0,.075,0],.48,.48);
 turned(g,'Коническая стойка',steel,[0,.075,0],[0,.49,0],.27,.16);
 for(const s of [-1,1]){
  const z=s*.145;
  plate(g,'Фигурная щека',[[.29,.46],[.18,.73],[-.24,.82],[-.32,.67],[-.10,.44]],.055,pale,z-.027);
  const p=t=>[-.17-t*.80,.72+t*.60,z];
  turned(g,'Тёмная муфта',dark,p(0),p(.37),.095,.084);
  turned(g,'Тонкий ствол',steel,p(.37),p(1.23),.057,.039);
  turned(g,'Наконечник',trim,p(1.23),p(1.32),.053,.062);
  plate(g,'Боковой экран',[[.16,.39],[-.23,.39],[-.36,.69],[-.22,.87],[.04,.78]],.032,steel,s*.34-.016);
 }
 casting(g,'Сиденье',new THREE.BoxGeometry(.27,.075,.30),trim,.32,.48,0);
 casting(g,'Спинка',new THREE.BoxGeometry(.055,.23,.30),steel,.45,.56,0);
 turned(g,'Опора сиденья',trim,[.08,.32,0],[.32,.48,0],.047,.047);
}

house('Шельтердек',-1.35,1.035,10.6,2.42,.54,steel);
house('Нижний ярус мостика',2.48,1.575,2.76,2.10,.90,pale);
house('Крылья мостика',2.45,2.47,2.65,3.12,.13,trim);
house('Ходовая рубка',2.59,2.60,1.82,1.70,.57,pale);
house('Крыша рубки',2.60,3.17,1.99,1.88,.09,trim);
for(const z of [-.51,-.255,0,.255,.51])box('Окно рубки',3.505,2.98,z,.025,.215,.19,glass);
for(const sign of [-1,1]){
 for(const x of [2.05,2.34,2.63,2.92,3.21])box('Окно рубки',x,2.98,sign*.856,.22,.215,.024,glass);
 for(const x of [-5.6,-4.9,-4.2,-3.5,-2.8,-2.1,-1.4,-.7,0,.7,1.4,2.1,2.8]){
  const port=fitting('Иллюминатор',new THREE.CircleGeometry(.074,12),glass,x,1.39,sign*1.216);
  if(sign<0)port.rotation.y=Math.PI;
 }
}
house('Кормовая надстройка',-6.42,1.05,2.72,2.05,.78,pale);
house('Кормовой пост',-6.43,1.83,1.62,1.54,.50,steel);
for(const x of [-3.47,-.33]){
 const foot=1.57, h=x< -1?1.95:2.17;
 oval('Кожух трубы',x,foot+.17,0,1.67,.34,1.17,steel);
 const inset=.12;
 const funnel=oval('Дымовая труба',x-.10+Math.sin(.10)*inset/2,foot+.34+h/2-Math.cos(.10)*inset/2,0,1.18,h+inset,.83,pale);
 funnel.rotation.z=.10;
 const topX=x-.10-Math.sin(.10)*h/2, topY=foot+.34+h/2+Math.cos(.10)*h/2;
 const cap=oval('Чёрный пояс трубы',topX,topY,0,1.24,.28,.89,dark);cap.rotation.z=.10;
 const lip=oval('Обод трубы',topX-.015,topY+.14,0,1.28,.045,.93,trim);lip.rotation.z=.10;
 const mouth=oval('Устье трубы',topX-.019,topY+.165,0,1.12,.012,.77,dark);mouth.rotation.z=.10;
}
const wirePoints=[];
function wire(a,b){wirePoints.push(...a,...b);}
function mast(x,top){
 const head=[x-.32,top,0];
 spar('Мачта',[x,1.60,0],head,.052,trim);
 for(const side of [-1,1])spar('Стойка треноги',[x-.65,1.59,.76*side],[x-.25,top-.92,0],.048,steel);
 for(const [drop,span] of [[.40,1.03],[1.05,1.35]]){
  spar('Рея',[head[0],top-drop,-span],[head[0],top-drop,span],.035,trim);
  for(const sign of [-1,1])wire(head,[head[0],top-drop,span*sign]);
 }
 return head;
}
const foremast=mast(1.24,5.83),mainmast=mast(-5.63,4.91);
wire(foremast,mainmast);
for(const side of [-1,1]){
 // Two courses of rail follow the deck edge and its changing sheer.
 let prev=null;
 for(let i=0;i<=48;i++){
  const sec=section(.018+i*.964/48),base=[sec.x,sec.top,side*sec.w*.972];
  const rail=h=>[base[0],base[1]+h,base[2]];
  wire(base,rail(.24));
  if(prev)for(const h of [.12,.24])wire([prev[0],prev[1]+h,prev[2]],rail(h));
  prev=base;
 }
}
const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(wirePoints,3));
const rigging=new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:0x576466,transparent:true,opacity:.82}));rigging.name='Такелаж и леера';fittings.add(rigging);
for(const x of [11.45,-12.38])for(const z of [-.42,.42]){
 oval('Швартовный кнехт',x,depthAt(x)+.12,z,.21,.24,.21,trim);
 oval('Оголовок',x,depthAt(x)+.24,z,.26,.05,.26,steel);
}

const rustRed=new THREE.MeshStandardMaterial({color:0x9d513a,roughness:.91});
for(const side of [-1,1]){
 const z=side*1.226;
 for(const x of [-4.85,.22]){
  box('Решётка вентиляции',x,1.31,z,.59,.25,.036,dark);
  for(let j=0;j<5;j++)box('Жалюзи',x,1.205+j*.047,z+side*.024,.56,.023,.024,steel);
 }
 for(const x of [-5.65,2.05]){
  const ring=fitting('Спасательный круг',new THREE.TorusGeometry(.159,.045,8,24),rustRed,x,1.44,z+side*.066);
  for(const a of [.7,2.3,3.84,5.44]){
   const band=fitting('Перевязь круга',new THREE.TorusGeometry(.159,.048,8,4,.37),pale,ring.position.x,ring.position.y,ring.position.z);
   band.rotation.z=a;
  }
 }
 // A ship's ladder connects the wings to the lower bridge deck.
 const sx=1.48, sz=side*.95;
 for(const off of [-.12,.12])spar('Тетива трапа',[sx-.61,1.60,sz+off],[sx,2.58,sz+off],.018,steel);
 for(let j=0;j<=7;j++)box('Ступень трапа',sx-.61+.61*j/7,1.60+.98*j/7,sz,.091,.029,.23,trim);
}
for(const x of [-3.47,-.33]){
 const h=x< -1?1.95:2.17;
 for(let k=0;k<3;k++){
  const f=(k+1)/4,y=1.91+h*f;
  const binding=oval('Бандаж трубы',x-.10-h*(f-.5)*.10,y,0,1.20,.036,.85,trim);binding.rotation.z=.1;
 }
}
for(const x of [12.15,-13.28]){
 const t=depthAt(x);
 box('Палубный люк',x,t+.065,0,.72,.12,.55,trim);
 box('Крышка люка',x,t+.143,0,.77,.045,.60,pale);
}

// Open compass platform above the enclosed wheelhouse.
house('Основание компасной площадки',2.49,3.254,1.36,1.23,.33,steel);
house('Компасная площадка',2.49,3.585,1.59,1.57,.08,trim);
for(const s of [-1,1]){
 box('Фальшборт',2.49,3.77,s*.757,1.34,.22,.056,pale);
 box('Передний фальшборт',3.24,3.77,s*.33,.056,.22,.67,pale);
}
oval('Нактоуз компаса',2.70,3.80,0,.22,.30,.22,trim);
const canopy=fitting('Колпак компаса',new THREE.SphereGeometry(.15,12,8),pale,2.70,3.95,0);
canopy.scale.y=.67;
for(const s of [-1,1]){
 box('Кромка крыла мостика',2.47,2.73,1.52*s,2.03,.24,.055,pale);
 const lamp=fitting('Прожектор',new THREE.CylinderGeometry(.144,.16,.21,16),trim,2.93,2.83,1.22*s);
 lamp.rotation.z=-Math.PI/2;
 const lens=fitting('Стекло прожектора',new THREE.CircleGeometry(.128,16),glass,3.04,2.83,1.22*s);
 lens.rotation.y=Math.PI/2;
}

model.scale.setScalar(1.12);
return model;
    }
