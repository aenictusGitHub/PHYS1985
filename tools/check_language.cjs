const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const catalogue=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/phys1985-en.json'),'utf8'));
const code=fs.readFileSync(path.join(__dirname,'../assets/phys1985-language.js'),'utf8').replace('/* PHYS1985_ENGLISH */ {}',JSON.stringify(catalogue));
function runtime(query='',saved=null,blocked=false){
 const document={documentElement:{lang:'fr'},readyState:'loading',addEventListener(){}};
 const context={URL,location:{href:'https://example.test/app.html'+query},document,localStorage:{getItem(){if(blocked)throw Error('Private mode');return saved;}},window:{}};
 vm.runInNewContext(code,context);return context.window.PhysLang;
}
const en=runtime('?lang=en'),fr=runtime('?lang=fr','en');
assert.equal(en.language,'en');assert.equal(fr.language,'fr');assert.equal(runtime('','en').language,'en');assert.equal(runtime('?lang=xx').language,'fr');assert.equal(runtime('?lang=en',null,true).language,'en');assert.equal(runtime('',null,true).language,'fr');
for(const [key,value] of Object.entries(catalogue)){assert.equal(en.t(key),value,'catalogue '+key);assert.equal(fr.t(key),key,'unchanged French');}
assert.equal(en.t('  Lire  '),'  Play  ');
for(const s of ['typeset','pointerdown','details:not([data-share-ui])','source','\u005c\u005cvec v=\u005c\u005cfrac{d\u005c\u005cvec r}{dt}','\u005c\u005cmathrm m','Force'])assert.equal(en.t(s),s,'unchanged notation/identifier');
assert.equal(en.t('À 2.00 secondes, la puissance vaut 3.0 watt, le travail cumulé 6.0 joule et l’énergie cinétique 7.0 joule.'),'At 2.00 seconds, power is 3.0 watts, accumulated work 6.0 joules and kinetic energy 7.0 joules.');
const {prepare}=require('./prepare_language.cjs');
const source='"use strict"; const label="Lire"; const formula=String.raw`\\text{Équilibre}`; const id="details:not([data-share-ui])"; const x={"Lire": "Recommencer"};';
const prepared=prepare(source).source;assert.equal(prepare(prepared).source,prepared,'idempotent transformation');assert.match(prepared,/physTranslate\(String\.raw/);assert.match(prepared,/"Lire": physTranslate/);assert.ok(!prepared.includes('physTranslate("details'));
console.log(Object.keys(catalogue).length+' translations, preference precedence, private mode, notation and preparation checks passed.');
