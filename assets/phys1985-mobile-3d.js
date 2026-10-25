/* Lightweight, offline 3D mobile meshes for the canvas renderer.
 * Local x is the direction of travel, y is lateral, z is the dorsal side.
 * Orientation is illustrative, not a model of animal locomotion. */
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
  function squirrel(g) {
    const curve=(a,b,c,d,t)=>{
      const u=1-t;
      return V(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,0,
        u*u*u*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t*t*t*d.z);
    };
    // A tapered, slightly uneven plume reads as fur from side and overhead.
    const tailCenter=t=>t<=.72
      ?curve(V(-10,0,0),V(-19,0,0),V(-26,0,11),V(-19,0,14),t/.72)
      :curve(V(-19,0,14),V(-14,0,17),V(-13,0,14),V(-14,0,10.5),(t-.72)/.28);
    const tailSegments=32,tailSides=16;
    const tailRadius=t=>.2+(1.6+4.6*Math.sin(Math.PI*t))*Math.pow(1-t,.45);
    const tailPoint=(t,a)=>{
      const center=tailCenter(t);
      const tangent=unit(sub(tailCenter(Math.min(1,t+.001)),tailCenter(Math.max(0,t-.001))));
      const radial=V(-tangent.z,0,tangent.x);
      const r=tailRadius(t)*(1+.07*Math.sin(9*Math.PI*t+3*a)+.04*Math.cos(15*Math.PI*t-5*a));
      return add(center,add(V(0,r*.9*Math.cos(a),0),mul(radial,r*1.08*Math.sin(a))));
    };
    const rings=[];
    for(let i=0;i<=tailSegments;i++){
      const t=i/tailSegments;
      rings.push(Array.from({length:tailSides},(_,j)=>tailPoint(t,2*Math.PI*j/tailSides)));
    }
    for(let i=1;i<rings.length;i++)for(let j=0;j<tailSides;j++){
      const k=(j+1)%tailSides,t=(i-.5)/tailSegments;
      const center=tailCenter(t),points=[rings[i-1][j],rings[i-1][k],rings[i][k],rings[i][j]];
      const middle=mul(points.reduce(add,V()),.25),outward=sub(middle,center);
      face(g,points,outward,t>.84?'#df9348':outward.z>0?'#cc7132':'#a64e28');
    }
    face(g,rings[tailSegments],sub(tailCenter(1),tailCenter(.99)),'#df9348',true);
    // Short pointed locks break the tube silhouette without adding moving geometry.
    for(let i=4;i<tailSegments-2;i+=2){
      const t=i/tailSegments,tipT=Math.min(.985,t+.055);
      for(let j=0;j<8;j++){
        const a=2*Math.PI*j/8+(i%4)*Math.PI/16;
        const surface=tailPoint(tipT,a),outward=unit(sub(surface,tailCenter(tipT)));
        const lift=.55+.18*Math.sin(i*2.3+j*1.7)+.4*Math.max(0,tailRadius(t)-tailRadius(tipT));
        const tip=add(surface,mul(outward,lift));
        face(g,[tailPoint(t,a-.16),tailPoint(t,a+.16),tip],outward,
          j%3===0?'#e6a05a':j%3===1?'#b86130':'#d47d3b',true);
      }
    }
    // The body straddles the trajectory point; the head points along +x.
    ellipsoid(g,V(-2,0,-1),V(10,5,4.8),(n)=>n.z<-.25?'#a64e28':'#cc7132',10,20);
    ellipsoid(g,V(2,0,-3.1),V(6,4.2,2.5),'#f2d8a5',8,14);
    for(const side of [-1,1]){
      ellipsoid(g,V(-8,side*3.3,-3.3),V(3.4,2.6,3.3),'#a64e28',6,12);
      ellipsoid(g,V(-6.7,side*4.1,-5.7),V(3.2,2.2,1.1),'#704329',6,10);
      ellipsoid(g,V(7,side*3.8,-4.5),V(2.4,1.6,2.4),'#b95e2c',6,10);
      ellipsoid(g,V(9,side*4,-6),V(2.3,1.8,.9),'#704329',6,10);
    }
    ellipsoid(g,V(9,0,2.5),V(5.3,4.1,4.6),'#cc7132',10,20);
    ellipsoid(g,V(13.3,0,1),V(3,3.2,2.2),'#f2d8a5',8,14);
    ellipsoid(g,V(16.1,0,1.8),V(1.15,1.2,.9),'#704329',6,10);
    for(const side of [-1,1]){
      ellipsoid(g,V(6.8,side*3,6.7),V(1.7,1.15,2.7),'#a64e28',6,12);
      ellipsoid(g,V(7.1,side*3.95,6.8),V(.8,.28,1.5),'#e5a168',6,10);
      ellipsoid(g,V(11.3,side*3.7,4.1),V(.95,.55,.95),'#302723',6,10);
      ellipsoid(g,V(11.5,side*4.2,4.4),V(.25,.12,.28),'#fff4dc',6,10);
    }
  }
  function baseModel(kind) {
    if(kind==='tore')return window.PhysMobile.toreGeometry();
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
    }else if(kind==='ladybug'){
      squirrel(g); // Legacy kind for existing shared links.
      // Keep the head-on silhouette smaller than the overhead silhouette.
      for(const f of g.faces){
        f.points=f.points.map(p=>V(p.x,p.y*1.2,p.z*.5));
        f.normal=unit(V(f.normal.x,f.normal.y/1.2,f.normal.z/.5));
      }
    }
    return g;
  }
  const models=Object.fromEntries(['fly','butterfly','ladybug','tore'].map(k=>[k,baseModel(k)]));
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
    if(kind==='fly'||kind==='butterfly')wings(g,kind,time);
    return g;
  }
  function shade(color,brightness,highlight=0) {
    return 'rgb('+[1,3,5].map(i=>Math.round(Math.min(255,parseInt(color.slice(i,i+2),16)*brightness+highlight*255))).join(',')+')';
  }
  function draw(ctx,kind,position,{frame,time=0,project,eye,light,unitScale=14}={}) {
    const g=geometry(kind,time);if(!g||!frame)return false;
    const size=unitScale*(kind==='fly'?1:kind==='ladybug'?1.05:.85),lighting=unit(light);
    const world=p=>add(position,mul(localToWorld(p,frame),size));
    const paint=[];
    for(const f of g.faces){
      const vertices=f.points.map(world),center=mul(vertices.reduce(add,V()),1/vertices.length);
      let normal=localToWorld(f.normal,frame);const toward=unit(sub(eye,center));
      if(dot(normal,toward)<=0){if(!f.twoSided)continue;normal=mul(normal,-1);}
      const points=vertices.map(project);if(points.some(p=>!p))continue;
      const diffuse=kind==='tore'?.62+.38*Math.max(0,dot(normal,lighting)):.52+.48*Math.max(0,dot(normal,lighting));
      const gloss=(kind==='tore'?.025:.16)*Math.max(0,dot(normal,unit(add(lighting,toward))))**24;
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
