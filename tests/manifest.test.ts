import {test,expect} from 'bun:test';
import {manifestFor} from '../scripts/manifest';
import {operations} from '../src/catalog';
test('all 55 actions expose strict API and MCP contracts with per-operation authority',()=>{
 const m=manifestFor('ghcr.io/spitzli/webdock-extension-lumaserv@sha256:'+'a'.repeat(64));
 expect(m.actions.length).toBe(55);expect(m.api?.length).toBe(55);expect(m.mcp?.length).toBe(55);
 for(const op of operations){const action=m.actions.find(a=>a.name===op.id)!;expect(action.intent).toBe(op.write?'write':'read');expect(action.input?.additionalProperties).toBe(false);if(op.write)expect(action.input?.required).toContain('confirmation');}
 expect(m.secrets).toEqual(['lumaserv-api-token']);expect(m.configuration.properties).not.toHaveProperty('api_token');expect(m.services.required).toEqual([{name:'data',version:1}]);
});
