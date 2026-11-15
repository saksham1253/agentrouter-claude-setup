import { test, expect } from "bun:test";
async function api(){try{return await import('../scripts/scan-public')}catch{return {} as any}}
test('public scan rejects secrets, private transcripts and database blobs',async()=>{
 const {inspectPublicFile}=await api();expect(typeof inspectPublicFile).toBe('function');
 expect(inspectPublicFile('README.md','Bearer '+ 'a'.repeat(80))).not.toEqual([]);
 expect(inspectPublicFile('provider.db','binary')).not.toEqual([]);
 expect(inspectPublicFile('chat.jsonl','{}')).not.toEqual([]);
 expect(inspectPublicFile('key.env','AGENTROUTER_API_KEY='+ 'a'.repeat(70))).not.toEqual([]);
 expect(inspectPublicFile('README.md','Use your own API key locally.')).toEqual([]);
 expect(inspectPublicFile('proxy/test.ts','authorization: "Bearer fixture"')).toEqual([]);
});
