import { operations, dnsTypes, type Field } from '../src/catalog';
import { parsePluginManifest } from '@webdock/plugin-sdk/contracts';
import { version } from '../package.json';
function schema(field:Field):Record<string,unknown>{
 if(field.type==='records')return{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:false,required:['sld','type','data'],properties:{sld:{type:'string',minLength:1,maxLength:253},type:{type:'string',enum:[...dnsTypes]},data:{type:'string',minLength:1,maxLength:4096},ttl:{type:'integer',minimum:0,maximum:2147483647}}}};
 if(field.type==='strings')return{type:'array',maxItems:100,items:{type:'string',minLength:1,maxLength:4096}};
 if(field.type==='boolean')return{type:'boolean'};
 if(field.type==='integer')return{type:'integer',minimum:field.min??1,maximum:field.max??Number.MAX_SAFE_INTEGER};
 if(field.type==='amount')return{type:'number',minimum:0.01,maximum:1_000_000};
 return{type:'string',minLength:field.required?1:0,maxLength:16384,...(field.choices?{enum:field.choices}:{})};
}
export function manifestFor(image:string){
 const manifest={name:'lumaserv',version,kind:'extension',description:'LUMASERV domains, DNS, servers and billing in Webdock. A guided infrastructure console with an optional JSON workbench.',category:'infrastructure',tags:['lumaserv','dns','domains','servers','hosting','alpha'],license:'MIT',icon:'assets/icon.svg',readme:'README.md',screenshots:[{url:'screenshots/dns-console.png',caption:'DNS console in the local authoring preview with synthetic records',alt:'DNS records, zone navigation and record editor'},{url:'screenshots/json-workbench.png',caption:'Optional JSON workbench with syntax highlighting',alt:'Syntax-highlighted JSON response and editor controls'}],homepage:'https://github.com/spitzli/webdock-extension-lumaserv',documentation_url:'https://github.com/spitzli/webdock-extension-lumaserv#readme',support:{issues_url:'https://github.com/spitzli/webdock-extension-lumaserv/issues'},protocolVersion:1,sdkVersion:1,dataProtocolVersion:1,coreVersion:'>=0.1.0 <1.0.0',image,dependencies:[],capabilities:['plugin.data.read','plugin.secrets.read','plugin.http.read','plugin.http.request'],schemaVersion:1,readableSchema:{min:1,max:1},migrations:[],tables:[],services:{required:[{name:'data',version:1}],optional:[]},configuration:{type:'object',properties:{},required:[],additionalProperties:false},actions:operations.map(operation=>({name:operation.id,intent:operation.write?'write':'read',destructive:/delete|reinstall|restore|stop|shutdown|reconfigure/.test(operation.id),capabilities:['plugin.data.read','plugin.secrets.read',operation.write?'plugin.http.request':'plugin.http.read'],input:{type:'object',properties:Object.fromEntries([...operation.fields.map(field=>[field.name,schema(field)]),...(operation.write?[['confirmation',{type:'string',enum:[operation.id]}]]:[])]),required:[...operation.fields.filter(field=>field.required).map(field=>field.name),...(operation.write?['confirmation']:[])],additionalProperties:false}})),jobs:[],navigation:[{id:'lumaserv',label:'LUMASERV',path:'/ui/lumaserv'}],slots:[],events:[],secrets:['lumaserv-api-token'],httpBindings:[],api:operations.map(operation=>({method:operation.write?'POST':'GET',path:'/'+operation.id.replaceAll('.','/').replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),action:operation.id})),mcp:operations.map(operation=>({name:operation.id.replaceAll('.','_').replaceAll('-','_').replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),description:operation.title,action:operation.id}))};
 return parsePluginManifest(manifest);
}
if(import.meta.main){
 const image=process.env.PLUGIN_IMAGE;
 if(!image)throw Error('Set PLUGIN_IMAGE to the published immutable image digest');
 await Bun.write('tabularium.json',JSON.stringify(manifestFor(image))+'\n');
}
