import {writeFile,unlink,access} from 'node:fs/promises';

export class ReadyReceipt {
  constructor(path,io={writeFile,unlink}){this.path=path;this.io=io;this.owned=false;this.closing=false;this.promise=null;}
  async create(value){
    if(this.promise||this.closing)throw new Error('RECEIPT_ALREADY_USED');
    this.promise=this.io.writeFile(this.path,JSON.stringify(value),{flag:'wx'}).then(()=>{this.owned=true;});
    await this.promise;
    if(this.closing){await this.close();throw new Error('RECEIPT_STOPPED');}
  }
  async close(){
    this.closing=true;
    if(this.promise){try{await this.promise;}catch{}}
    if(this.owned){this.owned=false;await this.io.unlink(this.path);}
  }
}

export async function stopOnSummary(path,stop,io={access}){
  try{await io.access(path);}catch(error){if(error.code==='ENOENT')return false;throw error;}
  await stop();return true;
}
