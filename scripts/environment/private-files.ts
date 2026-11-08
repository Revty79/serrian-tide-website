import {constants,createReadStream} from "node:fs";
import {mkdir,lstat,realpath,readdir,stat,statfs,open,readFile,writeFile,access} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createHash,generateKeyPairSync,randomBytes,sign,verify} from "node:crypto";
import path from "node:path";
import {fileDigest,publishRasterFile} from "../../src/features/worlds/raster-storage";
import {ROOT_KINDS,MAX_MANIFEST_BYTES,digest,fileIdentity,requireCondition,safeKey,type StoredFile,type EnvironmentProfile} from "./model";

let sid:string|undefined;
function windowsSid(){return sid??=execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command","[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"],{encoding:"utf8",windowsHide:true}).trim();}
function scopedAcl(command:string,file:string){return execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{encoding:"utf8",windowsHide:true,env:{...process.env,SERRIAN_INFRA_ACL_PATH:file}});}
export async function privatePermissions(file:string){
  const s=await lstat(file);requireCondition(!s.isSymbolicLink(),"PRIVATE_PERMISSIONS","Private files may not be symbolic links.");
  if(process.platform==="win32"){
    const text=scopedAcl("$a=Get-Acl -LiteralPath $env:SERRIAN_INFRA_ACL_PATH; @($a.Access | Where-Object {$_.AccessControlType -eq 'Allow'} | ForEach-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value}) | ConvertTo-Json -Compress",file),parsed=text.trim()?JSON.parse(text):[],allowed=new Set([windowsSid(),"S-1-5-18","S-1-5-32-544"]),identities=typeof parsed==="string"?[parsed]:parsed;
    requireCondition(identities.length>0&&identities.every((v:string)=>allowed.has(v)),"PRIVATE_PERMISSIONS","Private storage permissions must allow only the operator, SYSTEM and local administrators.");
  }else requireCondition((s.mode&0o077)===0,"PRIVATE_PERMISSIONS","Private files/directories must deny group and other access (0600/0700).");
}
export async function createPrivateDirectory(directory:string){
  await refuseGitPublication(directory,true);
  await mkdir(directory,{mode:0o700});
  if(process.platform==="win32")execFileSync("icacls.exe",[directory,"/inheritance:r","/grant:r",`*${windowsSid()}:(OI)(CI)F`],{windowsHide:true,stdio:"pipe"});
  await privatePermissions(directory);
}
export async function refuseGitPublication(file:string,directory=false){let parent=path.dirname(path.resolve(file));for(;;){if(await lstat(path.join(parent,".git")).then(()=>true,()=>false)){let ignored=false;try{execFileSync("git",["-C",parent,"check-ignore","--no-index","--quiet","--",path.resolve(file)+(directory?path.sep:"")],{windowsHide:true,stdio:"pipe"});ignored=true;}catch{}requireCondition(ignored,"GIT_PRIVATE_DATA","Private snapshots/keys must be outside Git working files or in an explicitly ignored private rehearsal directory.");return;}const next=path.dirname(parent);if(next===parent)return;parent=next;}}
export async function durableJson(file:string,value:unknown){const handle=await open(file,"wx",0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+"\n");await handle.sync();}finally{await handle.close();}}
export async function absent(file:string){requireCondition(!await lstat(file).then(()=>true,e=>{if(e.code==="ENOENT")return false;throw e;}),"DESTINATION_EXISTS","Use a new, absent destination. Existing files or environments are never overwritten.");}
export async function safeDirectory(directory:string){
  requireCondition(path.isAbsolute(directory),"ABSOLUTE_PATH","Use explicit absolute private paths.");
  const normalized=path.resolve(directory),key=(p:string)=>process.platform==="win32"?p.toLowerCase():p;
  requireCondition(normalized!==path.parse(normalized).root&&!normalized.split(path.sep).some(p=>["public",".git",".next"].includes(p.toLowerCase())),"PRIVATE_PATH","Private data may not be a filesystem root or be in public, Git metadata or build directories.");
  let at=path.parse(normalized).root;for(const part of normalized.slice(at.length).split(path.sep).filter(Boolean)){at=path.join(at,part);const s=await lstat(at);requireCondition(s.isDirectory()&&!s.isSymbolicLink(),"LINKED_PATH","Storage paths may not traverse symbolic links or non-directories.");}
  requireCondition(key(await realpath(normalized))===key(normalized),"LINKED_PATH","Storage paths must use their real, unlinked location.");return normalized;
}
export async function checkRootLayout(roots:EnvironmentProfile["roots"]){const values=ROOT_KINDS.map(k=>path.resolve(roots[k]));for(const p of values)await safeDirectory(p);for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++){const a=values[i].toLowerCase(),b=values[j].toLowerCase();requireCondition(a!==b&&!a.startsWith(b+path.sep)&&!b.startsWith(a+path.sep),"OVERLAPPING_ROOTS","The three private roots must be separate, non-overlapping directories.");}}
export async function capacity(directory:string,required:number){const value=await statfs(directory,{bigint:true}),available=value.bavail*value.bsize;requireCondition(BigInt(Math.ceil(required))<=available,"INSUFFICIENT_SPACE","The destination does not have the required conservative free-space reserve.");return Number(available);}
export async function writable(directory:string){await access(directory,constants.R_OK|constants.W_OK|constants.X_OK);}
export async function inventoryFiles(roots:EnvironmentProfile["roots"]){
  await checkRootLayout(roots);const result:StoredFile[]=[],links=new Map<string,{key:string;count:number;sha256:string}>(),names=new Set<string>();
  async function walk(root:typeof ROOT_KINDS[number],relative:string){for(const e of (await readdir(path.join(roots[root],relative),{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const key=relative?relative+"/"+e.name:e.name;safeKey(key);const file=path.join(roots[root],...key.split("/")),s=await lstat(file,{bigint:true});requireCondition(!s.isSymbolicLink(),"LINKED_PATH","A private storage tree contains a symbolic link.");if(s.isDirectory())await walk(root,key);else{
    requireCondition(s.isFile()&&result.length<250000,"FILE_LIMIT","Storage contains a non-file object or exceeds the documented 250,000-file snapshot bound.");const full=root+"/"+key,lower=full.toLowerCase();requireCondition(!names.has(lower),"PATH_COLLISION","Storage contains paths that collide on Windows.");names.add(lower);
    const identity=root+":"+s.dev+":"+s.ino,anchor=links.get(identity),sha256=anchor?.sha256??await fileDigest(file);const row:StoredFile={root,key,bytes:Number(s.size),sha256};if(anchor&&anchor.count<512){row.linkTo=anchor.key;anchor.count++;}else links.set(identity,{key:full,count:1,sha256});result.push(row);
  }}}
  for(const root of ROOT_KINDS)await walk(root,"");return result;
}
export async function retainedFile(root:string,key:string){safeKey(key);let at=await realpath(root);for(const [i,part]of key.split("/").entries()){at=path.join(at,part);const s=await lstat(at);requireCondition(!s.isSymbolicLink()&&(i===key.split("/").length-1?s.isFile():s.isDirectory()),"LINKED_PATH","A retained object is missing or traverses a link.");}return at;}
export async function copyFiles(files:StoredFile[],sourceRoots:EnvironmentProfile["roots"],destinationRoots:EnvironmentProfile["roots"]){
  const byId=new Map(files.map(f=>[fileIdentity(f),f]));for(const f of files){const from=await retainedFile(sourceRoots[f.root],f.key),target=path.join(destinationRoots[f.root],...f.key.split("/"));let anchor:string|undefined;if(f.linkTo){const first=byId.get(f.linkTo);requireCondition(first&&first.root===f.root,"HARDLINK_IDENTITY","An internal hardlink has an invalid anchor.");anchor=path.join(destinationRoots[first.root],...first.key.split("/"));}
    await publishRasterFile(from,target,f.sha256,f.bytes,anchor);
  }
}
export type PrivateKey={version:1;keyId:string;publicKey:string;privateKey:string;encryptionKey:string};
export type TrustKey=Pick<PrivateKey,"version"|"keyId"|"publicKey">;
export async function keygen(file:string,trustFile:string){await refuseGitPublication(file);await absent(file);await absent(trustFile);await privatePermissions(path.dirname(file));const keys=generateKeyPairSync("ed25519"),publicKey=keys.publicKey.export({type:"spki",format:"pem"}).toString(),privateKey=keys.privateKey.export({type:"pkcs8",format:"pem"}).toString(),keyId=digest(publicKey);await durableJson(file,{version:1,keyId,publicKey,privateKey,encryptionKey:randomBytes(32).toString("base64")});await privatePermissions(file);await durableJson(trustFile,{version:1,keyId,publicKey});return {keyId};}
export async function privateKey(file:string):Promise<PrivateKey>{await privatePermissions(file);requireCondition((await stat(file)).size<=8192,"KEY_IDENTITY","The private key bundle exceeds its supported size.");const k=JSON.parse(await readFile(file,"utf8"));requireCondition(k.version===1&&digest(k.publicKey)===k.keyId&&Buffer.from(k.encryptionKey,"base64").length===32&&typeof k.privateKey==="string","KEY_IDENTITY","The protected key bundle is invalid.");return k;}
export async function trustKey(file:string):Promise<TrustKey>{requireCondition((await stat(file)).size<=4096,"KEY_IDENTITY","The public trust key exceeds its supported size.");const k=JSON.parse(await readFile(file,"utf8"));requireCondition(k.version===1&&digest(k.publicKey)===k.keyId,"KEY_IDENTITY","The independently retained trust key is invalid.");return k;}
export async function signJson(file:string,value:unknown,key:PrivateKey){const bytes=Buffer.from(JSON.stringify(value,null,2)+"\n");requireCondition(bytes.length<=MAX_MANIFEST_BYTES,"MANIFEST_LIMIT","The manifest exceeds the documented 64 MiB bound.");await writeFile(file,bytes,{flag:"wx",mode:0o600});await durableJson(file+".signature",{version:1,keyId:key.keyId,signature:sign(null,bytes,key.privateKey).toString("base64")});return digest(bytes);}
export async function verifiedJson(file:string,key:TrustKey){for(const name of [file,file+".signature"]){const metadata=await lstat(name);requireCondition(metadata.isFile()&&!metadata.isSymbolicLink(),"LINKED_PATH","Signed metadata must be retained regular files, never links.");}requireCondition((await stat(file)).size<=MAX_MANIFEST_BYTES&&(await stat(file+".signature")).size<=2048,"MANIFEST_LIMIT","The manifest or signature exceeds the supported bound.");const bytes=await readFile(file),signature=JSON.parse(await readFile(file+".signature","utf8"));requireCondition(signature.version===1&&signature.keyId===key.keyId&&verify(null,bytes,key.publicKey,Buffer.from(signature.signature,"base64")),"SIGNATURE","Snapshot or environment signature verification failed.");return JSON.parse(bytes.toString("utf8"));}
export async function streamedHash(file:string){const h=createHash("sha256");for await(const b of createReadStream(file))h.update(b);return h.digest("hex");}
