/* Offline language selection. The build embeds the reviewed English catalogue. */
(() => {
  'use strict';
  const english = /* PHYS1985_ENGLISH */ {};
  const valid = value => value === 'fr' || value === 'en';
  const storageKey = 'phys1985-language';
  let saved; try { saved = localStorage.getItem(storageKey); } catch (_) {}
  const requested = new URL(location.href).searchParams.get('lang');
  const language = valid(requested) ? requested : valid(saved) ? saved : 'fr';
  document.documentElement.lang = language;
  const normalize = text => text.trim().replace(/\s+/g, ' ');
  const keys = Object.keys(english).sort((a,b) => b.length-a.length);
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern = keys.length ? new RegExp(keys.map(escape).join('|'),'gu') : null;
  function t(value) {
    if (language !== 'en' || typeof value !== 'string') return value;
    const key = normalize(value);
    if (Object.hasOwn(english,key)) return value.slice(0,value.length-value.trimStart().length)+english[key]+value.slice(value.trimEnd().length);
    if (!pattern) return value;
    return value.replace(pattern,(match,offset,source) => {
      // Do not change identifiers, substrings of words, units or TeX commands.
      if (/^[\p{L}\p{N}_]/u.test(match) && /[\p{L}\p{N}_\\]$/u.test(source.slice(0,offset))) return match;
      if (/[\p{L}\p{N}_]$/u.test(match) && /^[\p{L}\p{N}_]/u.test(source.slice(offset+match.length))) return match;
      return english[match];
    });
  }
  function translateTree(root) {
    if (language !== 'en') return;
    const skip = 'script,style,code,textarea,[data-language-ui],mjx-container';
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.parentElement?.closest(skip)) { const next=t(node.data); if(next!==node.data)node.data=next; }
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.closest(skip)) {
        if(node.matches('meta[name="description"]'))node.content=t(node.content);
        for(const name of ['title','aria-label','aria-valuetext','alt','placeholder','data-tex','label']) {
          if(node.hasAttribute(name)){const before=node.getAttribute(name),after=t(before);if(after!==before)node.setAttribute(name,after);}
        }
        for(const child of node.childNodes)visit(child);
      }
    };
    visit(root);
  }
  let select,status;
  async function changeLanguage(next) {
    if(!valid(next)||next===language)return;
    select.disabled=true;
    try {
      // A configuration link preserves controls, camera, time and histories.
      const url=new URL(window.PhysShare?.ready ? await PhysShare.makeLink() : location.href);
      url.searchParams.delete('local');url.searchParams.set('lang',next);
      try{localStorage.setItem(storageKey,next);}catch(_){}
      location.assign(url.href);
    }catch(error){
      status.textContent=t('Impossible de changer de langue : ')+t(error.message);status.hidden=false;select.value=language;select.disabled=false;
    }
  }
  function mount() {
    const host=document.querySelector('.app-header')||document.querySelector('header');if(!host)return;
    const wrap=document.createElement('div');wrap.className='phys-language';wrap.dataset.languageUi='';
    const label=document.createElement('label');label.htmlFor='phys-language';label.textContent=language==='en'?'Language':'Langue';
    select=document.createElement('select');select.id=label.htmlFor;select.name='language';
    for(const [value,text] of [['fr','Français'],['en','English']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    select.value=language;select.title=language==='en'?'Keep the current configuration and reopen paused':'Conserver la configuration et rouvrir en pause';
    select.disabled=!!document.body.dataset.app&&!window.PhysShare?.ready;
    window.addEventListener('phys-share-ready',()=>{select.disabled=false;});
    select.addEventListener('change',()=>void changeLanguage(select.value));
    wrap.addEventListener('keydown',event=>event.stopPropagation());
    status=document.createElement('p');status.className='phys-language-status';status.setAttribute('role','status');status.hidden=true;
    wrap.append(label,select,status);host.insertBefore(wrap,host.querySelector('[data-share-ui]'));
  }
  window.PhysLang=Object.freeze({language,t,translateTree,changeLanguage});
  function initialize() {
    translateTree(document.documentElement);mount();
    if(language==='en'){
      // Fallback for plain-text messages restored from older French links.
      const observer=new MutationObserver(records=>{
        for(const record of records){
          if(record.type==='childList')for(const node of record.addedNodes)translateTree(node);
          else translateTree(record.target);
        }
      });
      observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','aria-valuetext','alt','placeholder','label']});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
