import { Elysia, t } from 'elysia';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createPluginContext, verifyInvocation } from '@webdock/plugin-sdk/server';
import { ControlInterfaceError, getOperation, validateInput } from './catalog';
import type { ControlInterface } from './client';
import { version } from '../package.json';
export type RuntimeConfig={credential:string;hostOrigin:string;publicKey:string;generation:number;projectID:string};
const bodySchema=z.strictObject({input:z.record(z.string(),z.unknown()),configuration:z.strictObject({}),hostOrigin:z.string().max(200)});
export function canonicalOrigin(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw Error('A canonical HTTPS origin is required');return value;}

export function createRuntime(config:RuntimeConfig, dependencies:{provider:ControlInterface;authority?:(token:string)=>Promise<void>}){
 if(config.credential.length<32||!config.publicKey||!Number.isSafeInteger(config.generation)||config.generation<1||!/^\d{1,20}$/.test(config.projectID))throw Error('Plugin runtime configuration required');
 canonicalOrigin(config.hostOrigin);
 const authority=dependencies.authority??(async(token:string)=>{
  // A host service call rechecks current installation, generation, project and action authority.
  // The document need not exist; its value is never used as credentials or configuration.
  const ctx=createPluginContext({hostURL:config.hostOrigin,token:()=>token,runtimeCredential:config.credential});
  await ctx.data.read('connection');
 });
 const used=new Map<string,number>();
 return new Elysia({aot:true})
 .onAfterHandle(({set})=>{set.headers['cache-control']='no-store';set.headers['referrer-policy']='no-referrer';})
 .get('/healthz',()=>({ok:true,pluginID:'lumaserv',version,generation:config.generation,protocolVersion:1}))
 .post('/actions/:action',async({request,params,body,status})=>{
  const supplied=Buffer.from(request.headers.get('authorization')??'');const expected=Buffer.from('Bearer '+config.credential);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return status(401,{error:'Unauthorized runtime'});
  const token=request.headers.get('x-plugin-invocation')??'';
  let claims;
  try{
   claims=verifyInvocation(token,{publicKey:config.publicKey,pluginID:'lumaserv',generation:config.generation});
   if(claims.projectID!==config.projectID||claims.action!==params.action)throw Error();
  }catch{return status(403,{error:'Invalid or expired project invocation'});}
  let input:Record<string,unknown>,operation;
  try{
   const payload=bodySchema.parse(body);
   if(payload.hostOrigin!==config.hostOrigin)throw Error();
   operation=getOperation(params.action);
   const {confirmation,...parameters}=payload.input;
   if(operation.write&&confirmation!==operation.id)throw new ControlInterfaceError('Review and confirm this action before continuing.');
   input=validateInput(operation.id,parameters);
  }catch(error){return status(400,{error:error instanceof ControlInterfaceError?error.message:'Invalid action input or configuration'});}
  try{await authority(token);}catch{return status(403,{error:'Project access could not be verified. Reopen the plugin from Webdock.'});}
  if(operation.write){
   const now=Math.floor(Date.now()/1000);
   for(const [id,exp] of used)if(exp<=now)used.delete(id);
   if(used.has(claims.id))return status(409,{error:'This invocation was already attempted. Check provider state before retrying.'});
   if(used.size>=2000)return status(429,{error:'Too many pending actions. Check provider state before retrying.'});
   used.set(claims.id,claims.exp);
  }
  try{return {data:await dependencies.provider.execute(operation.id,input)};}
  catch(error){return status(502,{error:error instanceof ControlInterfaceError?error.message:'Provider request failed. Check provider state before retrying.'});}
 },{body:t.Unknown()});
}
