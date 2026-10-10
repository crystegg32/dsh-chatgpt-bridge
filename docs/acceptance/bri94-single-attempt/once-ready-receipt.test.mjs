import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadyReceipt,stopOnSummary} from './once-ready-receipt.mjs';

test('stop during pending write removes only own receipt and cannot publish ready',async()=>{
  let complete,unlinks=0,published=false;
  const receipt=new ReadyReceipt('synthetic',{writeFile:()=>new Promise(resolve=>{complete=resolve;}),unlink:async()=>{unlinks++;}});
  const creation=receipt.create({ready:true}).then(()=>{published=true;});
  const rejected=assert.rejects(creation,/RECEIPT_STOPPED/);
  const stopping=receipt.close();complete();await stopping;await rejected;
  assert.equal(unlinks,1);assert.equal(published,false);
});
test('existing foreign receipt or write failure never deletes foreign data',async()=>{
  for(const code of ['EEXIST','EACCES']){
    let unlinks=0,childrenStopped=false;
    const receipt=new ReadyReceipt('synthetic',{writeFile:async()=>{throw Object.assign(new Error(),{code});},unlink:async()=>{unlinks++;}});
    await assert.rejects(receipt.create({ready:true}));
    await receipt.close();childrenStopped=true;
    assert.equal(unlinks,0);assert.equal(childrenStopped,true);
  }
});
test('summary triggers receipt and both owned children cleanup exactly once',async()=>{
  let unlinks=0,serverStopped=false,clientStopped=false,stops=0;
  const receipt=new ReadyReceipt('synthetic',{writeFile:async()=>{},unlink:async()=>{unlinks++;}});
  await receipt.create({ready:true});
  const stopped=await stopOnSummary('summary',async()=>{stops++;await receipt.close();serverStopped=true;clientStopped=true;},{access:async()=>{}});
  assert.equal(stopped,true);assert.equal(stops,1);assert.equal(unlinks,1);
  assert.ok(serverStopped&&clientStopped);
  await receipt.close();assert.equal(unlinks,1);
});
test('missing summary does not stop; access errors are not disguised as missing',async()=>{
  let stops=0;
  const stop=async()=>{stops++;};
  assert.equal(await stopOnSummary('summary',stop,{access:async()=>{throw Object.assign(new Error(),{code:'ENOENT'});}}),false);
  await assert.rejects(stopOnSummary('summary',stop,{access:async()=>{throw Object.assign(new Error(),{code:'EACCES'});}}));
  assert.equal(stops,0);
});
