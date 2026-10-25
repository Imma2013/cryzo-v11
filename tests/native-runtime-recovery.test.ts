import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ArtifactAction } from "@/lib/workspace/types";
const fake=vi.hoisted(()=>({serverReady:null as null | ((port:number,url:string)=>void),commands:[] as string[],files:{} as Record<string,string>,starts:0}));
vi.mock("@/lib/workspace/sandbox",()=>({
  getSandbox:vi.fn(async()=>({
    fs:{rm:vi.fn(async()=>{fake.files={};}),mkdir:vi.fn(async()=>{}),exists:vi.fn(async(path:string)=>path in fake.files),readTextFile:vi.fn(async(path:string)=>fake.files[path]),writeFile:vi.fn(async(path:string,value:string)=>{fake.files[path]=value;}),readdir:vi.fn(async()=>[])},
    watchSource:()=>()=>{},
    on:(event:string,listener:any)=>{if(event==="server-ready")fake.serverReady=listener;return()=>{};},
    spawn:vi.fn(async()=>({output:new ReadableStream({start(c){c.close();}}),exit:Promise.resolve(0),kill:vi.fn()})),
    spawnShell:vi.fn(async(command:string)=>{fake.commands.push(command);fake.starts++;queueMicrotask(()=>fake.serverReady?.(8081,"https://cryzo.test/__vv/8081/"));return{output:new ReadableStream(),exit:new Promise<number>(()=>{}),kill:vi.fn()};}),
  })),
  resetSandboxProject:vi.fn(async()=>{fake.files={};}),writeFiles:vi.fn(async(_runtime:any,actions:ArtifactAction[])=>{for(const action of actions)if(action.filePath)fake.files[action.filePath]=action.content;}),
  rebootSandboxRuntime:vi.fn(),collectDirectoryFiles:vi.fn(),directoryExists:vi.fn(async()=>true),runCommand:vi.fn(async()=>0),isSandboxInfrastructureError:()=>false,
}));
let runtime:typeof import("@/lib/workspace/streaming-runtime");
beforeAll(async()=>{
 vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>{const input=JSON.parse(String(init.body||"{}"));return{ok:true,json:async()=>({actions:input.actions || [],action:input.action,output:""})};}));
 runtime=await import("@/lib/workspace/streaming-runtime");runtime.setStreamingRuntimeAuthToken("test");
});
describe("native Vivari restoration",()=>{
 it("mounts saved native source before starting one Metro process",async()=>{
  const actions:ArtifactAction[]=[{type:"file",filePath:"App.tsx",content:'import { View } from "react-native"; export default function App(){ return <View/> }'},{type:"file",filePath:"vite.config.ts",content:"export default {}"}];
  await runtime.restoreStreamingRuntime("native-shared",actions,true);
  expect(fake.files["App.tsx"]).toContain("react-native");expect(fake.files["package.json"]).toContain("expo");expect(fake.files["vite.config.ts"]).toBeUndefined();
  expect(fake.commands).toHaveLength(1);expect(fake.commands[0]).toContain("node_modules/expo/bin/cli start");expect(fake.commands[0]).not.toMatch(/vite|ngrok|--tunnel|CI=1/);
  const count=fake.starts;await runtime.ensureNativePreview("native-shared");expect(fake.starts).toBe(count);
  await runtime.recoverStreamingRuntime("native-shared",actions,false,true);expect(fake.starts).toBe(count);
  await runtime.restartStreamingRuntime("native-shared");expect(fake.starts).toBe(count+1);
 });
 it("upgrades a saved SDK 57 app without replacing its config, entry or source", async () => {
  const app = 'import { View } from "react-native"; export default function App(){return <View/>}';
  const actions:ArtifactAction[]=[
   {type:"file",filePath:"App.tsx",content:app},
   {type:"file",filePath:"package.json",content:JSON.stringify({name:"saved-app",dependencies:{expo:"~57.0.17","react-native":"0.86.3","expo-font":"~57.0.0",zod:"^4"}})},
   {type:"file",filePath:"app.json",content:JSON.stringify({expo:{name:"Saved",slug:"saved",sdkVersion:"57.0.0",ios:{bundleIdentifier:"me.saved.app"}}})},
   {type:"file",filePath:"index.ts",content:'import "./custom-entry";'},
   {type:"file",filePath:"tsconfig.json",content:JSON.stringify({extends:"expo/tsconfig.base",compilerOptions:{strict:true,paths:{"@/*":["src/*"]}}})},
  ];
  await runtime.restoreStreamingRuntime("migrating-sdk57",actions,true);
  const pkg=JSON.parse(fake.files["package.json"]);
  expect(pkg.dependencies.expo).toBe("~58.0.17"); expect(pkg.dependencies["expo-font"]).toBe("~58.0.9"); expect(pkg.dependencies.zod).toBe("^4");
  expect(fake.files["App.tsx"]).toBe(app);expect(fake.files["index.ts"]).toBe('import "./custom-entry";');
  expect(JSON.parse(fake.files["app.json"]).expo).toMatchObject({name:"Saved",ios:{bundleIdentifier:"me.saved.app"}});
  expect(JSON.parse(fake.files["app.json"]).expo.sdkVersion).toBeUndefined();
  const installed=fake.starts;await runtime.ensureNativePreview("migrating-sdk57");expect(fake.starts).toBe(installed);
 });

});
