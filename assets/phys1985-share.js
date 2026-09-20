var physTranslate = globalThis.PhysLang?.t || (value => value);
/* Versioned, local-only configuration links. No server, storage or telemetry. */
(() => {
  'use strict';
  const PREFIX = '#configuration=', MAX_BYTES = 8 * 1024 * 1024;
  const clone = x => JSON.parse(JSON.stringify(x));
  const pick = (x, keys) => Object.fromEntries(keys.split(' ').map(k => [k, clone(x[k])]));
  function check(x, depth = 0, budget = {n: 0}) {
    if (++budget.n > 600000 || depth > 18) throw Error(physTranslate('Configuration trop volumineuse.'));
    if (x === null || typeof x === 'boolean') return;
    if (typeof x === 'number') { if (!Number.isFinite(x) || Math.abs(x) > 1e30) throw Error(physTranslate('Nombre non valide.')); return; }
    if (typeof x === 'string') { if (x.length > 3000) throw Error(physTranslate('Texte trop long.')); return; }
    if (!x || typeof x !== 'object') throw Error(physTranslate('Configuration non valide.'));
    for (const k of Object.keys(x)) {
      if (['__proto__', 'prototype', 'constructor'].includes(k)) throw Error(physTranslate('Clé non autorisée.'));
      check(x[k], depth + 1, budget);
    }
  }
  function set(target, source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error(physTranslate('Objet attendu.'));
    for (const [k, v] of Object.entries(source)) {
      if (!Object.hasOwn(target, k) || typeof v !== typeof target[k]) throw Error(physTranslate('Paramètre non reconnu : ') + k);
      if (v && typeof v === 'object' && !Array.isArray(v)) set(target[k], v);
      else target[k] = clone(v);
    }
  }
  function range(x, min, max) { if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw Error(physTranslate('Valeur hors limites.')); return x; }
  function member(x, options) { if (!options.includes(x)) throw Error(physTranslate('Choix non reconnu.')); return x; }
  function controls() {
    return Object.fromEntries([...document.querySelectorAll('input[id],select[id]')]
      .filter(e => !e.closest('[data-share-ui],[data-language-ui]') && !['file', 'password', 'button', 'submit'].includes(e.type))
      .map(e => [e.id, ['checkbox', 'radio'].includes(e.type) ? e.checked : e.value]));
  }
  function applyControls(values) {
    for (const [id, v] of Object.entries(values || {})) {
      const e = document.getElementById(id);
      if (!e || e.closest('[data-share-ui],[data-language-ui]') || !e.matches('input,select')) continue;
      if (['checkbox', 'radio'].includes(e.type)) { if (typeof v === 'boolean') e.checked = v; }
      else if (typeof v === 'string' && (!e.matches('select') || [...e.options].some(o => o.value === v))) e.value = v;
    }
  }
  function bytes64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
  async function streamBytes(stream) {
    const r = stream.getReader(), chunks = []; let size = 0;
    for (;;) { const {done, value} = await r.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { await r.cancel(); throw Error(physTranslate('Configuration trop volumineuse.')); } chunks.push(value); }
    const bytes = new Uint8Array(size); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; } return bytes;
  }
  async function encode(snapshot) {
    check(snapshot); const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    if (bytes.length > MAX_BYTES) throw Error(physTranslate('Historique trop long pour un lien. Recommencez une expérience plus courte.'));
    const gzip = typeof CompressionStream === 'function';
    return (gzip ? '1z.' : '1j.') + bytes64(gzip ? await streamBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))) : bytes);
  }
  async function decode(encoded) {
    if (encoded.length > MAX_BYTES * 1.4 || !/^1[zj]\.[A-Za-z0-9_-]+$/.test(encoded)) throw Error(physTranslate('Lien incomplet ou format non reconnu.'));
    const raw = Uint8Array.from(atob(encoded.slice(3).replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    const bytes = encoded[1] === 'z' ? await streamBytes(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))) : raw;
    const result = JSON.parse(new TextDecoder().decode(bytes)); check(result); return result;
  }
  let adapter, ready = false, loaded = false, status, panel, linkField, shareButton;
  function capture() {
    if (!ready) throw Error(physTranslate('L’application se prépare encore.'));
    const snapshot = {version: 1, app: adapter.id, data: clone(adapter.capture()), controls: controls(), details: [...document.querySelectorAll('details:not([data-share-ui])')].map(e => e.open)};
    check(snapshot); return snapshot;
  }
  async function restore(snapshot) {
    check(snapshot);
    if (snapshot.version !== 1 || snapshot.app !== adapter.id || !snapshot.data || !snapshot.controls) throw Error(physTranslate('Ce lien concerne une autre application ou une version non prise en charge.'));
    const old = ready ? capture() : null;
    const apply = s => {
      const ui = () => applyControls(s.controls); ui(); adapter.restore(clone(s.data), ui); ui();
      [...document.querySelectorAll('details:not([data-share-ui])')].forEach((e, i) => { if (typeof s.details?.[i] === 'boolean') e.open = s.details[i]; });
    };
    try { apply(snapshot); } catch (error) { if (old) apply(old); throw error; }
  }
  async function makeLink() {
    const snapshot = capture(); // Capture synchronously, before asynchronous compression.
    const url = new URL(location.href); url.search = '';
    if(window.PhysLang)url.searchParams.set('lang',PhysLang.language);
    url.hash = PREFIX + await encode(snapshot); return url.href;
  }
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function mount() {
    const host = document.querySelector('.app-header') || document.querySelector('header') || document.body;
    const wrap = document.createElement('div'); wrap.dataset.shareUi = ''; wrap.className = 'phys-share';
    const button = document.createElement('button'); shareButton=button;button.disabled=true;button.type = 'button'; button.id = 'share-configuration'; button.textContent = physTranslate('Partager'); button.title = physTranslate('Créer un lien conservant paramètres, options, vue et instant — ouvert en pause');
    panel = document.createElement('div'); panel.className = 'phys-share-panel'; panel.hidden = true;
    const label = document.createElement('label'); label.htmlFor = 'share-configuration-link'; label.textContent = physTranslate('Lien vers cet état, ouvert en pause');
    linkField = document.createElement('textarea'); linkField.id = label.htmlFor; linkField.readOnly = true; linkField.rows = 2; linkField.spellcheck = false;
    status = document.createElement('p'); status.className = 'phys-share-status'; status.setAttribute('role', 'status');
    panel.append(label, linkField); wrap.append(button, panel, status); host.append(wrap);
    // Editing/selecting the link must not trigger the simulation's shortcuts.
    wrap.addEventListener('keydown', e => e.stopPropagation());
    linkField.addEventListener('click', () => linkField.select());
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const url = await makeLink(); linkField.value = url; panel.hidden = false;
        let copied = false; try { await navigator.clipboard.writeText(url); copied = true; } catch (_) { linkField.focus(); linkField.select(); }
        const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
        message((copied ? physTranslate('Lien copié.') : physTranslate('Copiez le lien ci-dessus.')) + (local ? physTranslate(' Lien local : nécessite ce même fichier ou serveur. La version publiée permettra le partage aux étudiants.') : physTranslate(' La configuration s’ouvrira en pause.')) + (url.length > 16000 ? physTranslate(' Lien long : certains outils de messagerie peuvent le tronquer.') : ''));
      } catch (error) { message(error.message, true); }
      finally { button.disabled = false; }
    });
  }
  let restoreSequence=0;
  async function restoreLocation() {
    const sequence=++restoreSequence,hash=location.hash;
    if (!hash.startsWith(PREFIX)) return false;
    adapter.pause?.();
    try {
      const snapshot=await decode(hash.slice(PREFIX.length));
      if(sequence!==restoreSequence)return false;
      await restore(snapshot);
      if(!panel.hidden){const url=new URL(location.href);url.search='';if(window.PhysLang)url.searchParams.set('lang',PhysLang.language);linkField.value=url.href;}
      message(physTranslate('Configuration restaurée — en pause.'));return true;
    } catch (error) {if(sequence===restoreSequence)message(physTranslate('Lien non chargé : ') + error.message, true);return false;}
  }
  async function register(a) {
    if (adapter) throw Error(physTranslate('Une seule application par page.'));
    adapter = a; mount(); ready = true;
    window.addEventListener('hashchange',()=>{void restoreLocation();});
    try {return await restoreLocation();}
    finally {loaded=true;shareButton.disabled=false;window.dispatchEvent(new Event('phys-share-ready'));}
  }
  window.PhysShare = Object.freeze({register, capture, restore, makeLink, encode, decode, pick, set, range, member, clone, get ready() { return loaded; }});
})();
