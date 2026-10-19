import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import { HttpChunkDecoder } from "../src/lib/server/expo-http";
describe("Metro HTTP framing",()=>{
 it("decodes chunk boundaries split across arbitrary network frames",()=>{const decoder=new HttpChunkDecoder();const source=Buffer.from("4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n");const output=[];for(const byte of source)output.push(...decoder.feed(new Uint8Array([byte])));expect(Buffer.concat(output).toString()).toBe("Wikipedia");expect(decoder.complete).toBe(true);});
 it("rejects malformed chunk headers",()=>{expect(()=>new HttpChunkDecoder().feed(Buffer.from("wat\r\n"))).toThrow();});
});
