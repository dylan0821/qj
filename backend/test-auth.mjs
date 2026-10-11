import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:8787',origin='http://127.0.0.1:8772';
const secret=(await fs.readFile(new URL('../.dev.vars',import.meta.url),'utf8')).match(/^ADMIN_KEY=(.+)$/m)[1];
let cookie='';
async function req(path,{data,token,admin=false,from=origin,method}={}){
 const response=await fetch(base+path,{method:method||(data?'POST':'GET'),headers:{Origin:from,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(admin?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
 const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}return {status:response.status,body,headers:response.headers};
}
let checks=0;function check(test,msg){assert.ok(test,msg);checks++;console.log('PASS '+msg);}
let r=await req('/admin/invitations',{from:base});check(r.status===401,'管理列表禁止匿名访问');
r=await req('/admin/login',{data:{password:'wrong'},from:base});check(r.status===401,'错误管理口令被拒绝');
r=await req('/admin/login',{data:{password:secret},from:base});check(r.status===200,'管理员登录');cookie=r.headers.get('set-cookie').split(';')[0];check(r.headers.get('set-cookie').includes('HttpOnly')&&r.headers.get('set-cookie').includes('SameSite=Strict'),'管理员会话 Cookie 限制');
async function create(kind,note){const r=await req('/admin/create',{data:{kind,note,count:1},admin:true,from:base});assert.equal(r.status,200);return r.body.codes[0];}
const once=await create('once','并发测试');
const results=await Promise.all(Array.from({length:10},()=>req('/auth/redeem',{data:{code:once}})));
check(results.filter(r=>r.status===200).length===1&&results.filter(r=>r.status===403).length===9,'10 个请求并发兑换一次性码，仅 1 次成功');
const onceToken=results.find(r=>r.status===200).body.token;
r=await req('/auth/session',{token:onceToken});check(r.status===200,'一次性兑换后的浏览器凭据可持续访问');
r=await req('/auth/redeem',{data:{code:once}});check(r.status===403,'一次性码不能再次兑换');
const long=await create('long','停用测试');
const l1=await req('/auth/redeem',{data:{code:long}}),l2=await req('/auth/redeem',{data:{code:long.toLowerCase().replaceAll('-',' ')}});
check(l1.status===200&&l2.status===200&&l1.body.token!==l2.body.token,'长期码可在不同浏览器重复兑换');
r=await req('/protected/catalog.json');check(r.status===401,'题库目录匿名访问被拒绝');
r=await req('/protected/catalog.json',{token:'a'.repeat(64)});check(r.status===401,'伪造浏览器凭据被拒绝');
r=await req('/protected/catalog.json',{token:onceToken});check(r.status===200&&r.body.items.length===842,'验证后可读取全部 842 道题的目录');
check(r.headers.get('cache-control').includes('no-store'),'受保护数据不能被公共缓存');
const id=r.body.items[0].id;
r=await req('/protected/questions/'+id+'.json');check(r.status===401,'题目内容匿名访问被拒绝');
r=await req('/protected/questions/'+id+'.json',{token:onceToken});check(r.status===200&&r.body.question_html,'验证后读取题目');
const image=(await fs.readdir(new URL('../private-assets/assets/questions/',import.meta.url)))[0];
r=await req('/protected/images/'+image);check(r.status===401,'图片匿名访问被拒绝');
r=await req('/protected/images/'+image,{token:onceToken});check(r.status===200,'验证后读取题目图片');
for(const path of ['/data/catalog.json','/data/questions/'+id+'.json','/assets/questions/'+image,'/index.html','/protected/../data/catalog.json']){r=await req(path);check(r.status===404,'禁止绕过 Worker 直接读取 '+path);}
r=await req('/protected/catalog.json',{token:onceToken,from:'https://evil.example'});check(r.status===403&&!r.headers.get('access-control-allow-origin'),'不允许其他网站发起读取');
r=await req('/protected/catalog.json',{token:onceToken});check(r.headers.get('access-control-allow-origin')===origin,'合法前端跨域读取');
r=await req('/auth/redeem',{method:'OPTIONS'});check(r.status===204&&r.headers.get('access-control-allow-headers').includes('Authorization'),'合法跨域预检');
r=await req('/admin/create',{data:{kind:'long',note:'',count:1},admin:true,from:origin});check(r.status===403,'阻止跨站管理员操作');
r=await req('/admin/create',{data:{kind:'long',note:'',count:51},admin:true,from:base});check(r.status===400,'管理输入数量限制');
r=await req('/admin/invitations',{admin:true,from:base});check(r.body.items.every(i=>!('code_hash' in i)&&!('code' in i)),'列表不泄露完整邀请码或存储哈希');
const longId=r.body.items.find(i=>i.hint===long.slice(-8)).id,onceId=r.body.items.find(i=>i.hint===once.slice(-8)).id;
await req('/admin/revoke',{data:{id:longId},admin:true,from:base});
check((await req('/auth/session',{token:l1.body.token})).status===401&&(await req('/auth/session',{token:l2.body.token})).status===401,'停用长期码立即拒绝全部关联会话');
check((await req('/auth/redeem',{data:{code:long}})).status===403,'已停用的长期码不能兑换');
await req('/admin/revoke',{data:{id:onceId},admin:true,from:base});check((await req('/protected/catalog.json',{token:onceToken})).status===401,'已兑换的一次性码也可停用');
const logoutCode=await create('long','退出测试');const login=await req('/auth/redeem',{data:{code:logoutCode}});
check((await req('/auth/logout',{data:{},token:login.body.token})).status===200&&(await req('/auth/session',{token:login.body.token})).status===401,'退出登录使凭据失效');
let limited=false;for(let i=0;i<22;i++){r=await req('/auth/redeem',{data:{code:'invalid'}});if(r.status===429){limited=true;break;}}check(limited,'错误邀请码尝试受到速率限制');
const browserCode=await create('once','本地浏览器验收');await fs.writeFile(new URL('../browser-test-code.txt',import.meta.url),browserCode);console.log(checks+' 项后端验收通过。浏览器测试码保存在私有临时文件中。');
