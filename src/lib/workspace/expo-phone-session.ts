import QRCode from "qrcode";
import type { Sandbox } from "./sandbox";
import type { ExpoPreview } from "./expo-preview";
type Config={sessionId:string;producerUrl:string;publicOrigin:string;deviceUrl:string;expiresAt:number};
export type PhoneSnapshot={phase:"idle"|"connecting"|"ready"|"error";message:string;error:string;data:ExpoPreview|null};
const empty:PhoneSnapshot={phase:"idle",message:"Preparing phone preview…",error:"",data:null};
const snapshots=new Map<string,PhoneSnapshot>(),listeners=new Map<string,Set<()=>void>>();
const controllers=new Map<string,{runtime:Sandbox;token:string;config:Config;renew:ReturnType<typeof setInterval>;poll:ReturnType<typeof setInterval>;stop:()=>void}>();
const pending=new Map<string,Promise<string|null>>();
export function phoneSnapshot(id:string){return snapshots.get(id)||empty;}
export function subscribePhoneSession(id:string,listener:()=>void){let values=listeners.get(id);if(!values){values=new Set();listeners.set(id,values);}values.add(listener);return()=>{values.delete(listener);};}
function update(id:string,value:Partial<PhoneSnapshot>){snapshots.set(id,{...phoneSnapshot(id),...value});listeners.get(id)?.forEach(listener=>listener());}
async function api(token:string,body:Record<string,unknown>){const response=await fetch("/api/preview/expo/session",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(body),signal:AbortSignal.timeout(25_000)});const data=await response.json();if(!response.ok)throw new Error(data.error || "Expo phone forwarding could not connect");return data;}
export function terminalQr(url:string){
 const matrix=QRCode.create(url,{errorCorrectionLevel:"L"}).modules,quiet=4,side=matrix.size+quiet*2;
 const bit=(x:number,y:number)=>x>=quiet&&y>=quiet&&x<side-quiet&&y<side-quiet?matrix.get(y-quiet,x-quiet):0;
 const lines=[];for(let y=0;y<side;y+=2){let line="";for(let x=0;x<side;x++){const top=bit(x,y),bottom=bit(x,y+1);line+=top?(bottom?"█":"▀"):(bottom?"▄":" ");}lines.push("\x1b[30;47m"+line+"\x1b[0m");}return lines.join("\n");
}
export async function releasePhoneSession(id:string){const old=controllers.get(id);if(!old)return;controllers.delete(id);old.stop();clearInterval(old.renew);clearInterval(old.poll);await old.runtime.setPhoneRelay(null).catch(()=>{});void api(old.token,{operation:"close",sessionId:old.config.sessionId}).catch(()=>{});update(id,{phase:"idle",data:null,error:""});}
export function preparePhoneSession(id:string,runtime:Sandbox,token:string,output:(chunk:string)=>void,force=false):Promise<string|null>{
 const current=pending.get(id);if(current)return current;
 const task=(async()=>{
  const old=controllers.get(id);
  if(old && old.config.expiresAt>Date.now()+60_000){
   old.token=token;
   if(force){const renewed=await api(token,{operation:"renew",sessionId:old.config.sessionId}) as Config;old.config=renewed;update(id,{phase:"connecting",error:"",message:"Reconnecting phone preview…"});await runtime.setPhoneRelay(renewed.producerUrl);}
   return old.config.publicOrigin;
  }
  if(old)await releasePhoneSession(id);
  update(id,{phase:"connecting",message:"Connecting phone preview…",error:"",data:null});
  try{
   const config=await api(token,{operation:"start",conversationId:id}) as Config;
   await runtime.setPhoneRelay(config.producerUrl);
   let stopped=false,polling=false,printed=false,renewing=false;
   const controller={runtime,token,config,renew:0 as unknown as ReturnType<typeof setInterval>,poll:0 as unknown as ReturnType<typeof setInterval>,stop:()=>{stopped=true;}};
   const check=async()=>{
    if(stopped || polling)return;polling=true;
    try{
     const status=await api(controller.token,{operation:"status",sessionId:config.sessionId});if(stopped)return;
     if(status.phase==="ready"){
      update(id,{phase:"ready",error:"",message:"Ready to scan",data:{deviceUrl:status.deviceUrl,webPreviewUrl:null,launchTarget:"expo-go",sourceRevision:config.sessionId,status:"ready"}});
      if(!printed){printed=true;output("\n"+terminalQr(status.deviceUrl)+"\nMetro waiting on "+status.deviceUrl+"\nScan with Expo Go or your iPhone camera. Keep Cryzo open.\n");}
     }else update(id,{phase:status.phase==="error"?"error":"connecting",message:status.message||"Connecting phone preview…",error:status.phase==="error"?status.message:""});
    }catch(error){if(!stopped)update(id,{phase:"error",error:error instanceof Error?error.message:"Phone preview disconnected"});}
    finally{polling=false;}
   };
   const renew=async()=>{if(stopped||renewing)return;renewing=true;try{controller.config=await api(controller.token,{operation:"renew",sessionId:config.sessionId});if(!stopped)await runtime.setPhoneRelay(controller.config.producerUrl);}catch(error){if(!stopped)update(id,{phase:"error",error:error instanceof Error?error.message:"Reconnect phone preview"});}finally{renewing=false;}};
   controller.poll=setInterval(()=>void check(),4_000);controller.renew=setInterval(()=>void renew(),210_000);controllers.set(id,controller);void check();
   return config.publicOrigin;
  }catch(error){const message=error instanceof Error?error.message:"Phone preview could not connect";update(id,{phase:"error",error:message,message});output("\n[Phone preview] "+message+"\n");return null;}
 })().catch(error=>{const message=error instanceof Error?error.message:"Phone preview disconnected";update(id,{phase:"error",error:message,message});output("\n[Phone preview] "+message+"\n");return null;});pending.set(id,task);const done=()=>{if(pending.get(id)===task)pending.delete(id);};void task.then(done,done);return task;
}
