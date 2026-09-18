/* Lightweight, offline 3D insect meshes for the canvas renderer.
 * Local x is the direction of travel, y the wing span, z the dorsal side.
 * Orientation is illustrative, not a model of insect flight dynamics. */
(() => {
  'use strict';
  const V=(x=0,y=0,z=0)=>({x,y,z});
  const add=(a,b)=>V(a.x+b.x,a.y+b.y,a.z+b.z), sub=(a,b)=>V(a.x-b.x,a.y-b.y,a.z-b.z);
  const mul=(a,s)=>V(a.x*s,a.y*s,a.z*s), dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const cross=(a,b)=>V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
  const norm=a=>Math.hypot(a.x,a.y,a.z), unit=a=>mul(a,1/(norm(a)||1));
  function orientation(velocity, previous=null) {
    if (norm(velocity)<1e-7) return previous || {forward:V(1,0,0),side:V(0,0,-1),up:V(0,1,0)};
    const forward=unit(velocity); let side;
    if (!previous) {
      const reference=Math.abs(forward.y)<.98?V(0,1,0):V(0,0,1);
      side=unit(cross(reference,forward));
    } else {
      // Rotation-minimising transport, continuous through vertical flight.
      // A genuine reversal uses the previous dorsal axis for the half-turn.
      const c=Math.max(-1,Math.min(1,dot(previous.forward,forward)));
      if(c<-.999999) side=mul(previous.side,-1);
      else {
        const axis=cross(previous.forward,forward), v=previous.side;
        side=add(add(v,cross(axis,v)),mul(cross(axis,cross(axis,v)),1/(1+c)));
      }
      side=unit(sub(side,mul(forward,dot(side,forward))));
    }
    return {forward,side,up:unit(cross(forward,side))};
  }
  const localToWorld=(p,f)=>add(add(mul(f.forward,p.x),mul(f.side,p.y)),mul(f.up,p.z));
  const face=(g,points,normal,color,twoSided=false,alpha=1)=>g.faces.push({points,normal:unit(normal),color,twoSided,alpha});
  const line=(g,points,color='#30373b',width=1)=>g.lines.push({points,color,width});
  function ellipsoid(g,center,radii,color,rows=10,columns=20) {
    const point=(latitude,longitude)=>V(center.x+radii.x*Math.cos(latitude)*Math.cos(longitude),
      center.y+radii.y*Math.cos(latitude)*Math.sin(longitude),center.z+radii.z*Math.sin(latitude));
    for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
      const a=-Math.PI/2+j*Math.PI/rows,b=a+Math.PI/rows,c=i*2*Math.PI/columns,d=c+2*Math.PI/columns;
      const mid=point((a+b)/2,(c+d)/2),delta=sub(mid,center);
      const normal=unit(V(delta.x/radii.x**2,delta.y/radii.y**2,delta.z/radii.z**2));
      face(g,[point(a,c),point(a,d),point(b,d),point(b,c)],normal,typeof color==='function'?color(normal,mid):color);
    }
  }
  function legs(g) {
    for(const side of [-1,1])for(const [x,bend,tip] of [[-6,-10,-13],[0,0,3],[6,10,14]])
      line(g,[V(x,side*3,-2),V(bend,side*9,-4),V(tip,side*12,-5)],'#344047',1.1);
  }
  function antennae(g,x) {
    for(const side of [-1,1])line(g,[V(x,side,1),V(x+4,side*5,2.5),V(x+7,side*4,2)],'#30373b',.9);
  }
  const shellSpots=[[-8,0,2],[-5,-5,2.25],[-5,5,2.25],[1,-6,2.1],[1,6,2.1],[6,-3.8,1.7],[6,3.8,1.7]];
  function baseModel(kind) {
    const g={faces:[],lines:[]};
    if(kind==='fly'){
      legs(g);antennae(g,10);
      ellipsoid(g,V(-4,0,0),V(8,4.8,4),'#46565b');
      ellipsoid(g,V(3,0,.4),V(5.2,4.4,4.4),'#617e79');
      ellipsoid(g,V(9,0,0),V(3.7,3.6,3.3),'#293b43');
      for(const side of [-1,1])ellipsoid(g,V(10,side*2.7,1),V(2.2,1.8,2.3),'#b6533d',8,16);
    }else if(kind==='butterfly'){
      ellipsoid(g,V(-2,0,0),V(9,2.1,2.1),'#41433b');
      ellipsoid(g,V(7,0,.2),V(3,2.5,2.4),'#373b38');antennae(g,8);
      for(const side of [-1,1])line(g,[V(0,side,-1),V(3,side*5,-3),V(7,side*6,-3)],'#3a3c3a',.8);
    }else{
      legs(g);antennae(g,11);
      ellipsoid(g,V(11,0,0),V(5,4.5,3.7),'#293238');
      // Colour the shell itself: spots follow its curvature and cannot sink
      // into the body or float in front of it when viewed obliquely.
      ellipsoid(g,V(),V(12,10,6),(n,p)=>n.z<-.18?'#32393c':
        p.z>0&&shellSpots.some(([x,y,r])=>(p.x-x)**2+(p.y-y)**2<r*r)?'#242c30':'#e33d32',32,64);
      line(g,Array.from({length:25},(_,i)=>{const x=-11.9+i*23.6/24;return V(x,0,6*Math.sqrt(1-x*x/144)+.18);}),'#492e30',.75);
      for(const side of [-1,1])ellipsoid(g,V(10,side*3,2.1),V(1.1,1.5,1),'#fff2d8',6,12);
    }
    return g;
  }
  const models=Object.fromEntries(['fly','butterfly','ladybug'].map(k=>[k,baseModel(k)]));
  function bezier(a,b,c,d,n=12) {
    return Array.from({length:n+1},(_,i)=>{
      const t=i/n,u=1-t;return [u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*d[0],u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*d[1]];
    });
  }
  const frontWing=bezier([0,1],[5,6],[18,9],[15,19]).concat(bezier([15,19],[10,26],[-1,20],[-3,6]).slice(1));
  const rearWing=bezier([-2,1],[-8,2],[-18,9],[-15,16]).concat(bezier([-15,16],[-9,23],[-3,14],[0,4]).slice(1));
  function wings(g,kind,time) {
    const phase=2*Math.PI*3*time,fold=kind==='fly'?.18+.22*Math.sin(phase):.32+.45*Math.sin(phase);
    for(const side of [-1,1]){
      const lift=([x,y])=>V(x,side*y*Math.cos(fold),(kind==='fly'?3:1)+y*Math.sin(fold));
      const normal=V(0,-side*Math.sin(fold),Math.cos(fold));
      if(kind==='fly'){
        const contour=Array.from({length:28},(_,i)=>{
          const a=i*2*Math.PI/28,x=12*Math.cos(a),y=5.5*Math.sin(a);
          return [-5+x*Math.cos(-.65)-y*Math.sin(-.65),8+x*Math.sin(-.65)+y*Math.cos(-.65)];
        }).map(lift);
        face(g,contour,normal,'#cee3e9',true,.78);
        line(g,[...contour,contour[0]],'#829eaa',.65);
        line(g,[[2,0],[-12,13]].map(lift),'#829eaa',.6);
      }else{
        for(const [contour,color] of [[frontWing,'#e7a34c'],[rearWing,'#db7944']]){
          const points=contour.map(lift);face(g,points,normal,color,true);
          line(g,[...points,points[0]],'#4b3b32',1.1);
        }
        for(const [x,y] of [[11,19],[7,21],[-12,16],[-9,18]])line(g,[[-1,3],[x,y]].map(lift),'#795038',.65);
        for(const [x,y,rx,ry,color] of [[8,13,3,4,'#554139'],[8,13,1.2,1.8,'#f4d789'],[11,19,1.1,1.1,'#fff2cf'],[-12,16,1.1,1.1,'#fff2cf']]){
          const points=Array.from({length:16},(_,i)=>lift([x+rx*Math.cos(i*Math.PI/8),y+ry*Math.sin(i*Math.PI/8)]));
          face(g,points,normal,color,true);
        }
      }
    }
  }
  function geometry(kind,time=0) {
    const base=models[kind];if(!base)return null;
    const g={faces:[...base.faces],lines:[...base.lines]};
    if(kind!=='ladybug')wings(g,kind,time);
    return g;
  }
  function shade(color,brightness,highlight=0) {
    return 'rgb('+[1,3,5].map(i=>Math.round(Math.min(255,parseInt(color.slice(i,i+2),16)*brightness+highlight*255))).join(',')+')';
  }
  function draw(ctx,kind,position,{frame,time=0,project,eye,light,unitScale=14}={}) {
    const g=geometry(kind,time);if(!g||!frame)return false;
    const size=unitScale*(kind==='fly'?1:.85),lighting=unit(light);
    const world=p=>add(position,mul(localToWorld(p,frame),size));
    const paint=[];
    for(const f of g.faces){
      const vertices=f.points.map(world),center=mul(vertices.reduce(add,V()),1/vertices.length);
      let normal=localToWorld(f.normal,frame);const toward=unit(sub(eye,center));
      if(dot(normal,toward)<=0){if(!f.twoSided)continue;normal=mul(normal,-1);}
      const points=vertices.map(project);if(points.some(p=>!p))continue;
      const diffuse=.52+.48*Math.max(0,dot(normal,lighting));
      const gloss=.16*Math.max(0,dot(normal,unit(add(lighting,toward))))**24;
      paint.push({points,depth:points.reduce((s,p)=>s+p.depth,0)/points.length,color:shade(f.color,diffuse,gloss),alpha:f.alpha});
    }
    for(const l of g.lines){
      const points=l.points.map(p=>project(world(p)));if(points.some(p=>!p))continue;
      // Subdivide long lines to sort their visible portions against the body.
      for(let i=1;i<points.length;i++)paint.push({points:[points[i-1],points[i]],depth:(points[i-1].depth+points[i].depth)/2-.5,color:l.color,width:l.width,alpha:1});
    }
    paint.sort((a,b)=>b.depth-a.depth);
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
    for(const p of paint){
      ctx.globalAlpha=p.alpha;ctx.beginPath();ctx.moveTo(p.points[0].x,p.points[0].y);
      for(const point of p.points.slice(1))ctx.lineTo(point.x,point.y);
      ctx.strokeStyle=p.color;
      if(p.width){ctx.lineWidth=p.width;ctx.stroke();}
      else{ctx.closePath();ctx.fillStyle=p.color;ctx.fill();ctx.lineWidth=.35;ctx.stroke();}
    }
    ctx.restore();return true;
  }
  window.PhysMobile3D=Object.freeze({orientation,geometry,draw});
})();
