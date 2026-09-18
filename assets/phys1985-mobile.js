/* Small canvas illustrations: identical offline on every browser, no emoji font
 * or image download. (x,y) is always the physical position; size is in CSS px.
 * The apps retain their original point renderer and all their physics. */
(() => {
  'use strict';
  const kinds = Object.freeze(['point', 'fly', 'butterfly', 'ladybug']);
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
  function draw(ctx, kind, x, y, {angle = 0, time = 0} = {}) {
    if (!valid(kind) || kind === 'point' || ![x,y,angle,time].every(Number.isFinite)) return false;
    ctx.save(); ctx.translate(x,y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Slow illustrative wingbeat, tied to simulation time: frozen in pause.
    ctx.rotate(angle); const phase = 2 * Math.PI * 3 * time;
    if (kind === 'fly') fly(ctx,phase);
    else if (kind === 'butterfly') butterfly(ctx,phase);
    else ladybug(ctx);
    // Discreet centre marker: vectors and trajectory use this exact point.
    ellipse(ctx,0,0,1.4,1.4,0,'#fff0c5');
    ctx.restore(); return true;
  }
  window.PhysMobile = Object.freeze({kinds, valid, normalize, draw});
})();
