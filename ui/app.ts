import { operations, dnsTypes, validateInput, type Operation, type Field } from '../src/catalog';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter } from '@codemirror/lint';
import { openSearchPanel, searchKeymap } from '@codemirror/search';
import { foldAll, unfoldAll, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { t, language, setLanguage, englishTitles, fieldNames } from './i18n';
import { rowsFrom, recordsFrom, redact, isObject, display, type Row, type DnsRecord, type ZoneSnapshot, loadedZoneData, isCurrentZoneResult } from './data';

type Category = { name:string; group:string; icon:string; description:string; initial?:string };
const categories: Category[] = [
  {name:'Domains',group:'Domains',icon:'globe',description:'Domains, registrations and transfers.',initial:'domains.list'},
  {name:'DNS',group:'Nameserver & DNS',icon:'dns',description:'Manage DNS records, zones and nameservers.',initial:'zones.list'},
  {name:'Servers',group:'KVM-Server',icon:'server',description:'Virtual machines, backups and scheduled tasks.',initial:'servers.list'},
  {name:'Customers',group:'Kunden & Domainkontakte',icon:'users',description:'Customer details and domain contacts.',initial:'contacts.list'},
  {name:'Certificates',group:'SSL-Zertifikate',icon:'shield',description:'Certificates, orders and approval emails.',initial:'certificates.list'},
  {name:'Network',group:'IP-Adressen & Traffic',icon:'network',description:'IP addresses, reverse DNS and traffic.',initial:'traffic.list'},
  {name:'Billing',group:'Buchhaltung & Zahlungen',icon:'wallet',description:'Account balance and payment links.',initial:'accounting.balance'},
  {name:'PXE',group:'PXE-Installationen',icon:'terminal',description:'Manage network-based installations.'}
];
const paths: Record<string,string> = {globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',dns:'M4 4h16v5H4zM4 15h16v5H4zM8 9v6m8-6v6M7 6.5h.01M7 17.5h.01',server:'M4 3h16v7H4zM4 14h16v7H4zM7 6.5h.01M7 17.5h.01M11 7h6m-6 11h6',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',network:'M9 3h6v6H9zM2 16h6v6H2zM16 16h6v6h-6zM12 9v4M5 16v-3h14v3',wallet:'M3 5h17v16H3zM3 5V3h14v2m-1 7h5v5h-5z',terminal:'M3 4h18v16H3zM7 8l4 4-4 4m7 0h3',plus:'M12 5v14M5 12h14',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',refresh:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3',chevron:'m9 5 7 7-7 7',close:'M6 6l12 12M6 18 18 6',check:'m4 12 5 5L20 6',dots:'M5 12h.01M12 12h.01M19 12h.01',code:'m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',copy:'M8 8h13v13H8zM16 8V3H3v13h5',edit:'m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',warning:'M12 3 2 21h20L12 3Zm0 6v5m0 3h.01'};
function icon(name:string) { const el=document.createElementNS('http://www.w3.org/2000/svg','svg'); el.setAttribute('viewBox','0 0 24 24'); el.setAttribute('fill','none'); el.setAttribute('stroke','currentColor'); el.setAttribute('stroke-width','1.6'); el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round'); el.setAttribute('aria-hidden','true'); const p=document.createElementNS(el.namespaceURI,'path');p.setAttribute('d',paths[name]??paths.dots!);el.append(p);return el; }
function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text?:string):HTMLElementTagNameMap[K] { const n=document.createElement(tag);n.className=className;if(text!==undefined)n.textContent=text;return n; }
function button(text:string,handler:()=>void,className='button',glyph?:string) { const b=el('button',className);b.type='button';if(glyph)b.append(icon(glyph));b.append(document.createTextNode(text));b.addEventListener('click',handler);return b; }
function title(op:Operation) { return language==='de'?op.title:englishTitles[op.id]??op.id; }
function fieldLabel(name:string) { return t(fieldNames[name]??name.replaceAll('_',' ')); }
function status(message:string,kind='info') { const toast=el('div',`toast ${kind}`,message);document.querySelector('.toast')?.remove();document.body.append(toast);document.querySelector('#announcer')!.textContent=message;setTimeout(()=>toast.remove(),8000); }
function errorText(error:unknown) { return error instanceof Error?error.message:String(error); }
let port:MessagePort|undefined; let connection:'waiting'|'connected'|'disconnected'='waiting';
const pending=new Map<string,{resolve:(data:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
const nonce=location.hash.slice(1);
window.addEventListener('message',event=>{
  if(port||!nonce||parent===window||event.source!==parent||event.data?.type!=='webdock:init'||event.data.nonce!==nonce||event.ports.length!==1)return;
  port=event.ports[0];connection='connected';
  port!.onmessage=({data})=>{if(!data||typeof data.id!=='string')return;const request=pending.get(data.id);if(!request)return;clearTimeout(request.timer);pending.delete(data.id);if(data.error)request.reject(new Error(typeof data.error==='string'?data.error:'Request failed'));else request.resolve(isObject(data.result)&&'data' in data.result?data.result.data:data.result);};
  port!.start();renderShell();void loadCategory();
});
setTimeout(()=>{if(!port){connection='disconnected';renderShell();}},10000);
function request(name:string,input:Row={}):Promise<unknown> {
  if(!port)return Promise.reject(new Error(t('The host connection is not available. Close and reopen this extension in Webdock.')));
  const id=crypto.randomUUID();const frame={type:'action',id,name,input};if(new TextEncoder().encode(JSON.stringify(frame)).byteLength>32768)return Promise.reject(new Error(t('This request is too large. Send fewer records or reduce the input to 32 KiB.')));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(t('This request timed out. Its outcome is unknown. Refresh the resource before trying again.')));},45000);pending.set(id,{resolve,reject,timer});try{port!.postMessage(frame);}catch(error){clearTimeout(timer);pending.delete(id);reject(error instanceof Error?error:new Error(String(error)));}});
}
let category=categories[1]!; let pageData:unknown;let zones:Row[]=[];let selectedZone:Row|undefined;let zoneSnapshot:ZoneSnapshot|undefined;let busy=false;let pageError='';let generation=0;let search='';let typeFilter='';let selectedServer:Row|undefined;
let content:HTMLElement;let pageBody:HTMLElement;
function selectedZoneId() { return Number(selectedZone?.id??selectedZone?.zone_id); }
function currentZoneData() { return loadedZoneData(zoneSnapshot,selectedZoneId()); }
function zoneReady() { return category.name==='DNS'&&!busy&&currentZoneData()!==undefined; }
function renderShell() {
  const root=document.querySelector('#app')!;root.replaceChildren();
  const shell=el('div','shell');const rail=el('aside','rail');
  const brand=el('div','brand');const mark=el('div','brand-mark');mark.append(icon('dns'));const word=el('div');word.append(el('strong','','Webdock'),el('span','','LUMASERV'));brand.append(mark,word);rail.append(brand);
  rail.append(el('div','rail-label',t('Infrastructure')));const nav=el('nav','nav');nav.setAttribute('aria-label',t('Navigation'));
  for(const item of categories){const b=button(t(item.name),()=>{category=item;search='';typeFilter='';selectedServer=undefined;pageData=undefined;pageError='';renderShell();if(port)void loadCategory();},`nav-item ${item===category?'active':''}`,item.icon);if(item===category)b.setAttribute('aria-current','page');nav.append(b);}rail.append(nav);
  const foot=el('div','rail-foot');foot.append(el('span','connection-dot '+connection),el('span','',t(connection==='connected'?'Connected':connection==='waiting'?'Connecting':'Disconnected')));rail.append(foot);
  content=el('main','main');const top=el('header','topbar');const crumbs=el('div','breadcrumbs');crumbs.append(el('span','','LUMASERV'),icon('chevron'),el('strong','',t(category.name)));const lang=el('select','language');lang.setAttribute('aria-label',t('Language'));for(const [value,label]of [['de','DE'],['en','EN']]){const o=el('option','',label);o.value=value!;o.selected=language===value;lang.append(o);}lang.onchange=()=>{setLanguage(lang.value as 'en'|'de');renderShell();};top.append(crumbs,lang);content.append(top);
  const page=el('div','page');const heading=el('div','page-heading');const text=el('div');text.append(el('h1','',t(category.name)),el('p','subheading',t(category.description)));const controls=el('div','heading-actions');const refresh=button(t('Refresh'),()=>void loadCategory(),'button ghost','refresh');refresh.disabled=!port||busy;controls.append(refresh,button(t('Actions'),()=>openActionChooser(),'button','plus'));heading.append(text,controls);page.append(heading);
  pageBody=el('div','page-body');page.append(pageBody);content.append(page);shell.append(rail,content);root.append(shell);renderBody();
}
async function loadCategory() {
  if(!port)return;
  const current=++generation;
  busy=true;pageError='';zoneSnapshot=undefined;renderBody();
  try {
    if(category.initial){
      const data=await request(category.initial);
      if(current!==generation)return;
      pageData=data;
      if(category.name==='DNS'){
        zones=rowsFrom(data);
        selectedZone=zones.find(z=>Number(z.id??z.zone_id)===selectedZoneId())??zones[0];
        if(selectedZone){
          const zoneId=selectedZoneId();
          const result=await request('zones.get',{zone_id:zoneId});
          if(!isCurrentZoneResult(zoneId,selectedZoneId(),current,generation))return;
          zoneSnapshot={zoneId,data:result};
        }
      }
    }
  } catch(error){if(current===generation)pageError=errorText(error);}
  finally{if(current===generation){busy=false;renderShell();}}
}
function emptyState(heading:string,description:string,glyph='dns') {const box=el('div','empty');box.append(icon(glyph),el('h3','',t(heading)),el('p','',t(description)));return box;}
function renderBody() {
  pageBody.replaceChildren();
  if(connection!=='connected'){const state=emptyState(connection==='waiting'?'Connecting':'Disconnected',connection==='waiting'?'Waiting for Webdock to connect this extension.':'The host connection is not available. Close and reopen this extension in Webdock.','network');state.classList.add('connection-state');pageBody.append(state);return;}
  if(pageError){const error=el('div','notice error');error.setAttribute('role','alert');error.append(icon('warning'),el('div','',pageError),button(t('Try again'),()=>void loadCategory(),'button small'));pageBody.append(error);}
  if(busy){const loading=el('div','loading');loading.setAttribute('role','status');loading.append(el('span','spinner'),document.createTextNode(t('Loading…')));pageBody.append(loading);return;}
  if(category.name==='DNS'){renderDns();return;}
  if(!category.initial){pageBody.append(emptyState('PXE','Choose an action to get started.','terminal'));return;}
  const panel=el('section','panel');const bar=el('div','panel-header');bar.append(el('h2','',selectedServer?display(selectedServer.hostname??selectedServer.name??selectedServer.id):t(category.name)));const list=rowsFrom(pageData);if(list.length)bar.append(el('span','count',String(list.length)));panel.append(bar);
  if(list.length){const searchbar=searchInput('Search resources…',search,value=>{search=value;renderResourceRows(table,list);});panel.append(searchbar);const table=el('div','resource-table');renderResourceRows(table,list);panel.append(table);}else if(pageData!==undefined)panel.append(resultView(pageData));else if(!pageError)panel.append(emptyState('No resources yet','Use Actions to create a resource or adjust your query.',category.icon));pageBody.append(panel);
}
function searchInput(placeholder:string,value:string,onChange:(value:string)=>void){const wrap=el('div','search-box');wrap.append(icon('search'));const input=el('input');input.type='search';input.placeholder=t(placeholder);input.setAttribute('aria-label',t(placeholder));input.value=value;input.oninput=()=>onChange(input.value);wrap.append(input);return wrap;}
function renderResourceRows(container:HTMLElement,rows:Row[]) {
  container.replaceChildren();const filtered=rows.filter(row=>JSON.stringify(redact(row)).toLowerCase().includes(search.toLowerCase()));if(!filtered.length){container.append(emptyState('No matches','Try another search or type.'));return;}
  const keys=Array.from(new Set(rows.flatMap(row=>Object.keys(row)))).filter(key=>!['records','entries','domains'].includes(key)&&rows.some(row=>row[key]!==undefined&&typeof row[key]!=='object')).slice(0,5);
  const table=el('table');const head=el('thead');const hr=el('tr');for(const key of keys)hr.append(el('th','',fieldLabel(key)));hr.append(el('th','sr-only',t('Actions')));head.append(hr);table.append(head);const body=el('tbody');
  for(const row of filtered){const tr=el('tr');const safe=redact(row) as Row;for(const key of keys){const td=el('td',key===keys[0]?'primary-cell':'',display(safe[key]));td.dataset.label=fieldLabel(key);tr.append(td);}const actions=el('td','row-actions');actions.append(button(t('View'),()=>openResource(row),'button small ghost','chevron'));tr.append(actions);body.append(tr);}table.append(body);container.append(table);
}
function openResource(row:Row) {
  if(category.name==='Servers'&&(row.id??row.server_id)){selectedServer=row;openOperation(operations.find(op=>op.id==='servers.get')!,{server_id:row.id??row.server_id},true);return;}
  const dialog=makeDialog(t('Details'));dialog.body.append(resultView(row));dialog.show();
}
function renderDns() {
  const zoneData=currentZoneData();
  if(!zones.length){const box=emptyState('No resources yet','Use Actions to create a resource or adjust your query.');box.append(button(t('Create zone'),()=>openOperation(operations.find(op=>op.id==='zones.create')!),'button primary','plus'));pageBody.append(box);return;}
  const zonebar=el('div','zonebar');const zoneLabel=el('label','zone-picker');zoneLabel.append(el('span','field-label',t('DNS zones')));const select=el('select');select.setAttribute('aria-label',t('Select a zone'));for(const zone of zones){const option=el('option','',display(zone.title??zone.name??zone.id));option.value=String(zone.id??zone.zone_id);option.selected=option.value===String(selectedZone?.id??selectedZone?.zone_id);select.append(option);}select.onchange=()=>{selectedZone=zones.find(zone=>String(zone.id??zone.zone_id)===select.value);void loadZone();};zoneLabel.append(select);zonebar.append(zoneLabel);const zoneMeta=el('div','zone-meta');zoneMeta.append(el('span','',`${t('Zone ID')} ${selectedZone?.id??selectedZone?.zone_id}`));const details=isObject(zoneData)?zoneData:{};const ttl=details.ttl??selectedZone?.ttl;if(ttl!=null)zoneMeta.append(el('span','',`${t('Default zone TTL')} ${ttl}s`));zonebar.append(zoneMeta);pageBody.append(zonebar);
  if(!zoneReady()){pageBody.append(emptyState('Zone details unavailable','Load this zone successfully before changing its DNS records.'));return;}
  const panel=el('section','panel');const head=el('div','panel-header');const h=el('div','inline');const records=recordsFrom(zoneData);h.append(el('h2','',t('Records')),el('span','count',String(records.length)));head.append(h,button(t('Add record'),()=>editRecord(),'button primary','plus'));panel.append(head);
  const filters=el('div','filters');const list=el('div','dns-table');const render=()=>renderDnsRows(list,records);filters.append(searchInput('Search records…',search,value=>{search=value;render();}));const type=el('select','type-filter');type.setAttribute('aria-label',t('Type'));for(const value of ['',...dnsTypes]){const option=el('option','',value||t('All types'));option.value=value;option.selected=value===typeFilter;type.append(option);}type.onchange=()=>{typeFilter=type.value;render();};filters.append(type);panel.append(filters,list);render();const footer=el('div','panel-footer');footer.append(el('span','',t('Changes may take time to appear in DNS caches.')),button(t('JSON'),()=>{const d=makeDialog(t('Zone'));d.body.append(resultView(zoneData,true));d.show();},'button small ghost','code'));panel.append(footer);pageBody.append(panel);
}
async function loadZone(){
  const current=++generation;
  const zoneId=selectedZoneId();
  busy=true;pageError='';zoneSnapshot=undefined;renderBody();
  try{
    const data=await request('zones.get',{zone_id:zoneId});
    if(isCurrentZoneResult(zoneId,selectedZoneId(),current,generation))zoneSnapshot={zoneId,data};
  }catch(error){if(current===generation)pageError=errorText(error);}
  finally{if(current===generation){busy=false;renderShell();}}
}
function renderDnsRows(container:HTMLElement,records:DnsRecord[]) {
  container.replaceChildren();const visible=records.filter(r=>(!typeFilter||r.type===typeFilter)&&`${r.sld} ${r.type} ${r.data}`.toLowerCase().includes(search.toLowerCase()));if(!visible.length){container.append(emptyState(records.length?'No matches':'No records',records.length?'Try another search or type.':'Add the first DNS record to this zone.'));return;}
  const table=el('table');const thead=el('thead');const tr=el('tr');for(const label of ['Name','Type','Value','TTL','Actions'])tr.append(el('th',label==='Actions'?'actions-heading':'',t(label)));thead.append(tr);table.append(thead);const tbody=el('tbody');
  for(const record of visible){const row=el('tr');const name=el('td','record-name',record.sld);name.dataset.label=t('Name');const type=el('td');type.dataset.label=t('Type');type.append(el('span',`record-type type-${record.type.toLowerCase()}`,record.type));const data=el('td','record-value',record.data);data.dataset.label=t('Value');const ttl=el('td','record-ttl',record.ttl===undefined?'—':String(record.ttl));ttl.dataset.label=t('TTL');const actions=el('td','row-actions');const edit=button('',()=>editRecord(record),'icon-button','edit');edit.setAttribute('aria-label',`${t('Edit')} ${record.sld} ${record.type}`);edit.title=t('Edit');const remove=button('',()=>deleteRecord(record),'icon-button danger-icon','trash');remove.setAttribute('aria-label',`${t('Delete')} ${record.sld} ${record.type}`);remove.title=t('Delete');actions.append(edit,remove);row.append(name,type,data,ttl,actions);tbody.append(row);}table.append(tbody);container.append(table);
}
function makeDialog(heading:string,wide=false) {
  const node=el('dialog',wide?'modal wide':'modal');const header=el('div','modal-header');const id=`dialog-${crypto.randomUUID()}`;const h=el('h2','',heading);h.id=id;node.setAttribute('aria-labelledby',id);const close=button('',()=>node.close(),'icon-button','close');close.setAttribute('aria-label',t('Close'));header.append(h,close);const body=el('div','modal-body');const footer=el('div','modal-footer');node.append(header,body,footer);document.body.append(node);const cleanups:(()=>void)[]=[];node.addEventListener('close',()=>{cleanups.forEach(f=>f());node.remove();});return {node,body,footer,cleanups,show:()=>node.showModal(),close:()=>node.close()};
}
const jsonHighlight=HighlightStyle.define([{tag:tags.propertyName,color:'#4554b4'},{tag:tags.string,color:'#167147'},{tag:tags.number,color:'#a75213'},{tag:[tags.bool,tags.null],color:'#8845a9'},{tag:tags.punctuation,color:'#738299'}]);
function jsonEditor(value:unknown,readOnly=false) {
  const wrapper=el('div','json-editor');const toolbar=el('div','editor-toolbar');const host=el('div','editor-host');const caption=el('div','editor-caption');wrapper.append(toolbar,host,caption);
  const view=new EditorView({state:EditorState.create({doc:JSON.stringify(value,null,2)??'null',extensions:[basicSetup,json(),syntaxHighlighting(jsonHighlight),linter(jsonParseLinter()),keymap.of(searchKeymap),EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly),EditorView.lineWrapping,EditorView.contentAttributes.of({'aria-label':readOnly?t('Response'):t('Parameters')}),EditorView.theme({'&':{fontSize:'12px'},'.cm-content':{fontFamily:'ui-monospace, SFMono-Regular, Consolas, monospace'},'.cm-scroller':{overflow:'auto'},'.cm-gutters':{backgroundColor:'#f5f7fb',color:'#8a95a7',border:'none'},'&.cm-focused':{outline:'none'}})]}),parent:host});
  if(!readOnly)toolbar.append(button(t('Format'),()=>{try{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:JSON.stringify(JSON.parse(view.state.doc.toString()),null,2)}});caption.textContent='';}catch(error){caption.textContent=`${t('Invalid JSON')}: ${errorText(error)}`;}},'button small ghost'));
  toolbar.append(button(t('Search'),()=>openSearchPanel(view),'button small ghost','search'),button(t('Fold all'),()=>{foldAll(view);},'button small ghost'),button(t('Unfold all'),()=>{unfoldAll(view);},'button small ghost'));
  if(readOnly)toolbar.append(el('span','readonly',t('Read-only')));
  const observer=new MutationObserver(()=>{if(!wrapper.isConnected){view.destroy();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  return {element:wrapper,get:()=>JSON.parse(view.state.doc.toString()) as unknown,set:(value:unknown)=>view.dispatch({changes:{from:0,to:view.state.doc.length,insert:JSON.stringify(value,null,2)}})};
}
function renderTree(value:unknown):HTMLElement {
  if(Array.isArray(value)){if(!value.length)return emptyState('No resources yet','Use Actions to create a resource or adjust your query.');const wrap=el('div','tree-array');value.forEach((item,index)=>{if(isObject(item)||Array.isArray(item)){const details=el('details','tree-group');details.open=value.length<4;details.append(el('summary','',isObject(item)?display(item.title??item.name??item.hostname??item.id??index+1):String(index+1)),renderTree(item));wrap.append(details);}else wrap.append(el('div','tree-value',display(item)));});return wrap;}
  if(isObject(value)){const list=el('dl','details-grid');for(const [key,item]of Object.entries(value)){const term=el('dt','',fieldLabel(key));const desc=el('dd');if(isObject(item)||Array.isArray(item)){const nested=el('details','tree-group');nested.append(el('summary','',Array.isArray(item)?`${item.length} ${t('Records').toLowerCase()}`:t('Details')),renderTree(item));desc.append(nested);}else desc.textContent=display(item);list.append(term,desc);}return list;}
  return el('div','tree-value',display(value));
}
function resultView(data:unknown,startJson=false) {
  const root=el('div','result');let reveal=false;let mode=startJson?'json':'details';const toolbar=el('div','result-toolbar');const body=el('div','result-body');const note=el('p','result-note',t('Sensitive values are hidden. API tokens remain hidden.'));
  const paint=()=>{toolbar.replaceChildren();body.replaceChildren();const tabs=el('div','segmented');for(const [value,label]of [['details','Details'],['json','JSON']]){const b=button(t(label!),()=>{mode=value!;paint();},mode===value?'selected':'');b.setAttribute('aria-pressed',String(mode===value));tabs.append(b);}toolbar.append(tabs);const actions=el('div','inline');actions.append(button(t(reveal?'Hide secrets':'Reveal secrets'),()=>{reveal=!reveal;paint();},'button small ghost'),button(t('Copy'),()=>void copyText(JSON.stringify(redact(data,reveal),null,2)??'null'),'button small ghost','copy'));toolbar.append(actions);const safe=redact(data,reveal);if(data===undefined||data===null)body.append(emptyState('No response data','The request completed without response data.'));else body.append(mode==='json'?jsonEditor(safe,true).element:renderTree(safe));};root.append(toolbar,note,body);paint();return root;
}
async function copyText(value:string) {try{if(!navigator.clipboard)throw new Error();await navigator.clipboard.writeText(value);status(t('Copied'),'success');}catch{const dialog=makeDialog(t('Select and copy'));const area=el('textarea','copy-fallback');area.value=value;area.readOnly=true;dialog.body.append(area);dialog.show();area.focus();area.select();}}
function openActionChooser() {
  const dialog=makeDialog(t('Actions'));const choices=operations.filter(op=>op.group===category.group);const list=el('div','action-list');const draw=(query='')=>{list.replaceChildren();for(const operation of choices.filter(op=>`${title(op)} ${op.id}`.toLowerCase().includes(query.toLowerCase()))){const action=button('',()=>{dialog.close();if(operation.id==='dns.add'&&selectedZone){editRecord();return;}openOperation(operation,selectedServer?{server_id:selectedServer.id??selectedServer.server_id}:selectedZone&&category.name==='DNS'?{zone_id:selectedZone.id??selectedZone.zone_id}:{});},'action-option');if(operation.id.startsWith('dns.')&&!zoneReady())action.disabled=true;const label=el('span');label.append(el('strong','',title(operation)),el('small','',operation.id));action.append(label,el('span',operation.write?'action-kind write':'action-kind',t(operation.write?'Edit':'View')),icon('chevron'));list.append(action);}if(!list.childElementCount)list.append(el('p','muted',t('No actions found')));};dialog.body.append(searchInput('Search actions…','',draw),list);draw();dialog.show();
}
type Control = {element:HTMLElement; get:()=>unknown};
function control(field:Field,value:unknown):Control {
  if(field.type==='records'){const wrap=el('div','record-controls');const rows:ReturnType<typeof recordControls>[]=[];const list=el('div');const add=(record?:DnsRecord)=>{const r=recordControls(record);rows.push(r);const item=el('div','record-control-item');item.append(r.element,button(t('Remove'),()=>{rows.splice(rows.indexOf(r),1);item.remove();},'button small ghost'));list.append(item);};if(Array.isArray(value)&&value.length)value.forEach(record=>add(record as DnsRecord));else add();wrap.append(list,button(t('Add another record'),()=>add(),'button small','plus'));return {element:wrap,get:()=>rows.map(row=>row.get())};}
  const label=el('label','field');const caption=el('span','field-label',fieldLabel(field.name));if(!field.required)caption.append(el('span','optional',` (${t('Optional')})`));label.append(caption);
  let input:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
  if(field.choices){const select=el('select');if(!field.required){const blank=el('option','','—');blank.value='';select.append(blank);}for(const choice of field.choices){const option=el('option','',choice);option.value=choice;select.append(option);}input=select;}
  else if(field.type==='strings'||field.name==='csr'){const area=el('textarea');area.rows=4;input=area;}
  else {const fieldInput=el('input');fieldInput.type=field.type==='boolean'?'checkbox':field.type==='password'?'password':field.type==='email'?'email':field.type==='url'?'url':['integer','amount'].includes(field.type)?'number':'text';if(field.type==='integer'||field.type==='amount'){fieldInput.min=String(field.min??(field.type==='amount'?0.01:1));if(field.max)fieldInput.max=String(field.max);fieldInput.step=field.type==='amount'?'0.01':'1';}fieldInput.autocomplete='off';if(field.type==='boolean')fieldInput.checked=value===true;input=fieldInput;}
  input.name=field.name;input.required=!!field.required;if(value!==undefined&&field.type!=='boolean')input.value=Array.isArray(value)?value.join('\n'):String(value);label.append(input);if(field.type==='strings')label.append(el('small','field-help',t('Enter one value per line.')));
  return {element:label,get:()=>field.type==='boolean'?(input as HTMLInputElement).checked:input.value===''?undefined:field.type==='integer'||field.type==='amount'?Number(input.value):field.type==='strings'?input.value.split('\n').map(v=>v.trim()).filter(Boolean):input.value};
}
function recordControls(record?:DnsRecord) {
  const wrap=el('div','record-fields');const name=control({name:'sld',type:'text',required:true},record?.sld??'@');name.element.append(el('small','field-help',t('Use @ for the zone root.')));const type=control({name:'type',type:'text',choices:dnsTypes,required:true},record?.type??'A');const value=control({name:'data',type:'text',required:true},record?.data);value.element.classList.add('full-width');const ttl=control({name:'ttl',type:'integer',min:0,max:2147483647},record?.ttl);ttl.element.append(el('small','field-help',t('Leave blank to use the zone default.')));wrap.append(name.element,type.element,value.element,ttl.element);return {element:wrap,get:():DnsRecord=>({sld:String(name.get()??''),type:String(type.get()??''),data:String(value.get()??''),...(ttl.get()===undefined?{}:{ttl:Number(ttl.get())})})};
}
function validForm(container:HTMLElement) {for(const control of container.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea'))if(!control.checkValidity()){control.reportValidity();return false;}return true;}
function review(heading:string,parameters:Row,run:()=>Promise<void>,destructive=false,resource?:string,description?:string) {
  const dialog=makeDialog(heading);dialog.body.append(el('p','review-description',t(description??(destructive?'This action can interrupt service or remove data.':'Review the resource and parameters before continuing.'))));dialog.body.append(renderTree(redact(parameters)));let typed:HTMLInputElement|undefined;
  if(destructive&&resource){const label=el('label','field confirmation-field');label.append(el('span','field-label',t('Type the resource name to confirm:')),el('code','confirm-resource',resource));typed=el('input');typed.autocomplete='off';typed.required=true;label.append(typed);dialog.body.append(label);}
  const error=el('p','inline-error');error.setAttribute('role','alert');dialog.body.append(error);const cancel=button(t('Cancel'),()=>dialog.close(),'button');const confirm=button(t('Confirm change'),async()=>{if(typed&&typed.value!==resource){typed.setCustomValidity(t('Type the resource name to confirm:')+' '+resource);typed.reportValidity();return;}confirm.disabled=true;cancel.disabled=true;dialog.node.querySelector<HTMLButtonElement>('.modal-header button')!.disabled=true;dialog.node.oncancel=e=>e.preventDefault();confirm.textContent=t('Loading…');try{await run();dialog.close();}catch(e){error.textContent=errorText(e);confirm.remove();cancel.disabled=false;cancel.textContent=t('Close');dialog.node.querySelector<HTMLButtonElement>('.modal-header button')!.disabled=false;dialog.node.oncancel=null;}},destructive?'button danger':'button primary');if(typed)typed.oninput=()=>typed!.setCustomValidity('');dialog.footer.append(cancel,confirm);dialog.show();
}
function editRecord(original?:DnsRecord) {
  if(!zoneReady()){status(t('Load this zone successfully before changing its DNS records.'));return;}
  const zoneId=selectedZoneId();
  const zoneName=display(selectedZone?.title??selectedZone?.id);
  const dialog=makeDialog(t(original?'Replace record':'Add record'));
  dialog.body.append(el('p','context-label',`${t('Zone')}: ${zoneName}`));
  if(original)dialog.body.append(el('p','notice',t('This replaces the record in two steps. Both records may briefly exist.')));
  let fields=recordControls(original);
  let expert=false;
  let editor:ReturnType<typeof jsonEditor>|undefined;
  const fieldHost=el('div');fieldHost.append(fields.element);
  const error=el('p','inline-error');error.setAttribute('role','alert');
  const tabs=el('div','form-tabs');
  const normal=button(t('Form'),()=>{
    if(!expert)return;
    try{
      const draft=editor!.get();
      const validated=validateInput('dns.add',{zone_id:zoneId,records:[draft]});
      fields=recordControls((validated.records as DnsRecord[])[0]);
      expert=false;editor=undefined;fieldHost.replaceChildren(fields.element);error.textContent='';
      normal.setAttribute('aria-pressed','true');jsonMode.setAttribute('aria-pressed','false');
    }catch(e){error.textContent=errorText(e);}
  },'button small ghost');
  const jsonMode=button(t('Expert mode'),()=>{
    if(expert)return;
    editor=jsonEditor(fields.get());expert=true;fieldHost.replaceChildren(editor.element);error.textContent='';
    normal.setAttribute('aria-pressed','false');jsonMode.setAttribute('aria-pressed','true');
  },'button small ghost','code');
  normal.setAttribute('aria-pressed','true');jsonMode.setAttribute('aria-pressed','false');
  tabs.append(normal,jsonMode);dialog.body.append(tabs,fieldHost,error);
  dialog.footer.append(button(t('Cancel'),()=>dialog.close()),button(t('Review change'),()=>{try{if(!expert&&!validForm(fields.element))return;const record=(expert?editor!.get():fields.get()) as DnsRecord;validateInput('dns.add',{zone_id:zoneId,records:[record]});if(original&&JSON.stringify(record)===JSON.stringify(original)){error.textContent=t('No change to save.');return;}review(t(original?'Add replacement, then remove original':'Add record'),{[t('Zone')]:zoneName,...(original?{[t('Current value')]:original}:{}),[t('New value')]:record},async()=>{await request('dns.add',{zone_id:zoneId,records:[record],confirmation:'dns.add'});if(original){try{await request('dns.delete',{zone_id:zoneId,...original,confirmation:'dns.delete'});}catch{dialog.close();void loadZone();throw new Error(t('Replacement was added, but the original could not be deleted. Both records may exist. Refresh the zone and remove the original manually.'));}}dialog.close();status(t(original?'Record replaced':'Record added'),'success');void loadZone();},false,undefined,original?'This replaces the record in two steps. Both records may briefly exist.':undefined);}catch(e){error.textContent=errorText(e);}},'button primary'));dialog.show();
}
function deleteRecord(record:DnsRecord) {if(!zoneReady()){status(t('Load this zone successfully before changing its DNS records.'));return;}const zoneId=Number(selectedZone?.id??selectedZone?.zone_id);review(t('Delete')+' '+record.type+' '+record.sld,{[t('Zone')]:display(selectedZone?.title??zoneId),...record},async()=>{await request('dns.delete',{zone_id:zoneId,...record,confirmation:'dns.delete'});status(t('Record deleted'),'success');void loadZone();},true,record.sld);}
function openOperation(operation:Operation,prefill:Row={},runImmediately=false) {
  if(operation.id.startsWith('dns.')&&!zoneReady()){status(t('Load this zone successfully before changing its DNS records.'));return;}
  const dialog=makeDialog(title(operation),operation.fields.length>8);
  const form=el('div','operation-form');
  let controls=operation.fields.map(field=>({field,control:control(field,prefill[field.name])}));
  for(const c of controls)form.append(c.control.element);
  const formWrap=el('div');formWrap.append(form);
  let expert=false;let editor:ReturnType<typeof jsonEditor>|undefined;
  const tabs=el('div','form-tabs');
  const error=el('p','inline-error');error.setAttribute('role','alert');
  const normal=button(t('Form'),()=>{
    if(!expert)return;
    try{
      const edited=validateInput(operation.id,editor!.get());
      controls=operation.fields.map(field=>({field,control:control(field,edited[field.name])}));
      form.replaceChildren(...controls.map(item=>item.control.element));
      expert=false;editor=undefined;formWrap.replaceChildren(form);error.textContent='';
      normal.setAttribute('aria-pressed','true');jsonMode.setAttribute('aria-pressed','false');
    }catch(e){error.textContent=errorText(e);}
  },'button small ghost');
  const jsonMode=button(t('Expert mode'),()=>{
    if(expert)return;
    editor=jsonEditor(readControls());expert=true;formWrap.replaceChildren(editor.element);error.textContent='';
    normal.setAttribute('aria-pressed','false');jsonMode.setAttribute('aria-pressed','true');
  },'button small ghost','code');
  normal.setAttribute('aria-pressed','true');jsonMode.setAttribute('aria-pressed','false');
  tabs.append(normal,jsonMode);dialog.body.append(tabs,formWrap,error);
  const output=el('div','operation-output');dialog.body.append(output);
  function readControls(){return Object.fromEntries(controls.map(c=>[c.field.name,c.control.get()]).filter(([,value])=>value!==undefined));}
  const submit=button(t(operation.write?'Review change':'Run'),async()=>{try{if(!expert&&!validForm(form))return;const raw=expert?editor!.get():readControls();const parameters=validateInput(operation.id,raw);error.textContent='';if(operation.write){const dangerous=/delete|reinstall|restore|stop|shutdown|refund/.test(operation.id)&&!operation.id.includes('undelete');const resource=parameters.hostname??parameters.server_id??parameters.sld??parameters.handle??parameters.order_id;review(title(operation),parameters,async()=>{const result=await request(operation.id,{...parameters,confirmation:operation.id});dialog.close();const done=makeDialog(title(operation));done.body.append(resultView(result));done.show();status(t('Change completed'),'success');void loadCategory();},dangerous,resource===undefined?undefined:String(resource));}else{submit.disabled=true;submit.textContent=t('Loading…');const result=await request(operation.id,parameters);output.replaceChildren(resultView(result));if(operation.id==='servers.get'){const actions=el('div','server-actions');for(const id of ['servers.start','servers.shutdown','servers.restart','servers.backups','servers.tasks']){const op=operations.find(o=>o.id===id)!;actions.append(button(title(op),()=>{dialog.close();openOperation(op,{server_id:parameters.server_id});},'button small'));}output.prepend(actions);}}}catch(e){error.textContent=errorText(e);}finally{submit.disabled=false;submit.textContent=t(operation.write?'Review change':'Run');}},'button primary');submit.disabled=!port;dialog.footer.append(button(t('Close'),()=>dialog.close()),submit);dialog.show();if(runImmediately)submit.click();
}
renderShell();
