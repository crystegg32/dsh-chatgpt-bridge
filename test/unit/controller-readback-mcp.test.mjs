import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createReadonlyMcpServer} from '../../lib/readonly/mcp.js';
async function session(reads,body) {
  const server=createReadonlyMcpServer({},reads),client=new Client({name:'bounded-fixture',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  try {await Promise.all([client.connect(a),server.connect(b)]);await body(client);}
  finally {await client.close();await server.close();}
}
test('absent optional capability retains exact original catalog',()=>session(undefined,async c=>{
  assert.equal((await c.listTools()).tools.length,4);
  assert.equal((await c.callTool({name:'dsh_get_preview',arguments:{target_id:'selected'}})).isError,true);
}));
test('optional capability mounts only two strict readonly methods on same server',()=>session({getPreview:async()=>({ok:true}),getRunStatus:async()=>({ok:true})},async c=>{
  const tools=(await c.listTools()).tools;assert.equal(tools.length,6);
  for(const t of tools){assert.equal(t.annotations.readOnlyHint,true);assert.equal(t.inputSchema.additionalProperties,false);}
}));
test('strict schema rejects authority and path before private capability',()=>session({getPreview:()=>assert.fail(),getRunStatus:()=>assert.fail()},async c=>{
  assert.equal((await c.callTool({name:'dsh_get_preview',arguments:{target_id:'selected',path:'secret'}})).isError,true);
}));
for(const value of [{ok:false,error:{code:'FORBIDDEN'}},null,{}])test('non-success private result is MCP error '+JSON.stringify(value),()=>session({getPreview:async()=>value,getRunStatus:async()=>value},async c=>{
  assert.equal((await c.callTool({name:'dsh_get_preview',arguments:{target_id:'selected'}})).isError,true);
}));
test('private exceptions never leak stack or credential text',()=>session({getPreview:async()=>{throw new Error('PRIVATE_SECRET');},getRunStatus:async()=>({ok:true})},async c=>{
  const r=await c.callTool({name:'dsh_get_preview',arguments:{target_id:'selected'}});assert.equal(r.isError,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_SECRET'));
}));
