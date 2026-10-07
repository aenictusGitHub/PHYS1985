'use strict';
// Pure geometry and sampling checks for the integrated coordinate traces.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const root = path.join(__dirname, '..');
const archive = path.join(root, 'cinematique_2d_webapp_fr.zip');
const entry = execFileSync('unzip', ['-Z1', archive], {encoding:'utf8'})
  .split('\n').find(name => /^[^/]+\/app\.js$/.test(name));
assert(entry, 'the source archive contains app.js');
const source = execFileSync('unzip', ['-p', archive, entry], {encoding:'utf8'});
const html = fs.readFileSync(path.join(root, 'cinematique_2d_webapp_fr.html'), 'utf8');
assert(html.includes(source), 'the standalone page embeds the tested source');
for (const id of ['trace-coordinates','coordinate-time-labels',
  'coordinate-time-x-title','coordinate-time-y-title',
  'coordinate-time-scale','coordinate-time-scale-digits',
  'coordinate-time-scale-bar','scene-canvas']) {
  assert(html.includes(`id="${id}"`), `${id} is present in the standalone page`);
}
assert(!html.includes('id="coordinate-plots-toggle"'), 'the redundant sidebar checkbox is removed');
assert(!source.includes('coordinatePlotsToggle'), 'the removed checkbox has no remaining JavaScript reference');
assert(!html.includes('id="coordinate-x-canvas"'), 'obsolete separate graphs removed');
assert(!html.includes('id="coordinate-graph-labels"'), 'floating coordinate readouts removed');
assert(!html.includes('coordinate-time-tick-label'), 'individual time numbers are removed');
assert(!source.includes('coordinateTimeTickElements'), 'the removed time-number elements are not updated');
assert(source.includes('drawCoordinateGraphs(item, data.position);'), 'graphs share the main scene');
assert(source.includes('drawProjectionSystem(data.position);'), 'orange spatial projections remain');
assert(source.indexOf('    drawProjectionSystem(data.position);') < source.indexOf('    drawCoordinateGraphs(item, data.position);'), 'graph projection markers stay above dashed guides');
assert(source.includes('coordinateGraphsVisible ? V(p.x, plotRect.bottom)'), 'x projection follows the visible bottom edge after zoom');
assert(source.includes('coordinateGraphsVisible ? V(plotRect.left, p.y)'), 'y projection follows the visible left edge after zoom');
assert(source.includes("dom.coordinatePlotsButton.addEventListener('click'"), 'scene button toggles the coordinate graphs');
const graphDrawing = source.slice(source.indexOf('  function drawCoordinateGraph('),source.indexOf('  function drawCoordinateGraphs('));
assert(graphDrawing.includes('coordinateTimeTicks(series.duration, now)'), 'absolute time graduations are shared by both graphs');
assert(graphDrawing.includes('if (state.grid)'), 'graph graticules follow the grid toggle');
assert(graphDrawing.includes('ctx.lineTo(area.left-7,point.y)'), 'x(t) time ticks point outward');
assert(graphDrawing.includes('ctx.lineTo(point.x,area.bottom+7)'), 'y(t) time ticks point outward');
assert(graphDrawing.includes('coordinateGraphPoint(axis, tick.time, now'), 'all temporal ticks move with elapsed time');
assert(!graphDrawing.includes('timeOrigin'), 'the zero tick has the same length and weight as other temporal ticks');
assert(!graphDrawing.includes('fillText('), 'time values are not painted as plain canvas text');
assert(html.includes('class="coordinate-time-label coordinate-time-title"><span class="tex-math">\\(t\\,[\\mathrm s]\\)</span>'), 'both temporal axes show t with seconds');
assert(!html.includes('Échelle commune'), 'the explanatory scale caption is removed');
assert(!html.includes('1 graduation = '), 'the explanatory scale sentence is removed');
assert(source.includes('setMathDigits(dom.coordinateTimeScaleDigits,String(coordinateTimeStep(duration)))'), 'the common scale follows the trajectory duration');
assert(source.includes('dom.coordinateTimeScaleBar.style.width = `${barLength}px`'), 'scale-bar length follows the same time geometry as the ticks');
assert(html.includes('.coordinate-time-scale-bar::before') && html.includes('.coordinate-time-scale-bar::after'), 'the scale segment has endpoint caps');
assert(source.includes('areas.y.left+0.5*barLength'), 'the static scale bar starts at the left end of the time axis');
assert(!source.includes('coordinateTimeScaleLeft'), 'the scale bar no longer follows moving ticks');
const scalePlacement = source.slice(source.indexOf('  function updateCoordinateTimeLabels('),source.indexOf('  function derivatives('));
assert(!scalePlacement.includes('state.time'), 'playing the animation does not move the scale bar');
assert(source.includes('areas.x.top+0.5*areas.timeExtent'), 'common scale stays in the empty lower-left corner');
assert(graphDrawing.includes("ctx.fillStyle = 'rgba(217,104,59,0.68)'"), 'orange projection dots retain their filled appearance');
assert(graphDrawing.includes("ctx.strokeStyle = 'rgba(255,255,255,0.92)'"), 'orange projection dots retain their white outline');
assert(graphDrawing.includes('currentSpatialCoordinateIsVisible'), 'out-of-frame projection dots are hidden after zoom');
assert(source.includes('place(dom.axisLabels.x,plotRect.left+0.5*plotRect.width,'), 'spatial x title is centered above the top edge');
assert(source.includes('state.coordinatePlots ? plotRect.top-52 : plotRect.bottom+54'), 'spatial x title clears the top tick labels');
assert(source.includes('state.coordinatePlots ? Math.min(viewportWidth-34,plotRect.right+72)'), 'spatial y title is outside the right edge');
assert(source.includes('state.coordinatePlots ? Math.min(viewportWidth-34,plotRect.right+72) : plotRect.left-80'), 'ordinary y title is left of the vertical axis');
assert(source.includes('plotRect.top+0.5*plotRect.height);'), 'spatial y title is vertically centered in both modes');
assert(source.includes('place(dom.coordinateTimeYTitle,areas.y.left-12,areas.y.bottom)'), 'horizontal temporal title is left of and aligned with its axis');
assert(source.includes('place(dom.coordinateTimeXTitle,areas.x.left-26,areas.x.bottom-18)'), 'vertical temporal title is moved further left');
assert(source.includes('oppositeEdgeTicks ? plotRect.top-7 : plotRect.bottom+7'), 'spatial x tick marks move outside the top edge');
assert(source.includes('oppositeEdgeTicks ? plotRect.right+7 : plotRect.left-7'), 'spatial y tick marks move outside the right edge');
assert(source.includes('oppositeEdgeTicks ? plotRect.top-14 : plotRect.bottom+14'), 'spatial x numbers move outside the top edge');
assert(source.includes('oppositeEdgeTicks ? plotRect.right+14 : plotRect.left-14'), 'spatial y numbers move outside the right edge');
assert(html.includes('#axis-ticks-x.coordinate-plots-active .axis-tick-label'), 'spatial x numbers are aligned above their ticks');
assert(html.includes('#axis-ticks-y.coordinate-plots-active .axis-tick-label'), 'spatial y numbers are aligned right of their ticks');

const start = source.indexOf("  const viewport = document.getElementById('viewport');");
const position = source.indexOf('  function positionAt(');
const drawGraph = source.indexOf('  function drawCoordinateGraph(');
assert(start > 0 && position > start && drawGraph > position);
const model = source.slice(0, start)
  + '  const state={time:0}; const origin=V(0,0);'
  + '  const plotRect={left:190,right:590,top:100,bottom:500,width:400,height:400};'
  + '  const viewportHeight=700; const view={xmin:0,xmax:8,ymin:0,ymax:8};'
  + '  const worldToScreen=p=>V(plotRect.left+(p.x-view.xmin)*plotRect.width/(view.xmax-view.xmin),plotRect.bottom-(p.y-view.ymin)*plotRect.height/(view.ymax-view.ymin));'
  + '  const trajectoryTimeMax=item=>item.closed?2*item.duration:item.duration;'
  + source.slice(position, drawGraph)
  + '  return {state,origin,view,worldToScreen,TRAJECTORIES,mcParameters,lissajousParameters,positionAt,coordinateSeries,coordinateGraphAreas,coordinateGraphPoint,coordinateTimeStep,coordinateTimeScaleLength,coordinateTimeTicks,clear:()=>{coordinateSamples=null;}};})();';
const api = vm.runInNewContext(model, {console});
const close = (actual, expected, tolerance=1e-8) => assert(Math.abs(actual-expected) <= tolerance, `${actual} != ${expected}`);

for (const [name,item] of Object.entries(api.TRAJECTORIES)) {
  api.clear();
  const series = api.coordinateSeries(item);
  assert(series.duration > 0 && Number.isFinite(series.duration), `${name}: valid duration`);
  assert(series.rows.length >= 361 && series.rows.length <= 961, `${name}: bounded sampling`);
  close(series.rows[0].t,0);close(series.rows.at(-1).t,series.duration);
  for (const row of series.rows) assert([row.t,row.x,row.y].every(Number.isFinite), `${name}: finite samples`);
  const startPosition = api.positionAt(item,0),endPosition = api.positionAt(item,series.duration);
  close(series.rows[0].x,startPosition.x);close(series.rows[0].y,startPosition.y);
  close(series.rows.at(-1).x,endPosition.x);close(series.rows.at(-1).y,endPosition.y);
  assert.equal(api.coordinateSeries(item),series,`${name}: samples reused`);
}

const areas=api.coordinateGraphAreas();
close(areas.y.right,190);
close(areas.x.top,500);
close(areas.x.right-areas.x.left,areas.y.bottom-areas.y.top);
close(areas.x.bottom-areas.x.top,areas.y.right-areas.y.left);
for (const bounds of [
  {xmin:2,xmax:6,ymin:2,ymax:6},       // zoom in: the world origin is outside
  {xmin:-0.4,xmax:8.4,ymin:-0.4,ymax:8.4}, // zoom out: the origin moves inward
  {xmin:1,xmax:9,ymin:-1,ymax:7},       // panned view
]) {
  Object.assign(api.view,bounds);
  const zoomedAreas=api.coordinateGraphAreas();
  close(zoomedAreas.y.right,190);
  close(zoomedAreas.x.top,500);
  close(zoomedAreas.timeExtent,areas.timeExtent);
  close(zoomedAreas.x.right-zoomedAreas.x.left,zoomedAreas.y.bottom-zoomedAreas.y.top);
  close(zoomedAreas.x.bottom-zoomedAreas.x.top,zoomedAreas.y.right-zoomedAreas.y.left);
  const projected=api.worldToScreen({x:3,y:5});
  if (bounds.xmin === 2) {
    close(projected.x,290);
    close(projected.y,200);
  }
  close(api.coordinateGraphPoint('x',3,3,projected,zoomedAreas.x,8).x,projected.x);
  close(api.coordinateGraphPoint('x',3,3,projected,zoomedAreas.x,8).y,500);
  close(api.coordinateGraphPoint('y',3,3,projected,zoomedAreas.y,8).x,190);
  close(api.coordinateGraphPoint('y',3,3,projected,zoomedAreas.y,8).y,projected.y);
}
api.origin.x=2;api.origin.y=2;
close(api.coordinateGraphAreas().y.right,190);
close(api.coordinateGraphAreas().x.top,500);
api.origin.x=0;api.origin.y=0;
Object.assign(api.view,{xmin:0,xmax:8,ymin:0,ymax:8});
const xTicks=api.coordinateTimeTicks(24,22.75);
const yTicks=api.coordinateTimeTicks(24,22.75);
assert.deepEqual(Array.from(xTicks, tick=>tick.time),[0,5,10,15,20],'24 s motion uses a readable 5 s step');
assert.deepEqual(Array.from(xTicks, tick=>tick.time),Array.from(yTicks, tick=>tick.time),'equal time scales after rotation');
assert.deepEqual(Array.from(api.coordinateTimeTicks(24,9.99), tick=>tick.time),[0,5],'future ticks remain hidden');
assert.deepEqual(Array.from(api.coordinateTimeTicks(24,10), tick=>tick.time),[0,5,10],'a tick appears at its instant');
const roseDuration=2*api.TRAJECTORIES.rose5.duration;
assert.equal(api.coordinateTimeStep(roseDuration),2,'rose uses its short characteristic period');
assert.deepEqual(Array.from(api.coordinateTimeTicks(roseDuration,7.8),tick=>tick.time),[0,2,4,6],'rose shows several moving ticks by 7.8 s');
const ballisticDuration=api.TRAJECTORIES.ballistic.duration;
assert.equal(api.coordinateTimeStep(ballisticDuration),0.5,'brief ballistic flight uses sub-second ticks');
assert.deepEqual(Array.from(api.coordinateTimeTicks(ballisticDuration,1.1),tick=>tick.time),[0,0.5,1],'decimal tick labels are exact');
const butterflyDuration=2*api.TRAJECTORIES.butterfly.duration;
assert.equal(api.coordinateTimeStep(butterflyDuration),20,'long butterfly motion uses wider ticks');
for (const totalDuration of [24,roseDuration,ballisticDuration,butterflyDuration]) {
  const step=api.coordinateTimeStep(totalDuration);
  const bar=api.coordinateTimeScaleLength(totalDuration,areas.timeExtent);
  const spatialPoint={x:320,y:215};
  const xCurrent=api.coordinateGraphPoint('x',step,step,spatialPoint,areas.x,totalDuration);
  const xPrevious=api.coordinateGraphPoint('x',0,step,spatialPoint,areas.x,totalDuration);
  const yCurrent=api.coordinateGraphPoint('y',step,step,spatialPoint,areas.y,totalDuration);
  const yPrevious=api.coordinateGraphPoint('y',0,step,spatialPoint,areas.y,totalDuration);
  close(bar,Math.abs(xPrevious.y-xCurrent.y));
  close(bar,Math.abs(yPrevious.x-yCurrent.x));
  const barCenter=areas.y.left+0.5*bar;
  close(barCenter-0.5*bar,areas.y.left);
  assert(barCenter+0.5*bar<=areas.y.right+1e-8,'the static scale remains inside the time band');
}
const spatial={x:320,y:215},duration=8;
for (const now of [0,2,4,8]) {
  const currentX=api.coordinateGraphPoint('x',now,now,spatial,areas.x,duration);
  const currentY=api.coordinateGraphPoint('y',now,now,spatial,areas.y,duration);
  close(currentX.x,spatial.x);close(currentX.y,500);
  close(currentY.x,190);close(currentY.y,spatial.y);
  for (const prior of [0,now/2,now]) {
    const px=api.coordinateGraphPoint('x',prior,now,spatial,areas.x,duration);
    const py=api.coordinateGraphPoint('y',prior,now,spatial,areas.y,duration);
    close(px.y,areas.x.top+(now-prior)/duration*areas.timeExtent);
    close(py.x,areas.y.right-(now-prior)/duration*areas.timeExtent);
  }
  const xOrigin=api.coordinateGraphPoint('x',0,now,spatial,areas.x,duration);
  const yOrigin=api.coordinateGraphPoint('y',0,now,spatial,areas.y,duration);
  close(xOrigin.y,areas.x.top+now/duration*areas.timeExtent);
  close(yOrigin.x,areas.y.right-now/duration*areas.timeExtent);
}
for (const now of [10,15,20,24]) {
  for (const tick of api.coordinateTimeTicks(24,now)) {
    const x=api.coordinateGraphPoint('x',tick.time,now,spatial,areas.x,24);
    const y=api.coordinateGraphPoint('y',tick.time,now,spatial,areas.y,24);
    close(x.y,areas.x.top+(now-tick.time)/24*areas.timeExtent);
    close(y.x,areas.y.right-(now-tick.time)/24*areas.timeExtent);
  }
}
api.mcParameters.R=3;api.clear();
assert(api.coordinateSeries(api.TRAJECTORIES.mc).rows.every(row=>Number.isFinite(row.x)&&Number.isFinite(row.y)));
api.lissajousParameters.mode='constant-speed';api.clear();
assert(api.coordinateSeries(api.TRAJECTORIES.lissajous2).rows.every(row=>Number.isFinite(row.x)&&Number.isFinite(row.y)));
console.log('PASS: projection tracers, zoom-stable graphs, and one time-scale bar matching both axes.');
