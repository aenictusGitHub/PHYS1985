/* Small canvas illustrations: identical offline on every browser, no emoji font
 * or image download. (x,y) is always the physical position; size is in CSS px.
 * The apps retain their original point renderer and all their physics. */
(() => {
  'use strict';
  const kinds = Object.freeze(['point', 'fly', 'butterfly', 'ladybug', 'tore']);
  const valid = value => kinds.includes(value);
  const normalize = value => value === 'ball' ? 'ladybug' : value;
  function ellipse(ctx, x, y, rx, ry, rotation, fill, stroke) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, 2 * Math.PI);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function fly(ctx, phase) {
    ctx.lineWidth = 1.15; ctx.strokeStyle = '#34434b';
    for (const side of [-1, 1]) {
      for (const [x, bend, tip] of [[-5,-9,-13],[0,1,5],[5,9,14]]) {
        ctx.beginPath(); ctx.moveTo(x, side * 3); ctx.lineTo(bend, side * 9);
        ctx.lineTo(tip, side * 12); ctx.stroke();
      }
    }
    const spread = .78 + .18 * Math.cos(phase);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(1, spread);
      ellipse(ctx, -5, side * 8, 12, 5.5, -side * .65, 'rgba(218,238,243,.91)', '#839eaa');
      ctx.strokeStyle = 'rgba(122,151,163,.6)'; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-12, side * 13); ctx.stroke();
      ctx.restore();
    }
    ellipse(ctx, -4, 0, 8, 4.8, 0, '#404f55', '#25343c');
    ctx.strokeStyle = '#879a9b'; ctx.lineWidth = .8;
    for (const x of [-8,-5,-2]) { ctx.beginPath(); ctx.moveTo(x,-3.6); ctx.lineTo(x,3.6); ctx.stroke(); }
    ellipse(ctx, 3, 0, 5.2, 4.4, 0, '#667977', '#2e4146');
    ellipse(ctx, 9, 0, 3.7, 3.6, 0, '#293b43');
    ellipse(ctx, 10, -2.6, 2.2, 1.8, -.3, '#bb553c', '#71362c');
    ellipse(ctx, 10, 2.6, 2.2, 1.8, .3, '#bb553c', '#71362c');
    ctx.strokeStyle = '#34434b'; ctx.lineWidth = .9;
    for (const side of [-1,1]) { ctx.beginPath(); ctx.moveTo(11,side); ctx.lineTo(15,side*2.5); ctx.stroke(); }
  }
  function butterfly(ctx, phase) {
    const spread = .76 + .2 * Math.cos(phase);
    for (const side of [-1,1]) {
      ctx.save(); ctx.scale(1, side * spread);
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#483930';
      ctx.beginPath(); ctx.moveTo(0,1); ctx.bezierCurveTo(5,6,18,9,15,19);
      ctx.bezierCurveTo(10,26,-1,20,-3,6); ctx.closePath();
      ctx.fillStyle = '#e9a144'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2,1); ctx.bezierCurveTo(-8,2,-18,9,-15,16);
      ctx.bezierCurveTo(-9,23,-3,14,0,4); ctx.closePath();
      ctx.fillStyle = '#df7942'; ctx.fill(); ctx.stroke();
      ctx.lineWidth = .8; ctx.strokeStyle = '#795038';
      for (const [x,y] of [[11,19],[7,21],[-12,16],[-9,18]]) {
        ctx.beginPath(); ctx.moveTo(-1,3); ctx.lineTo(x,y); ctx.stroke();
        ellipse(ctx,x,y,1.25,1.25,0,'#fff2cd');
      }
      ellipse(ctx,8,13,2.8,3.7,-.4,'#58423c');
      ellipse(ctx,8,13,1.25,1.8,-.4,'#f5d78f');
      ctx.restore();
    }
    ellipse(ctx,-2,0,9,2.25,0,'#3a3c3a');
    ellipse(ctx,7,0,3,2.5,0,'#3a3c3a');
    ctx.lineWidth = .9; ctx.strokeStyle = '#3a3c3a';
    for (const side of [-1,1]) {
      ctx.beginPath(); ctx.moveTo(8,side); ctx.quadraticCurveTo(13,side*7,16,side*5); ctx.stroke();
      ellipse(ctx,16,side*5,.9,.9,0,'#3a3c3a');
    }
  }
  function ladybug(ctx) {
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#293238';
    for (const side of [-1,1]) {
      for (const [x,bend,tip] of [[-6,-10,-13],[0,0,3],[6,10,14]]) {
        ctx.beginPath(); ctx.moveTo(x,side*6); ctx.lineTo(bend,side*11);
        ctx.lineTo(tip,side*12.5); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(12,side*2); ctx.quadraticCurveTo(15,side*6,18,side*5); ctx.stroke();
      ellipse(ctx,18,side*5,.8,.8,0,'#293238');
    }
    ellipse(ctx,11,0,5,4.5,0,'#293238');
    const red = ctx.createRadialGradient(-4,-5,1,0,0,13);
    red.addColorStop(0,'#ff7664'); red.addColorStop(.5,'#e83c32'); red.addColorStop(1,'#b82227');
    ctx.lineWidth = 1.3; ellipse(ctx,0,0,12,10,0,red,'#642c2c');
    ctx.strokeStyle = '#512f30'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-12,0); ctx.lineTo(10,0); ctx.stroke();
    // Seven black spots on the two red wing cases.
    for (const [x,y,r] of [[-8,0,2],[-5,-5,2.25],[-5,5,2.25],[1,-6,2.1],[1,6,2.1],[6,-3.8,1.7],[6,3.8,1.7]]) {
      ellipse(ctx,x,y,r,r,0,'#272c30');
    }
    ellipse(ctx,9.5,-3.1,1.1,1.7,.3,'#fff2d8');
    ellipse(ctx,9.5,3.1,1.1,1.7,-.3,'#fff2d8');
    ellipse(ctx,-3.7,-7.4,2.6,1.1,-.2,'rgba(255,255,255,.34)');
  }
  // Stylised timber Toré, based on the supplied side and front photographs.
  // One mesh is shared by the 2D illustration and the perspective 3D renderer.
  // Local x points towards the head, y across the horns, z upwards.
  let toreMesh;
  function toreGeometry() {
    if (toreMesh) return toreMesh;
    const V=(x=0,y=0,z=0)=>({x,y,z});
    const add=(a,b)=>V(a.x+b.x,a.y+b.y,a.z+b.z),mul=(a,s)=>V(a.x*s,a.y*s,a.z*s);
    const sub=(a,b)=>add(a,mul(b,-1));
    const cross=(a,b)=>V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
    const unit=a=>mul(a,1/(Math.hypot(a.x,a.y,a.z)||1));
    const g={faces:[],lines:[]},wood='#b2afa5',darkWood='#7c7d73';
    const face=(points,normal,color)=>g.faces.push({points,normal:unit(normal),color,twoSided:false,alpha:1});
    // Slightly bevelled, tapered timber rather than identical square tubes.
    const beam=(a,b,width=2.8,color=wood,{depth=width*.72,taper=1,grain=true,bolts=false}={})=>{
      const d=unit(sub(b,a)),side=unit(cross(Math.abs(d.y)<.9?V(0,1,0):V(0,0,1),d)),up=unit(cross(d,side));
      const w=width/2,h=depth/2,bevel=Math.min(w,h)*.2;
      const outline=[[-w+bevel,-h],[w-bevel,-h],[w,-h+bevel],[w,h-bevel],[w-bevel,h],[-w+bevel,h],[-w,h-bevel],[-w,-h+bevel]];
      const point=(p,s,u,scale=1)=>add(p,add(mul(side,s*scale),mul(up,u*scale)));
      const rings=[outline.map(([s,u])=>point(a,s,u)),outline.map(([s,u])=>point(b,s,u,taper))];
      for(let i=0;i<outline.length;i++){
        const j=(i+1)%outline.length;
        const points=[rings[0][i],rings[0][j],rings[1][j],rings[1][i]];
        face(points,cross(sub(points[1],points[0]),sub(points[3],points[0])),color);
      }
      face(rings[0],mul(d,-1),darkWood);face(rings[1],d,darkWood);
      // Thin grain strips sit on the two broad faces; they share their normal
      // and depth ordering, so none shine through the opposite side in 3D.
      if(grain&&taper===1&&Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)>7)for(const sign of [-1,1]){
        for(const [offset,from,to] of [[-.34,.14,.43],[.25,.35,.82],[-.15,.65,.93]]){
          const start=add(a,mul(sub(b,a),from)),end=add(a,mul(sub(b,a),to));
          const s=offset*w,thickness=.025;
          face([point(start,s-thickness,sign*(h+.015)),point(end,s-thickness,sign*(h*taper+.015)),
            point(end,s+thickness,sign*(h*taper+.015)),point(start,s+thickness,sign*(h+.015))],mul(up,sign),'#a3a094');
        }
      }
      if(bolts)for(const sign of [-1,1]){
        const normal=mul(bolts==='edge'?side:up,sign),across=bolts==='edge'?up:side;
        const extent=bolts==='edge'?w:h,along=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
        const fractions=along>25?[.06,.11,.46,.51,.89,.94]:[.09,.17,.83,.91];
        for(const t of fractions){
          const center=add(add(a,mul(sub(b,a),t)),mul(normal,extent+.04));
          const ring=r=>Array.from({length:8},(_,i)=>add(center,add(mul(d,r*Math.cos(i*Math.PI/4)),mul(across,r*Math.sin(i*Math.PI/4)))));
          face(ring(.34),normal,'#8b877c');
          face(ring(.24).map(p=>add(p,mul(normal,.01))),normal,'#4d493f');
        }
      }
    };
    // The photograph's horns are broad, flat timber blades: almost horizontal,
    // dipping gently and curling only at the tips, not upright animal horns.
    const horn=side=>{
      const centers=Array.from({length:15},(_,i)=>{
        const t=i/14,u=1-t;
        return V(23*u*u*u+3*23*u*u*t+3*24*u*t*t+25*t*t*t,
          // Extend from the attachment point, without moving the horn roots.
          side*(7+1.55*(7*u*u*u+3*14*u*u*t+3*23*u*t*t+28*t*t*t-7)),
          12.5*u*u*u+3*10*u*u*t+3*6.5*u*t*t+9.2*t*t*t);
      });
      const rings=centers.map((p,i)=>{
        const t=i/14,halfX=1.3*(.85*(1-t)+.06),halfZ=1.3*(2.3*Math.pow(1-t,.9)+.04);
        return [V(p.x-halfX,p.y,p.z-halfZ),V(p.x+halfX,p.y,p.z-halfZ),V(p.x+halfX,p.y,p.z+halfZ),V(p.x-halfX,p.y,p.z+halfZ)];
      });
      for(let i=1;i<rings.length;i++)for(let j=0;j<4;j++){
        const k=(j+1)%4,points=[rings[i-1][j],rings[i-1][k],rings[i][k],rings[i][j]];
        const center=mul(points.reduce(add,V()),.25),mid=mul(add(centers[i-1],centers[i]),.5);
        let normal=unit(cross(sub(points[1],points[0]),sub(points[3],points[0])));
        const outward=sub(center,mid);
        if(normal.x*outward.x+normal.y*outward.y+normal.z*outward.z<0)normal=mul(normal,-1);
        face(points,normal,j%2?'#aaa89e':wood);
      }
      face(rings[0],V(0,-side,0),darkWood);face(rings[14],V(0,side,0),wood);
    };
    // Faithful to 20020402_taureau3: long upper rails, one great descending
    // diagonal and the shorter rising brace from the rear hock. There is no
    // closed rectangular belly frame, curved neck, ear, or projecting muzzle.
    for(const side of [-1,1]){
      const y=side*7,offset=side<0?2:0;
      beam(V(-25,side*8.2,15),V(16,side*8.2,17),4.6,'#b8b4aa',{depth:2.1,bolts:true});
      beam(V(-25,side*8.3,8),V(21,side*8.3,-6),4.8,wood,{depth:1.8,bolts:true});
      beam(V(-35,side*8.5,-12),V(-9,side*8.5,3),4.8,'#bdb9af',{depth:1.8,bolts:true});
      beam(V(-10,side*5.4,14),V(-8,side*5.4,-2),4.3,'#999a90',{depth:2.9});
      // Long sloping rear beams and straight forelegs, with broad timber shoes.
      beam(V(-23+offset,side*6.5,17),V(-34+offset,side*8,-12),5.2,'#9e9d92',{depth:3.4});
      beam(V(-34+offset,side*8,-12),V(-31+offset,side*8.5,-21),4.2,darkWood,{depth:3.6});
      const frontFoot=side>0?4:17;
      beam(V(7+offset,side*6,15),V(frontFoot,side*10,-20),5.2,'#a5a497',{depth:3.6});
      beam(V(-34+offset,side*8.5,-21),V(-28+offset,side*8.5,-21),3.8,'#95958b',{depth:5.8,grain:false,bolts:true});
      beam(V(frontFoot-2,side*10,-21),V(frontFoot+4,side*10,-21),3.8,'#99998f',{depth:5.8,grain:false,bolts:true});
      // The head is a tall, open frame, its bottom leaning very slightly back.
      beam(V(15,y,17),V(23,y,14),3.8,'#a9a99e',{depth:3});
      beam(V(23,side*7.2,15),V(21,side*7.2,-7),2.6,'#bebbb2',{depth:4.7,bolts:'edge'});
      beam(V(15,side*5.8,15),V(21,side*5.8,-6),3.6,'#929487',{depth:2.3});
      horn(side);
    }
    beam(V(-23,-8,16.5),V(-23,8,16.5),3.2,darkWood,{depth:4});
    beam(V(13,-8,18),V(13,8,18),3.4,darkWood,{depth:4});
    beam(V(23,-8,14),V(23,8,14),2.8,'#b5b2a8',{depth:4,bolts:'edge'});
    beam(V(21,-8,-6),V(21,8,-6),2.8,'#b7b4aa',{depth:4.6,bolts:'edge'});
    // The short rear projection is horizontal, as on the reference sculpture.
    beam(V(-23,0,13),V(-37,0,13),2.4,'#a7a89c',{depth:2.4,bolts:true});
    // The photographed sculpture is long and low; transform the normals too.
    // Display the Toré 20% smaller in both apps, while the longer horns remain
    // prominent. Scale about the physical centre, never along the trajectory.
    const displayScale=.84*.8;
    for(const f of g.faces){
      f.points=f.points.map(p=>V(p.x*1.15*displayScale,p.y*displayScale,p.z*.92*displayScale));
      f.normal=unit(V(f.normal.x/1.15,f.normal.y,f.normal.z/.92));
    }
    toreMesh=g;return toreMesh;
  }
  function tore(ctx) {
    const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
    // A fixed three-quarter view in the 2D plane: nose generally points +x.
    const eye={x:.336824,y:.925417,z:.173648},right={x:.939693,y:-.34202,z:0},up={x:-.059391,y:-.163176,z:.984808};
    const project=p=>({x:dot(p,right),y:-dot(p,up)});
    const light={x:-.25,y:.5,z:.83};
    const faces=toreGeometry().faces.filter(f=>dot(f.normal,eye)>0).map(f=>({f,depth:f.points.reduce((s,p)=>s+dot(p,eye),0)/f.points.length})).sort((a,b)=>a.depth-b.depth);
    for(const {f} of faces){
      const points=f.points.map(project),brightness=.65+.35*Math.max(0,dot(f.normal,light));
      ctx.fillStyle='rgb('+[1,3,5].map(i=>Math.round(parseInt(f.color.slice(i,i+2),16)*brightness)).join(',')+')';
      ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
      for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
      ctx.closePath();ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.35;ctx.stroke();
    }
  }
  function draw(ctx, kind, x, y, {angle = 0, time = 0} = {}) {
    if (!valid(kind) || kind === 'point' || ![x,y,angle,time].every(Number.isFinite)) return false;
    ctx.save(); ctx.translate(x,y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Keep their physical centre fixed while slightly reducing these two icons.
    if (kind === 'butterfly' || kind === 'ladybug') ctx.scale(.85,.85);
    // Slow illustrative wingbeat, tied to simulation time: frozen in pause.
    ctx.rotate(angle); const phase = 2 * Math.PI * 3 * time;
    if (kind === 'fly') fly(ctx,phase);
    else if (kind === 'butterfly') butterfly(ctx,phase);
    else if (kind === 'ladybug') ladybug(ctx);
    else tore(ctx);
    // Discreet centre marker: vectors and trajectory use this exact point.
    ellipse(ctx,0,0,1.4,1.4,0,'#fff0c5');
    ctx.restore(); return true;
  }
  window.PhysMobile = Object.freeze({kinds, valid, normalize, draw, toreGeometry});
})();
