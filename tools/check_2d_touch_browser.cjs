'use strict';
// Real browser touch input (not synthetic PointerEvents): exercise capture,
// touch-action, one/two/three fingers and tablet CSS/DPR coordinates together.
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const near=(a,b,tol=1e-6)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const span=v=>v.xmax-v.xmin;
const sameView=(a,b)=>{for(const key of ['xmin','xmax','ymin','ymax'])near(a[key],b[key]);};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    for(const viewport of [{width:1024,height:1366},{width:1180,height:820},{width:768,height:1024}]){
      const page=await browser.newPage({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:2}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        const p=CanvasRenderingContext2D.prototype,strokeRect=p.strokeRect;
        p.strokeRect=function(...args){if(this.canvas.id==='scene-canvas'&&this.strokeStyle==='#bbcbd9')window.__plot=args;return strokeRect.apply(this,args);};
      });
      const cdp=await page.context().newCDPSession(page);
      try{
        await page.goto(pathToFileURL(path.join(root,'cinematique_2d_webapp_fr.html')).href);
        await page.waitForFunction(()=>window.PhysShare?.ready&&!document.getElementById('loading-message'));
        if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
        const capture=()=>page.evaluate(()=>PhysShare.capture().data);
        const view=async()=>(await capture()).view;
        const touch=async(type,points)=>{
          await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
          // Chrome coalesces touch moves until the next rendering frame.
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        };
        const finger=(id,x,y)=>({id,x,y});
        const plot=async()=>{
          await page.locator('#scene-canvas').scrollIntoViewIfNeeded();
          const b=await page.locator('#scene-canvas').boundingBox(),r=await page.evaluate(()=>window.__plot);
          return {left:b.x+r[0],top:b.y+r[1],width:r[2],height:r[3]};
        };
        const point=(r,fx,fy)=>({x:r.left+fx*r.width,y:r.top+fy*r.height});
        const world=(r,v,p)=>({x:v.xmin+(p.x-r.left)*span(v)/r.width,y:v.ymax-(p.y-r.top)*(v.ymax-v.ymin)/r.height});
        const reset=async()=>{await page.locator('#reset-view').click();return plot();};
        let r=await plot(),start=await capture();
        const browserScale=await page.evaluate(()=>visualViewport.scale);
        const center=point(r,.46,.61),half=Math.min(50,r.width*.12);
        const a=finger(1,center.x-half,center.y),b=finger(2,center.x+half,center.y);
        const anchor=world(r,start.view,center);
        await touch('touchStart',[a]);await touch('touchStart',[a,b]);
        // Spread and translate at the same time: the physical anchor follows
        // the fingers' midpoint, never the top-left corner or page origin.
        const delta={x:11,y:-9};
        const aa=finger(1,center.x-2*half+delta.x,center.y+delta.y),bb=finger(2,center.x+2*half+delta.x,center.y+delta.y);
        await touch('touchMove',[aa,bb]);
        let v=await view();near(span(v),span(start.view)/2,1e-4);
        const anchored=world(r,v,{x:center.x+delta.x,y:center.y+delta.y});near(anchored.x,anchor.x,1e-4);near(anchored.y,anchor.y,1e-4);
        near(await page.evaluate(()=>visualViewport.scale),browserScale);
        assert.deepEqual((await capture()).origin,start.origin);assert.deepEqual((await capture()).state,start.state);
        await touch('touchMove',[a,b]);sameView(await view(),start.view);
        // Release one finger, then pan with the other without a discontinuity.
        await touch('touchEnd',[b]);sameView(await view(),start.view);
        await touch('touchMove',[finger(1,a.x+14,a.y-7)]);
        v=await view();near(v.xmin,start.view.xmin-14*span(start.view)/r.width,1e-4);near(v.ymin,start.view.ymin-7*(start.view.ymax-start.view.ymin)/r.height,1e-4);
        await touch('touchEnd',[]);assert(!(await page.locator('#viewport').evaluate(e=>e.classList.contains('dragging'))));
        // Pinch inward, including the same bounds used by mouse-wheel zoom.
        r=await reset();const c=point(r,.5,.6),h=Math.min(70,r.width*.17);
        const pair=d=>[finger(1,c.x-d,c.y),finger(2,c.x+d,c.y)];
        await touch('touchStart',pair(h));await touch('touchMove',pair(h/2));near(span(await view()),16,1e-4);
        await touch('touchMove',pair(1));near(span(await view()),18,1e-4);await touch('touchCancel',[]);
        const small=pair(3);await touch('touchStart',small);await touch('touchMove',pair(h));near(span(await view()),1,1e-4);await touch('touchEnd',[]);
        // A third finger neither takes over the center nor alters scale.
        r=await reset();const cp=point(r,.5,.65),p1=finger(1,cp.x-35,cp.y),p2=finger(2,cp.x+35,cp.y),p3=finger(3,cp.x,cp.y+25);
        await touch('touchStart',[p1,p2]);const thirdBefore=await view();
        await touch('touchStart',[p1,p2,p3]);await touch('touchMove',[p1,p2,{...p3,x:p3.x+15}]);sameView(await view(),thirdBefore);
        await touch('touchEnd',[p1]);sameView(await view(),thirdBefore);
        await touch('touchCancel',[]);assert(!(await page.locator('#viewport').evaluate(e=>e.classList.contains('dragging'))));
        await touch('touchStart',[p1]);await touch('touchMove',[{...p1,x:p1.x+10}]);near((await view()).xmin,thirdBefore.xmin-10*span(thirdBefore)/r.width,1e-4);await touch('touchEnd',[]);
        // Two fingers must not redefine the origin, including when the first
        // finger is on O's handle or "Déplacer l’origine" is enabled.
        await reset();await page.locator('#move-origin').click();r=await plot();
        const initialOrigin=(await capture()).origin,op=point(r,.4,.65),oa=finger(1,op.x-25,op.y),ob=finger(2,op.x+25,op.y);
        await touch('touchStart',[oa]);await touch('touchStart',[oa,ob]);
        assert.deepEqual((await capture()).origin,initialOrigin);
        await touch('touchMove',[{...oa,x:oa.x-20},{...ob,x:ob.x+20}]);assert.deepEqual((await capture()).origin,initialOrigin);
        await touch('touchEnd',[{...ob,x:ob.x+20}]);await touch('touchMove',[{...oa,x:oa.x-10}]);await touch('touchEnd',[]);
        assert.deepEqual((await capture()).origin,initialOrigin);
        r=await reset();const place=point(r,.5,.6);await touch('touchStart',[finger(1,place.x,place.y)]);await touch('touchEnd',[]);
        const placed=(await capture()).origin,handle=await page.locator('#origin-handle').boundingBox(),oh=finger(1,handle.x+handle.width/2,handle.y+handle.height/2);
        const second=finger(2,oh.x+50,oh.y);
        await touch('touchStart',[oh]);await touch('touchMove',[{...oh,x:oh.x+5}]);await touch('touchStart',[{...oh,x:oh.x+5},second]);
        assert.deepEqual((await capture()).origin,placed);
        await touch('touchMove',[{...oh,x:oh.x-15},{...second,x:second.x+15}]);await touch('touchCancel',[]);assert.deepEqual((await capture()).origin,placed);
        // After cancellation a normal origin drag and its mouse counterpart work.
        r=await plot();const originStart=point(r,.2,.35),originEnd=point(r,.6,.7),beforeOrigin=await view(),expected=world(r,beforeOrigin,originEnd);
        await touch('touchStart',[finger(1,originStart.x,originStart.y)]);await touch('touchMove',[finger(1,originEnd.x,originEnd.y)]);await touch('touchEnd',[]);
        near((await capture()).origin.x,expected.x,1e-4);near((await capture()).origin.y,expected.y,1e-4);
        await page.locator('#move-origin').click();await page.locator('#reset-origin').click();
        // Wheel zoom preserves the anchor and rectangular shared views as well.
        await page.evaluate(async()=>{const s=PhysShare.capture();s.data.view={xmin:0,xmax:8,ymin:0,ymax:4};await PhysShare.restore(s);});
        r=await plot();const wheelAt=point(r,.4,.65),wheelBefore=await view(),wheelAnchor=world(r,wheelBefore,wheelAt);
        await page.mouse.move(wheelAt.x,wheelAt.y);await page.mouse.wheel(0,-100);
        await page.waitForFunction(()=>Math.abs(PhysShare.capture().data.view.xmax-PhysShare.capture().data.view.xmin-8)>.01);
        v=await view();near(span(v)/(v.ymax-v.ymin),2);const wa=world(r,v,wheelAt);near(wa.x,wheelAnchor.x,1e-3);near(wa.y,wheelAnchor.y,1e-3);
        const saved=await capture(),link=await page.evaluate(()=>PhysShare.makeLink());await page.goto(link);await page.waitForFunction(()=>PhysShare?.ready);
        sameView((await capture()).view,saved.view);assert.equal(await page.locator('#play-button').innerText(),'Lire');
        assert.deepEqual(errors,[]);assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
        if(process.env.SCREENSHOT_DIR){
          r=await reset();const mid=point(r,.5,.5),d=r.width*.08;
          const pair=d=>[finger(1,mid.x-d,mid.y),finger(2,mid.x+d,mid.y)];
          await touch('touchStart',pair(d));await touch('touchMove',pair(d*1.4));await touch('touchEnd',[]);
          await page.locator('#viewport').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`2d-touch-${viewport.width}.png`)});
        }
        console.log(`PASS tablet ${viewport.width}×${viewport.height}: pinch/anchor/bounds, pan, pointer transitions, cancellation, origin, wheel and shared view.`);
      }finally{await cdp.detach();await page.close();}
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
