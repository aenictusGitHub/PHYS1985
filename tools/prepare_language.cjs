/* Add translation boundaries to source JS, preserving all maths and identifiers.
 * Usage: node tools/prepare_language.cjs path/to/app.js [path/to/physics.js ...]
 * Safe to repeat. This is only a development step; apps have no dependency.
 */
const fs=require('node:fs'),path=require('node:path');
const acorn=require('./vendor/acorn.cjs');
const catalogue=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/phys1985-en.json'),'utf8'));
const keys=Object.keys(catalogue);
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pattern=new RegExp(keys.sort((a,b)=>b.length-a.length).map(escape).join('|'),'gu');
function containsText(value){
  if(typeof value!=='string')return false;
  const normalized=value.trim().replace(/\s+/g,' ');
  if(Object.hasOwn(catalogue,normalized)&&catalogue[normalized]!==normalized)return true;
  return value.replace(pattern,(match,offset,source)=>{
    if(/^[\p{L}\p{N}_]/u.test(match)&&/[\p{L}\p{N}_\\]$/u.test(source.slice(0,offset)))return match;
    if(/[\p{L}\p{N}_]$/u.test(match)&&/^[\p{L}\p{N}_]/u.test(source.slice(offset+match.length)))return match;
    return catalogue[match];
  })!==value;
}
function prepare(source){
  const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'}),edits=[];
  const wrap=node=>edits.push({at:node.start,text:'physTranslate('},{at:node.end,text:')'});
  function visit(node,parent){
    if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression'&&node.callee?.name==='physTranslate'){
      const arg=node.arguments[0];
      const parts=arg.type==='Literal'?[arg.value]:arg.type==='TemplateLiteral'?arg.quasis.map(q=>q.value.cooked||q.value.raw):arg.type==='TaggedTemplateExpression'?arg.quasi.quasis.map(q=>q.value.raw):null;
      if(parts&&!parts.some(containsText)){
        edits.push({at:node.start,end:arg.start,text:''},{at:arg.end,end:node.end,text:''});
      }
      return;
    }
    if(node.type==='Property'&&node.key){visit(node.value,node);return;}
    if(node.type==='TaggedTemplateExpression'&&(node.tag.type==='Identifier'&&node.tag.name==='tex'||node.tag.type==='MemberExpression'&&node.tag.object.name==='String'&&node.tag.property.name==='raw')){
      if(node.quasi.quasis.some(q=>containsText(q.value.raw))){wrap(node);return;}
    }
    if(node.type==='TemplateLiteral'&&parent?.type!=='TaggedTemplateExpression'&&node.quasis.some(q=>containsText(q.value.cooked||q.value.raw))){wrap(node);return;}
    if(node.type==='Literal'&&typeof node.value==='string'&&containsText(node.value)){
      if(parent?.type==='ExpressionStatement'&&parent.directive)return;
      // A computed property name is an identifier, not displayed text.
      if(parent?.type==='MemberExpression'&&parent.property===node)return;
      wrap(node);return;
    }
    for(const [key,value] of Object.entries(node)){
      if(key==='start'||key==='end')continue;
      if(Array.isArray(value))value.forEach(child=>visit(child,node));
      else if(value&&typeof value==='object')visit(value,node);
    }
  }
  visit(ast,null);
  edits.sort((a,b)=>b.at-a.at);
  for(const edit of edits)source=source.slice(0,edit.at)+edit.text+source.slice(edit.end??edit.at);
  if(edits.length&&!source.includes('var physTranslate ='))source='var physTranslate = globalThis.PhysLang?.t || (value => value);\n'+source;
  acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'});
  return {source,count:edits.length/2};
}
module.exports={prepare};
if(require.main===module)for(const file of process.argv.slice(2)){
  const result=prepare(fs.readFileSync(file,'utf8'));
  fs.writeFileSync(file,result.source);console.log(file+': '+result.count+' translation boundaries');
}
