import { afterEach,test,expect } from 'bun:test';
import {createProxyServer} from '../proxy/proxy';
const servers:any[]=[];afterEach(()=>servers.splice(0).forEach(s=>s.stop(true)));
async function api(){try{return await import('../scripts/start')}catch{return {} as any}}
test('startup refuses existing proxy with another upstream or unknown configuration',async()=>{
 const {assertProxyConfiguration}=await api();expect(typeof assertProxyConfiguration).toBe('function');
 const server=createProxyServer({port:0,upstream:'http://127.0.0.1:15721',bigCtxConcurrency:3,queueTimeoutMs:60000,compactAtTokens:0,omitBridgeReasoning:true},()=>{});servers.push(server);
 await expect(assertProxyConfiguration(server.port,15721)).resolves.toBeUndefined();
 await expect(assertProxyConfiguration(server.port,15722)).rejects.toThrow('configuration');
 const unknown=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>Response.json({service:'AR-Proxy',pid:1})});servers.push(unknown);
 await expect(assertProxyConfiguration(unknown.port,15721)).rejects.toThrow('configuration');
});
