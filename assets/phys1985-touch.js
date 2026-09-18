/* Native pinch zoom without editing the experiment. No dependencies/network.
 * Kinematics keeps its own anchored scene zoom. Other canvases use page zoom.
 * A one-finger edit is provisional until the gesture is known to be single-touch:
 * on a second finger (or native scroll cancellation), restore its starting state.
 */
(() => {
  'use strict';
  function mount() {
    const kind = document.body.dataset.app;
    const customScene = kind === 'kinematics-2d' || kind === 'kinematics-3d';
    const surfaces = {
      collisions: '#history', conservation: '#history,.mass-handle',
      statics: '#scene', friction: '#history', angular: '#scene-canvas,#history',
      potential: '#potential-plot,#force-plot,.body-handle,#plane-map,#plane-surface,#plane-x-plot,#plane-y-plot',
      pulleys: '#scene,#history', energy: '#scene-viewport,.path-scene'
    };
    const protectedSelector = (surfaces[kind] ? surfaces[kind] + ',' : '') + 'input[type="range"]';
    // Preserve one-finger behaviour: none -> pinch only, pan-y -> pan-y + pinch.
    // Both the canvas AND restrictive ancestors must allow the native gesture.
    if (!customScene) for (const el of document.querySelectorAll('canvas,#scene,#scene-viewport,#history,.history-wrap,.plot-wrap,.plane-map,.plane-surface,.mass-handle,.body-handle,.path-scene,.path-point')) {
      const action = getComputedStyle(el).touchAction;
      if (action === 'none') el.dataset.physPinch = 'only';
      else if (action === 'pan-y') el.dataset.physPinch = 'vertical';
    }
    for (const input of document.querySelectorAll('input[type="checkbox"]')) input.closest('label')?.classList.add('phys-touch-check');
    if (!customScene) {
      const footer = document.querySelector('.panel-footer');
      if (footer) {
        const hint = document.createElement('span'); hint.className = 'phys-touch-help';
        hint.textContent = 'Un doigt : manipuler · deux doigts : agrandir la page';
        footer.append(hint);
      }
    }
    const points = new Map();
    const detachedTargets = new Map();
    let saved = null, blocked = false, custom = false, cancelling = false;
    let physicalTouches = 0, suppressClick = false, restoring = false, cancelledValues = null;
    const stop = e => e.stopImmediatePropagation();
    function capture() {
      if (!window.PhysShare?.ready) return null;
      return {
        state: PhysShare.capture(),
        // Restoring a shared state normally pauses. A cancelled edit must instead
        // resume whatever animation/balayage was running before the first finger.
        playing: [...document.querySelectorAll('button[id]')].filter(e => e.textContent.trim() === 'Pause').map(e => e.id)
      };
    }
    function cancelPointers() {
      cancelling = true;
      try {
        for (const [id, p] of points) {
          let target = p.target;
          for (let el = target; el instanceof Element; el = el.parentElement) if (el.hasPointerCapture?.(id)) { target = el; break; }
          target.dispatchEvent(new PointerEvent('pointercancel', {bubbles:true,pointerId:id,pointerType:'touch',isPrimary:p.primary,clientX:p.x,clientY:p.y}));
          if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
        }
      } finally { cancelling = false; }
    }
    function rollback(resume = true) {
      const initial = saved;
      if (!initial || restoring) return;
      saved = null; restoring = true;
      // restore() applies synchronously; the promise also reports validation errors.
      Promise.resolve(PhysShare.restore(initial.state)).then(() => {
        if (resume && !document.hidden) for (const id of initial.playing) {
          const button = document.getElementById(id);
          if (button && button.textContent.trim() !== 'Pause') button.click();
        }
      }).catch(error => console.error('Restauration du geste tactile :', error)).finally(() => { restoring = false; });
    }
    function nativeGesture(resume = true) {
      if (custom || blocked) return;
      blocked = true; suppressClick = true;
      cancelledValues = saved?.state.controls || null;
      cancelPointers(); rollback(resume);
    }
    function blockRange(e) {
      if ((blocked || restoring || suppressClick) && e.isTrusted && e.target.matches?.('input[type="range"]')) {
        const value = cancelledValues?.[e.target.id];
        if (typeof value === 'string') e.target.value = value;
        stop(e);
      }
    }
    function updateTouches(e) {
      physicalTouches = e.touches.length;
      if (e.type === 'touchstart') { if (physicalTouches > 1 && !custom) nativeGesture(); }
      else if (!physicalTouches) clear();
    }
    function watchTarget(target) {
      if (detachedTargets.has(target)) return;
      // Some adapters rebuild range controls when restoring. A Touch sequence
      // still belongs to its ORIGINAL node, even after removal from the DOM.
      // Its final events will no longer reach document: retain a local guard.
      const types = ['touchstart','touchend','touchcancel','pointermove','pointerup','pointercancel','input','change','click'];
      const listen = e => {
        if (target.isConnected || cancelling) return;
        if (e.type.startsWith('touch')) { updateTouches(e); return; }
        if (e.type === 'input' || e.type === 'change') { blockRange(e); return; }
        if (e.type === 'click') { if (suppressClick && e.isTrusted && e.detail > 0) { e.preventDefault(); stop(e); } return; }
        if (e.pointerType !== 'touch' || custom) return;
        if (e.type === 'pointercancel') nativeGesture();
        if (blocked || restoring) stop(e);
        if (e.type !== 'pointermove') points.delete(e.pointerId);
      };
      for (const type of types) target.addEventListener(type, listen, {capture:true,passive:type.startsWith('touch')});
      detachedTargets.set(target, () => { for (const type of types) target.removeEventListener(type, listen, true); });
    }
    function clear() {
      points.clear(); saved = null; blocked = false; custom = false; physicalTouches = 0;
      for (const remove of detachedTargets.values()) remove(); detachedTargets.clear();
    }
    document.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') { suppressClick = false; cancelledValues = null; return; }
      if (!points.size && !physicalTouches && !blocked) {
        suppressClick = false;
        cancelledValues = null;
        custom = customScene && !!e.target.closest?.('#viewport');
        if (!custom && e.target.closest?.(protectedSelector)) saved = capture();
      }
      points.set(e.pointerId, {target:e.target,primary:e.isPrimary,x:e.clientX,y:e.clientY});
      if (!custom) watchTarget(e.target);
      if (!custom && (blocked || points.size > 1 || physicalTouches > 1)) { nativeGesture(); stop(e); }
    }, true);
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch' || cancelling) return;
      const p = points.get(e.pointerId); if (p) { p.x=e.clientX; p.y=e.clientY; }
      if (!custom && (blocked || restoring)) stop(e);
    }, true);
    for (const type of ['pointerup','pointercancel']) document.addEventListener(type, e => {
      if (e.pointerType !== 'touch' || cancelling) return;
      if (type === 'pointercancel' && !custom) nativeGesture();
      if (blocked && !custom) stop(e);
      points.delete(e.pointerId);
      // Keep the lock through native pointercancel: the physical fingers are
      // still on screen. In particular, lifting one finger must NOT restart drag.
    }, true);
    for (const type of ['touchstart','touchend','touchcancel']) document.addEventListener(type, updateTouches, {capture:true,passive:true});
    // A native range input can emit input/change during its default action even
    // if PointerEvents were stopped. Do not let those events alter the model.
    for (const type of ['input','change']) document.addEventListener(type, blockRange, true);
    document.addEventListener('keydown', () => { suppressClick = false; cancelledValues = null; }, true);
    document.addEventListener('click', e => {
      if (suppressClick && e.isTrusted && e.detail > 0) { e.preventDefault(); stop(e); }
    }, true);
    window.addEventListener('blur', () => { if (!custom && points.size) nativeGesture(false); clear(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (!custom && points.size) nativeGesture(false); clear(); } });
    window.addEventListener('resize', () => { if (!custom && points.size) nativeGesture(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
