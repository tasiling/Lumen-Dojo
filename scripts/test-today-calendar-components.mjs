// Controller/element checks in Node; intentionally not a browser layout test.
import assert from 'node:assert/strict';
import {createRequire, Module} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
const require=createRequire(import.meta.url),React=require('react');

function harness(){
  const slots=[],cache=new Map();let index=0,pathname='/',quick=[];
  const slot=init=>{const i=index++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]};
  const hooks={...React,useState:slot,useRef:init=>slot(()=>({current:init}))[0],useMemo:f=>f(),useCallback:f=>f,useEffect:()=>{},useId:()=>':test:'};
  function load(file){file=resolve(file);if(cache.has(file))return cache.get(file).exports;
    const m=new Module(file);m.filename=file;cache.set(file,m);
    m.require=s=>{
      if(s==='react')return hooks;
      if(s==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
      if(s==='next/navigation')return {usePathname:()=>pathname,useRouter:()=>({push(){},back(){}})};
      if(s==='@/lib/dojo/store')return {useDojo:()=>({entries:[],entriesLoading:false,modalOpen:false,modalOptions:{},openQuickAdd:args=>quick.push(args),closeQuickAdd(){}})};
      if(s==='@/lib/dojo/backstack')return {useBackStack:()=>({depth:()=>0}),useBackableState(){}};
      const p=s.startsWith('@/')?resolve(s.slice(2)):s.startsWith('.')?resolve(dirname(file),s):null;
      return p?load(['.ts','.tsx',''].map(ext=>p+ext).find(existsSync)):require(s);
    };
    m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports;
  }
  return {slots,load,render(Component,props={}){index=0;return Component(props)},setPath(value){pathname=value},quick};
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)]}
function text(tree){if(tree==null||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);if(Array.isArray(tree))return tree.map(text).join('');return text(tree.props?.children)}
const find=(tree,predicate)=>{const found=nodes(tree).find(predicate);assert(found,'Expected UI control exists');return found};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// The shell scopes styling by pathname and preserves five existing routes.
const shell=harness(),Shell=shell.load('app/components/DojoShell.tsx').default;
for(const path of ['/','/calendar','/forage','/practice','/bingo']){
  shell.setPath(path);const tree=shell.render(Shell,{children:'content'});
  assert.equal(tree.props.className.includes('tc-shell'),path==='/'||path==='/calendar');
  assert.equal(tree.props.className.includes('tc-today-theme'),path==='/');
  assert.equal(nodes(tree).filter(n=>n.props?.['data-nav']).length,5);
}

// Render all approved daily depth modes against the existing real record shape.
const today=harness(),Today=today.load('app/page.tsx').default;today.render(Today);today.slots[5]=false;
for(const depth of ['light','medium','deep']){
  today.slots[0].morning.depth=depth;
  const tree=today.render(Today);
  for(const anchor of ['today-morning','today-tasks','today-daytime','today-closing'])find(tree,n=>n.props?.id===anchor);
  assert.equal(nodes(tree).filter(n=>n.props?.className?.startsWith('space-link ')).length,6);
  assert.equal(nodes(tree).some(n=>n.props?.id==='morning-future-journal'),depth==='deep');
  assert.equal(nodes(tree).some(n=>n.props?.id==='morning-gratitude'),depth!=='light');
}

// Calendar still offers 42 cells and all modes, while period arrows honor the view.
const cal=harness(),Calendar=cal.load('app/calendar/page.tsx').default;cal.render(Calendar);
cal.slots[0]='2026-12';cal.slots[1]='2026-12-31';cal.slots[8]=false;
let tree=cal.render(Calendar);
assert.equal(nodes(tree).filter(n=>n.type==='button'&&/^2026-|^2027-/.test(n.props?.['aria-label']??'')).length,42);
find(tree,n=>n.type==='button'&&text(n)==='週').props.onClick();tree=cal.render(Calendar);
find(tree,n=>n.props?.['aria-label']==='下一週').props.onClick();assert.equal(cal.slots[1],'2027-01-07');
tree=cal.render(Calendar);find(tree,n=>n.type==='button'&&text(n)==='日').props.onClick();tree=cal.render(Calendar);
find(tree,n=>n.props?.['aria-label']==='前一天').props.onClick();assert.equal(cal.slots[1],'2027-01-06');
tree=cal.render(Calendar);find(tree,n=>n.type==='button'&&text(n)==='私人行程').props.onClick();assert.equal(cal.slots[3],'personal');
tree=cal.render(Calendar);find(tree,n=>n.type==='button'&&n.props.className==='primary compact-button').props.onClick();assert.equal(cal.quick.at(-1).presetDate,'2027-01-06');

// Real edit component: failures keep the draft; a retry patches the same ID.
const editor=harness(),Editor=editor.load('app/components/CalendarEventEditor.tsx').default;
const original={id:'personal-1',version:1,title:'舊標題',date:'2026-10-19',startTime:'13:00',endTime:'14:00',space:'practice',kind:'修習',note:'保留說明',createdAt:'2026-01-01',updatedAt:'2026-01-01'};
let saved=null,calls=[],release;
const props={item:original,onClose(){},onSaved:value=>saved=value};tree=editor.render(Editor,props);
find(tree,n=>n.props?.id==='tc-event-title').props.onChange({target:{value:'修改後'}});
const previousFetch=globalThis.fetch;
try{
  globalThis.fetch=async(url,options)=>{calls.push({url,...options});return new Promise(resolve=>release=()=>resolve({ok:false,status:503,json:async()=>({error:'暫時無法儲存'})}))};
  tree=editor.render(Editor,props);const submit=find(tree,n=>n.type==='form').props.onSubmit;
  submit({preventDefault(){}});submit({preventDefault(){}});assert.equal(calls.length,1,'Pending duplicate submit is ignored');
  tree=editor.render(Editor,props);assert.equal(find(tree,n=>n.type==='fieldset').props.disabled,true);
  release();await tick();tree=editor.render(Editor,props);
  assert.equal(saved,null);assert.equal(find(tree,n=>n.props?.id==='tc-event-title').props.value,'修改後');assert(text(tree).includes('暫時無法儲存'));
  globalThis.fetch=async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({item:{...original,title:'修改後'}})}};
  find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();
  assert.equal(saved.id,original.id);assert.equal(calls.at(-1).method,'PATCH');
  const payload=JSON.parse(calls.at(-1).body);assert.equal(payload.id,original.id);assert.equal(payload.item.createdAt,original.createdAt);assert.equal(payload.item.note,original.note);
}finally{globalThis.fetch=previousFetch}
const css=postcss.parse(readFileSync('app/today-calendar.css','utf8'));
const rules=new Map();css.walkRules(rule=>{assert(rule.selector.startsWith('.dojo.tc-'),'Presentation selectors remain route scoped');rules.set(rule.selector,rule)});
const declaration=(selector,key)=>rules.get(selector)?.nodes.find(n=>n.prop===key)?.value;
assert(+declaration('.dojo.tc-shell .modal','z-index')>+declaration('.dojo.tc-shell .nav','z-index'),'Quick-add stays above bottom navigation');
assert.equal(declaration('.dojo.tc-shell .nav','grid-template-columns'),'repeat(5,minmax(0,1fr))','Bottom navigation shrinks on narrow phones');
assert.equal(declaration('.dojo.tc-shell .calendar-grid button.selected','border-color'),'#E4D9C0','Selected compact cells preserve warm separators');
console.log('today-calendar-components: scoped shell, daily depths, 42 cells, period controls and failed/successful edits passed (Node only)');
