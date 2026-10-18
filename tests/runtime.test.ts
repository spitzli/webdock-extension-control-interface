import { test, expect } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRuntime } from '../src/runtime';
const keys=generateKeyPairSync('ed25519');
const config={credential:'x'.repeat(40),hostOrigin:'https://api.webdock.test',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString(),generation:2,projectID:'123'};
function signed(action='domains.list', patch:Record<string,unknown>={}){
 const body=Buffer.from(JSON.stringify({v:1,id:crypto.randomUUID(),pluginID:'control-interface',generation:2,projectID:'123',action,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60,...patch})).toString('base64url');
 return body+'.'+sign(null,Buffer.from(body),keys.privateKey).toString('base64url');
}
function request(action='domains.list',input:unknown={},token=signed(action),extras:Record<string,unknown>={},credential=config.credential){return new Request('https://runtime.test/actions/'+action,{method:'POST',headers:{authorization:'Bearer '+credential,'x-plugin-invocation':token,'content-type':'application/json'},body:JSON.stringify({input,configuration:{},hostOrigin:config.hostOrigin,...extras})});}
function harness(){const calls:string[]=[];const app=createRuntime(config,{provider:{execute:async(action,input)=>{calls.push('provider:'+action);return {domains:[],password:'provider-secret'};}},authority:async()=>{calls.push('authority');}});return{calls,app};}

test('signed requests are scoped to plugin, generation, project and action before any provider calls',async()=>{
 const{calls,app}=harness();
 for(const req of [request('domains.list',{},signed('servers.list')),request('domains.list',{},signed('domains.list',{pluginID:'other'})),request('domains.list',{},signed('domains.list',{generation:1})),request('domains.list',{},signed('domains.list',{projectID:'456'})),request('domains.list',{},signed('domains.list',{exp:1})),request('domains.list',{},'bad'),request('domains.list',{},signed(),{},'wrong'),request('domains.list',{},signed(),{hostOrigin:'https://evil.test'}),request('domains.list',{},signed(),{configuration:{api_token:'injected'}})]){
  expect((await app.handle(req)).status).toBeGreaterThanOrEqual(400);
 }
 expect(calls).toEqual([]);
});
test('host authority is refreshed before provider calls and unauthorized installation stays closed',async()=>{
 let providerCalls=0;
 const app=createRuntime(config,{provider:{execute:async()=>{providerCalls++;return null;}},authority:async()=>{throw Error('private host detail');}});
 const result=await app.handle(request());
 expect(result.status).toBe(403);expect(await result.text()).not.toContain('private');expect(providerCalls).toBe(0);
 const h=harness();const ok=await h.app.handle(request());expect(ok.status).toBe(200);expect(h.calls).toEqual(['authority','provider:domains.list']);expect((await ok.json()).data.domains).toEqual([]);
});
test('writes require exact confirmation and reject replayed invocation IDs',async()=>{
 const {calls,app}=harness();
 expect((await app.handle(request('servers.delete',{server_id:1}))).status).toBe(400);
 const token=signed('servers.delete');
 expect((await app.handle(request('servers.delete',{server_id:1,confirmation:'servers.delete'},token))).status).toBe(200);
 expect((await app.handle(request('servers.delete',{server_id:1,confirmation:'servers.delete'},token))).status).toBe(409);
 expect(calls.filter(c=>c.startsWith('provider'))).toEqual(['provider:servers.delete']);
});
test('unknown and invalid actions never reach provider and read results are non-cacheable',async()=>{
 const {calls,app}=harness();
 expect((await app.handle(request('servers.get',{server_id:'../../'}))).status).toBe(400);
 expect((await app.handle(request('unknown',{}))).status).toBe(400);
 expect(calls).toEqual([]);
 const r=await app.handle(request());expect(r.headers.get('cache-control')).toBe('no-store');
});
test('provider failures do not reflect upstream secrets and are not retried',async()=>{
 let calls=0;const app=createRuntime(config,{provider:{execute:async()=>{calls++;throw Error('api-token-private');}},authority:async()=>{}});
 const r=await app.handle(request());expect(r.status).toBe(502);expect(await r.text()).not.toContain('api-token-private');expect(calls).toBe(1);
});
