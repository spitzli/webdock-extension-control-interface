import { Elysia } from 'elysia';
import { readFileSync } from 'node:fs';
import { canonicalOrigin } from './runtime';
export function createUI(consoleOrigin:string){
 canonicalOrigin(consoleOrigin);
 // CodeMirror injects theme styles. Scripts stay self-only; all communication uses MessagePort.
 const csp=`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors ${consoleOrigin}; base-uri 'none'; form-action 'none'; connect-src 'none'; font-src 'self'`;
 const app=new Elysia();
 for(const[path,file,type]of [['/ui/control-interface','../ui/index.html','text/html'],['/ui/app.js','../dist/app.js','application/javascript'],['/ui/styles.css','../ui/styles.css','text/css']]){
  app.get(path,()=>new Response(readFileSync(new URL(file,import.meta.url)),{headers:{'content-type':type+'; charset=utf-8','content-security-policy':csp,'x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':'no-store'}}));
 }
 return app;
}
