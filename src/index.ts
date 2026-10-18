import { readFileSync } from 'node:fs';
import { createRuntime } from './runtime';
import { createControlInterface } from './client';
import { createUI } from './ui';
function required(name:string){const value=process.env[name];if(!value)throw Error(`Missing runtime configuration: ${name}`);return value;}
const config={credential:required('WEBDOCK_PLUGIN_RUNTIME_TOKEN'),hostOrigin:required('WEBDOCK_PLUGIN_HOST_URL'),publicKey:process.env.WEBDOCK_PLUGIN_HOST_PUBLIC_KEY_FILE?readFileSync(process.env.WEBDOCK_PLUGIN_HOST_PUBLIC_KEY_FILE,'utf8'):required('WEBDOCK_PLUGIN_HOST_PUBLIC_KEY'),generation:Number(required('WEBDOCK_PLUGIN_GENERATION')),projectID:required('WEBDOCK_PLUGIN_PROJECT_ID')};
const apiToken=readFileSync(required('LUMASERV_API_TOKEN_FILE'),'utf8').trim();
createRuntime(config,{provider:createControlInterface(apiToken)}).listen({hostname:'0.0.0.0',port:3443,tls:{cert:readFileSync(required('WEBDOCK_PLUGIN_TLS_CERT')),key:readFileSync(required('WEBDOCK_PLUGIN_TLS_KEY'))},maxRequestBodySize:65536});
createUI(required('WEBDOCK_PLUGIN_CONSOLE_ORIGIN')).listen({hostname:'0.0.0.0',port:3444});
