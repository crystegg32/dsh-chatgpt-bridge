import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {startHttpServer} from '../../lib/http.js';
import {createRestrictedTransportScope} from '../../lib/http-context.js';
import {createReadonlyMcpServer} from '../../lib/readonly/mcp.js';
const dsh=process.env.BRI94_DSH_CHECKOUT;
assert.ok(dsh,'Actual DSH admission checkout required; no wrapper substitute or skip');
const {createHostControlAdmission}=await import(pathToFileURL(join(dsh,'tools/dsh-delegate/dsh-plugin/control-host-admission.js')).href);
const log={info(){},warn(){},error(){},debug(){}};

test('opaque contexts reject forgery, cross-request use, stale use and unauthenticated scope',async()=>{
 const scope=createRestrictedTransportScope('restricted-transport');let first;
 await scope.run(true,async()=>{
  first=scope.access.current();assert.ok(first);assert.equal(JSON.stringify(first),'{}');
  assert.equal(scope.access.authenticate(first),'restricted-transport');assert.equal(scope.access.authenticate({}),null);
  await scope.run(true,async()=>{assert.notEqual(scope.access.current(),first);assert.equal(scope.access.authenticate(first),null);});
 });
 assert.equal(scope.access.authenticate(first),null);assert.equal(scope.access.current(),undefined);
 let release;const gate=new Promise(r=>{release=r;});let detached;
 await scope.run(true,async()=>{const context=scope.access.current();detached=(async()=>{await gate;return scope.access.authenticate(context);})();});
 release();assert.equal(await detached,null,'Detached callback cannot retain trust after request completion');
 await scope.run(false,async()=>{assert.equal(scope.access.current(),undefined);assert.equal(scope.access.authenticate({}),null);});
});

test('actual HTTP + MCP per-request context reaches original admission, but no approval can be forged',async t=>{
 const captured=[],accessors=[];let invoked=0;
 const token='synthetic-test-only-not-a-runtime-key';
 const listener=await startHttpServer(access=>{
  accessors.push(access);
  const server=createReadonlyMcpServer({}, {getPreview:async()=>({ok:true}),getRunStatus:async()=>({ok:true})});
  const admission=createHostControlAdmission({enabled:true,home:'unused-no-writes',
   authority:{controllerSha:'a'.repeat(40),authenticate:async context=>access.authenticate(context),resolveDelegation:async()=>undefined},
   getAgent(){assert.fail('No delegation must prevent Agent lookup');},invokeTask(){invoked++;assert.fail('No mutation');}});
  // Metadata-only test probe; NOT a registered control tool or operation issuer.
  server.registerTool('context_probe',{inputSchema:z.object({marker:z.string()}).strict(),annotations:{readOnlyHint:true}},async args=>{
   const context=access.current();captured.push({context,access,marker:args.marker});
   await new Promise(r=>setTimeout(r,15));
   const denied=await admission.execute('prepare',{target_id:'selected',request_id:'one'},context);
   return {content:[{type:'text',text:JSON.stringify({authenticated:access.authenticate(context)==='restricted-transport',denied:denied.error?.code})}]};
  });
  return server;
 },{host:'127.0.0.1',port:0,authMode:'token',authToken:token},log);
 const clients=[];t.after(async()=>{for(const {client}of clients)await client.close();await listener.close();});
 async function connect(){const client=new Client({name:'offline-probe',version:'1'}),transport=new StreamableHTTPClientTransport(new URL(listener.url),{requestInit:{headers:{Authorization:`Bearer ${token}`}}});await client.connect(transport);const entry={client,transport};clients.push(entry);return entry;}
 const a=await connect(),b=await connect();
 assert.equal((await a.client.listTools()).tools.filter(x=>x.name!=='context_probe').length,6);
 const decode=result=>JSON.parse(result.content[0].text);
 for(const result of await Promise.all([a.client.callTool({name:'context_probe',arguments:{marker:'a'}}),b.client.callTool({name:'context_probe',arguments:{marker:'b'}})])){
  assert.deepEqual(decode(result),{authenticated:true,denied:'FORBIDDEN'});
 }
 assert.notEqual(captured[0].context,captured[1].context);
 assert.equal((await a.client.callTool({name:'context_probe',arguments:{marker:'resumed'}})).isError,undefined);
 assert.notEqual(captured[0].context,captured[2].context);assert.equal(invoked,0);
 await Promise.all(['same-session-1','same-session-2'].map(marker=>a.client.callTool({name:'context_probe',arguments:{marker}})));
 assert.notEqual(captured[3].context,captured[4].context);
 for(const {context,access}of captured)assert.equal(access.authenticate(context),null);
 assert.equal((await a.client.callTool({name:'context_probe',arguments:{marker:'forged',principal:'user',grant:'fake'}})).isError,true);
 assert.equal(captured.length,5);
 for(const method of ['POST','GET','DELETE']){
  const response=await fetch(listener.url,{method,headers:{'mcp-session-id':a.transport.sessionId,Authorization:'Bearer invalid','content-type':'application/json',Accept:'application/json, text/event-stream'},...(method==='POST'?{body:'{}'}:{})});
  assert.equal(response.status,401);await response.text();
 }
 assert.equal(captured.length,5);
 for(const access of accessors)assert.equal(access.authenticate({principal:'restricted-transport'}),null);
});

test('loopback authMode none never creates authenticated transport authority',async t=>{
 let access;
 const listener=await startHttpServer(a=>{access=a;return createReadonlyMcpServer({},undefined);},
  {host:'127.0.0.1',port:0,authMode:'none',authToken:''},log);
 const client=new Client({name:'no-auth-test',version:'1'});
 t.after(async()=>{await client.close();await listener.close();});
 await client.connect(new StreamableHTTPClientTransport(new URL(listener.url)));
 assert.equal((await client.listTools()).tools.length,4);
 assert.equal(access.current(),undefined);assert.equal(access.authenticate({}),null);
});
