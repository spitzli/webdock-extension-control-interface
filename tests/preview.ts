/** Isolated authoring harness. No external account, real credentials or provider network. */
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { createRuntime } from '../src/runtime';
import { readFile } from 'node:fs/promises';
const pair=generateKeyPairSync('ed25519'),credential=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex');
const config={credential,hostOrigin:'https://callback.fixture.test',publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),generation:1,projectID:'123'};
const zones=[{id:20333,title:'northstar.example',ttl:3600,ns_1:'ns1.control-interface.com',ns_2:'ns2.control-interface.com'},{id:20334,title:'studio.example',ttl:3600,ns_1:'ns1.control-interface.com',ns_2:'ns2.control-interface.com'}];
let records=[{id:1,sld:'@',type:'A',data:'192.0.2.24',ttl:3600},{id:2,sld:'www',type:'CNAME',data:'northstar.example.',ttl:3600},{id:3,sld:'@',type:'MX',data:'10 mail.northstar.example.',ttl:3600},{id:4,sld:'@',type:'TXT',data:'v=spf1 include:mail.example ~all',ttl:3600},{id:5,sld:'_dmarc',type:'TXT',data:'v=DMARC1; p=quarantine;',ttl:3600}];
const runtime=createRuntime(config,{authority:async()=>{},provider:{async execute(action,input){
 const p=input as Record<string,unknown>;
 await Bun.sleep(200);
 switch(action){
  case 'accounting.balance':return{balance:128.75,currency:'EUR',customer:'Northstar · preview fixture'};
  case 'domains.list':return{domains:[{domain:'northstar.example',domain_id:209,zone_id:20333,expire:'2027-10-18',user:'northstar'},{domain:'studio.example',domain_id:210,zone_id:20334,expire:'2027-12-01',user:'northstar'}]};
  case 'domains.check':return{available:true};
  case 'zones.list':return{zones};
  case 'zones.get':return{...zones.find(z=>z.id===Number(p.zone_id)),records:structuredClone(records),domains:[{id:209,sld:'northstar',tld:'example'}]};
  case 'dns.add':{const additions=(p.records as typeof records).map((r,i)=>({...r,id:100+records.length+i}));records.push(...additions);return{zone_id:p.zone_id,records:structuredClone(records)};}
  case 'dns.delete':{const idx=records.findIndex(r=>r.sld===p.sld&&r.type===p.type&&r.data===p.data&&(p.ttl===undefined||r.ttl===p.ttl));if(idx>=0)records.splice(idx,1);return{zone_id:p.zone_id,deleted_entries:idx<0?0:1,records:structuredClone(records)};}
  case 'servers.list':return[{id:1846,hostname:'edge-01.northstar.example',status:'running',cores:4,memory:8192,disk:80},{id:1847,hostname:'worker-02.northstar.example',status:'stopped',cores:2,memory:4096,disk:40}];
  case 'servers.get':return{id:p.server_id,hostname:'edge-01.northstar.example',status:'running',cores:4,memory:8192,disk:80,addresses:['192.0.2.24']};
  case 'contacts.list':return{domain_handles:[{handle:'PERS-10041-114248',firstname:'Alex',lastname:'Example',organisation:'Northstar preview',email:'alex@example.test',country:'DE'}]};
  case 'certificates.list':return[{id:19582,name:'*.northstar.example',status:'ACTIVE',valid_to:'2027-10-18',key:'PRIVATE PREVIEW FIXTURE'}];
  default:return{accepted:true,action,fixture:true};
 }
}}});
function token(action:string){const p=Buffer.from(JSON.stringify({v:1,id:crypto.randomUUID(),pluginID:'control-interface',generation:1,projectID:'123',action,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60})).toString('base64url');return p+'.'+sign(null,Buffer.from(p),pair.privateKey).toString('base64url');}
const ui=Bun.serve({hostname:'127.0.0.1',port:3495,async fetch(req){
 const files:Record<string,[string,string]>={'/ui/control-interface':['ui/index.html','text/html'],'/ui/app.js':['dist/app.js','application/javascript'],'/ui/styles.css':['ui/styles.css','text/css']};const file=files[new URL(req.url).pathname];if(!file)return new Response('Not found',{status:404});return new Response(await readFile(file[0]),{headers:{'content-type':file[1]+'; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; frame-ancestors http://127.0.0.1:3494; base-uri 'none'; form-action 'none'"}});
}});
const parentHTML=`<!DOCTYPE html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Control Interface · authoring preview</title><style>body{margin:0;font:13px system-ui;background:#f3f6fa}aside{height:30px;box-sizing:border-box;padding:6px 18px;background:#e5edf9;color:#304260}iframe{border:0;width:100%;height:calc(100dvh - 30px);display:block}</style><aside>Local authoring preview · synthetic provider data</aside><iframe title="Control Interface" sandbox="allow-scripts" src="http://127.0.0.1:3495/ui/control-interface#${nonce}"></iframe><script>const frame=document.querySelector('iframe');frame.onload=()=>{const c=new MessageChannel();c.port1.onmessage=async e=>{const m=e.data;try{const r=await fetch('/invoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m)});const v=await r.json();c.port1.postMessage({id:m.id,...(r.ok?{result:v}:{error:v.error})});}catch{c.port1.postMessage({id:m.id,error:'Preview action failed'});}};frame.contentWindow.postMessage({type:'webdock:init',nonce:'${nonce}'},'*',[c.port2]);};</script></html>`;
const parent=Bun.serve({hostname:'127.0.0.1',port:3494,async fetch(req){if(req.method==='GET'&&new URL(req.url).pathname==='/')return new Response(parentHTML,{headers:{'content-type':'text/html'}});if(req.method==='POST'&&new URL(req.url).pathname==='/invoke'&&req.headers.get('origin')==='http://127.0.0.1:3494'){const m=await req.json();return runtime.handle(new Request('https://runtime.fixture/actions/'+m.name,{method:'POST',headers:{authorization:'Bearer '+credential,'x-plugin-invocation':token(m.name),'content-type':'application/json'},body:JSON.stringify({input:m.input,configuration:{},hostOrigin:config.hostOrigin})}));}return new Response('Not found',{status:404});}});
console.log('Preview: http://127.0.0.1:3494');
const stop=()=>{ui.stop();parent.stop();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
