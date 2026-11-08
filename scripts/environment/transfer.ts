import path from "node:path";
import {createReadStream,createWriteStream} from "node:fs";
import {readFile,writeFile,appendFile,stat,open,mkdir} from "node:fs/promises";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createCipheriv,createDecipheriv,randomBytes,randomUUID,createHash} from "node:crypto";
import {manifestSchema,MAX_MANIFEST_BYTES,ROOT_KINDS,fileIdentity,safeKey,requireCondition} from "./model";
import {absent,safeDirectory,privatePermissions,privateKey,createPrivateDirectory,verifiedJson,capacity,retainedFile,refuseGitPublication,within} from "./private-files";
import {verifySnapshot,physicalBytes,snapshotRoots} from "./snapshot";
import {publishRasterFile} from "../../src/features/worlds/raster-storage";

const MAGIC=Buffer.from("STENV001"),HEADER_BYTES=52,TAG_BYTES=16;
const metadataNames=["manifest.json","manifest.json.signature","complete.json","complete.json.signature"];
function frame(name:string,size:number){const key=Buffer.from(name),header=Buffer.alloc(12);header.writeUInt32BE(key.length);header.writeBigUInt64BE(BigInt(size),4);return Buffer.concat([header,key]);}
export async function sealSnapshot(directory:string,keyFile:string,destination:string,signal?:AbortSignal){
  const key=await privateKey(keyFile),manifest=await verifySnapshot(directory,key);requireCondition(!within(directory,destination)&&!within(directory,keyFile),"PRIVATE_TRANSFER","Keep encrypted transfers and private keys outside the immutable snapshot.");await refuseGitPublication(destination);await absent(destination);await safeDirectory(path.dirname(destination));await privatePermissions(path.dirname(destination));await capacity(path.dirname(destination),physicalBytes(manifest.files)+manifest.archive.bytes+MAX_MANIFEST_BYTES);
  const iv=randomBytes(12),header=Buffer.concat([MAGIC,iv,Buffer.from(key.keyId,"hex")]),cipher=createCipheriv("aes-256-gcm",Buffer.from(key.encryptionKey,"base64"),iv);cipher.setAAD(header);await writeFile(destination,header,{flag:"wx",mode:0o600});
  async function* payload(){for(const name of metadataNames){const b=await readFile(path.join(directory,name));yield frame(name,b.length);yield b;}
    for(const item of [{name:"database.dump",bytes:manifest.archive.bytes,sha256:manifest.archive.sha256},...manifest.files.filter(f=>!f.linkTo).map(f=>({name:"files/"+fileIdentity(f),bytes:f.bytes,sha256:f.sha256}))]){
      signal?.throwIfAborted();yield frame(item.name,item.bytes);const h=createHash("sha256");let size=0;for await(const b of createReadStream(await retainedFile(directory,item.name))){signal?.throwIfAborted();h.update(b);size+=b.length;yield b;}requireCondition(size===item.bytes&&h.digest("hex")===item.sha256,"TRANSFER_SOURCE_CHANGED","A snapshot file changed during encrypted transfer preparation.");
    }yield Buffer.alloc(12);
  }
  await pipeline(Readable.from(payload()),cipher,createWriteStream(destination,{flags:"a",mode:0o600}),{signal});await appendFile(destination,cipher.getAuthTag());const handle=await open(destination,"r+");try{await handle.sync();}finally{await handle.close();}await privatePermissions(destination);return {sealed:true,snapshotId:manifest.snapshotId,bytes:(await stat(destination)).size,keyId:key.keyId,algorithm:"AES-256-GCM"};
}
export async function openSnapshot(archive:string,keyFile:string,destination:string,signal?:AbortSignal){
  const key=await privateKey(keyFile),size=(await stat(archive)).size;requireCondition(size>HEADER_BYTES+TAG_BYTES+12,"ENCRYPTED_ARCHIVE","The encrypted transfer is incomplete.");await absent(destination);await safeDirectory(path.dirname(destination));await privatePermissions(path.dirname(destination));await capacity(path.dirname(destination),size*2+MAX_MANIFEST_BYTES);await createPrivateDirectory(destination);await createPrivateDirectory(path.join(destination,".transfer"));
  const source=await open(archive,"r"),header=Buffer.alloc(HEADER_BYTES),tag=Buffer.alloc(TAG_BYTES);try{requireCondition((await source.read(header,0,header.length,0)).bytesRead===header.length&&(await source.read(tag,0,tag.length,size-tag.length)).bytesRead===tag.length,"ENCRYPTED_ARCHIVE","The transfer header/tag is incomplete.");}finally{await source.close();}
  requireCondition(header.subarray(0,8).equals(MAGIC)&&header.subarray(20).toString("hex")===key.keyId,"KEY_IDENTITY","The encrypted transfer does not match the selected protected key.");const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key.encryptionKey,"base64"),header.subarray(8,20));decipher.setAAD(header);decipher.setAuthTag(tag);const plaintext=path.join(destination,".transfer",randomUUID()+".authenticated-pack");
  // Nothing is parsed or published until GCM authenticates the entire stream.
  await pipeline(createReadStream(archive,{start:HEADER_BYTES,end:size-TAG_BYTES-1}),decipher,createWriteStream(plaintext,{flags:"wx",mode:0o600}),{signal});
  const packed=await open(plaintext,"r"),packedSize=(await packed.stat()).size;let offset=0;
  async function exact(length:number){requireCondition(Number.isSafeInteger(length)&&length>=0&&offset+length<=packedSize,"TRANSFER_FRAME","The authenticated package has an invalid frame length.");const b=Buffer.alloc(length);let n=0;while(n<length){const r=await packed.read(b,n,length-n,offset+n);requireCondition(r.bytesRead>0,"TRANSFER_FRAME","The package is truncated.");n+=r.bytesRead;}offset+=length;return b;}
  async function next(){const h=await exact(12),length=h.readUInt32BE(),bytes=Number(h.readBigUInt64BE(4));requireCondition(length<=1400&&Number.isSafeInteger(bytes),"TRANSFER_FRAME","The package has an unsafe frame.");return {name:(await exact(length)).toString("utf8"),bytes};}
  try{
    for(const name of metadataNames){const item=await next();requireCondition(item.name===name&&item.bytes<=MAX_MANIFEST_BYTES,"TRANSFER_FRAME","The package metadata order or size differs from the supported format.");await writeFile(path.join(destination,name.startsWith("complete.")?".transfer":"",name),await exact(item.bytes),{flag:"wx",mode:0o600});}
    const manifest=manifestSchema.parse(await verifiedJson(path.join(destination,"manifest.json"),key));await capacity(destination,physicalBytes(manifest.files)+manifest.archive.bytes+MAX_MANIFEST_BYTES);await createPrivateDirectory(path.join(destination,"files"));const roots=snapshotRoots(destination);for(const k of ROOT_KINDS)await createPrivateDirectory(roots[k]);
    for(const item of [{name:"database.dump",bytes:manifest.archive.bytes,sha256:manifest.archive.sha256},...manifest.files.filter(f=>!f.linkTo).map(f=>({name:"files/"+fileIdentity(f),bytes:f.bytes,sha256:f.sha256}))]){
      signal?.throwIfAborted();const incoming=await next();requireCondition(incoming.name===item.name&&incoming.bytes===item.bytes,"TRANSFER_FRAME","The authenticated file set differs from the signed manifest.");safeKey(item.name);const target=path.join(destination,...item.name.split("/"));await mkdir(path.dirname(target),{recursive:true,mode:0o700});const file=await open(target,"wx",0o600),h=createHash("sha256");try{let remaining=item.bytes;while(remaining){const b=await exact(Math.min(65536,remaining));await file.writeFile(b);h.update(b);remaining-=b.length;}await file.sync();}finally{await file.close();}requireCondition(h.digest("hex")===item.sha256,"TRANSFER_FILE","A transferred file differs from its signed checksum.");
    }
    const end=await next();requireCondition(end.name===""&&end.bytes===0&&offset===packedSize,"TRANSFER_FRAME","The package contains unexpected trailing files or bytes.");
    for(const f of manifest.files.filter(f=>f.linkTo)){safeKey(f.linkTo!);const anchor=path.join(destination,"files",...f.linkTo!.split("/")),target=path.join(roots[f.root],...safeKey(f.key).split("/"));await publishRasterFile(anchor,target,f.sha256,f.bytes,anchor);}
    await verifySnapshot(destination,key,false);for(const name of ["complete.json","complete.json.signature"])await writeFile(path.join(destination,name),await readFile(path.join(destination,".transfer",name)),{flag:"wx",mode:0o600});const verified=await verifySnapshot(destination,key);return {opened:true,snapshotId:verified.snapshotId,files:verified.files.length,authenticatedBeforePublication:true};
  }finally{await packed.close();}
}
