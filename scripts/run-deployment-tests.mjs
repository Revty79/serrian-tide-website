import {spawnSync} from "node:child_process";
for(const [exe,args]of [[process.platform==="win32"?"python":"python3",["-m","unittest","discover","-s","ops","-p","test_*.py"]],[process.execPath,["--test","ops/deployment.test.mjs"]],[process.execPath,["--import","tsx","--test","ops/bootstrap.test.ts"]]]){
 const result=spawnSync(exe,args,{env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"},stdio:"inherit",windowsHide:true});if(result.error||result.status!==0)process.exit(result.status??1);
}
