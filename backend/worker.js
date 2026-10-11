import { adminPage } from './admin-page.js';

const now = () => Math.floor(Date.now()/1000);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
const normalize = value => typeof value==='string' ? value.toUpperCase().replace(/[\s-]/g,'') : '';
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const failure = (message,status) => {throw Object.assign(new Error(message),{status});};
async function body(request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) failure('请求格式无效。',415);
  if(Number(request.headers.get('Content-Length'))>8192) failure('请求过长。',413);
  const raw=await request.text(); if(raw.length>8192) failure('请求过长。',413);
  try{return JSON.parse(raw);}catch{failure('请求格式无效。',400);}
}
async function limit(request,env,route) {
  const bucket=Math.floor(now()/60);
  const key=await hash(route+':'+(request.headers.get('CF-Connecting-IP')||'local')+':'+bucket);
  const result=await env.DB.prepare('INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(bucket+2)*60).first();
  if(result.count>20) failure('尝试次数过多，请一分钟后再试。',429);
}
async function reader(request,env) {
  const value=request.headers.get('Authorization')||'';
  if(!/^Bearer [a-f0-9]{64}$/.test(value)) failure('请输入邀请码。',401);
  const tokenHash=await hash(value.slice(7));
  const row=await env.DB.prepare('SELECT s.token_hash,i.kind FROM reader_sessions s JOIN invitations i ON i.id=s.invite_id WHERE s.token_hash=? AND i.enabled=1').bind(tokenHash).first();
  if(!row) failure('访问资格已失效，请重新输入邀请码。',401);
  return row;
}
async function admin(request,env) {
  const value=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)qj_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!value||!await env.DB.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(value),now()).first()) failure('请先登录管理页面。',401);
}
function cookie(request,value,maxAge) {
  return `qj_admin=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`+(new URL(request.url).protocol==='https:'?'; Secure':'');
}
async function route(request,env) {
  const url=new URL(request.url), path=url.pathname;
  const origin=request.headers.get('Origin');
  const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(origin && origin!==url.origin && (!allowed.includes(origin)||path.startsWith('/admin'))) failure('此来源不允许访问。',403);
  if(request.method==='OPTIONS') {
    if(!origin||!allowed.includes(origin)) failure('此来源不允许访问。',403);
    return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET,POST','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'600'}});
  }
  if(path==='/admin'&&request.method==='GET') return new Response(adminPage,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});
  if(path.startsWith('/admin/')&&request.method==='POST'&&origin!==url.origin) failure('请在管理页面内操作。',403);
  if(path==='/admin/login'&&request.method==='POST') {
    await limit(request,env,'admin');
    const input=await body(request);
    if(!env.ADMIN_KEY) failure('管理口令尚未配置。',503);
    if(typeof input.password!=='string'||await hash(input.password)!==await hash(env.ADMIN_KEY)) failure('管理口令不正确。',401);
    const value=token();
    await env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now()),env.DB.prepare('INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)').bind(await hash(value),now()+43200)]);
    return json({ok:true},200,{'Set-Cookie':cookie(request,value,43200)});
  }
  if(path.startsWith('/admin/')) {
    await admin(request,env);
    if(path==='/admin/invitations'&&request.method==='GET') {
      const rows=await env.DB.prepare('SELECT id,hint,kind,note,enabled,uses,created_at FROM invitations ORDER BY created_at DESC,rowid DESC LIMIT 1000').all();
      return json({items:rows.results});
    }
    if(path==='/admin/create'&&request.method==='POST') {
      const input=await body(request), count=input.count??1;
      if(!['once','long'].includes(input.kind)||!Number.isInteger(count)||count<1||count>50||typeof input.note!=='string'||input.note.length>120) failure('请检查邀请码类型、数量和备注。',400);
      const statements=[],codes=[];
      for(let i=0;i<count;i++) {
        const raw=token().slice(0,32).toUpperCase(), code='QJ-'+raw.match(/.{8}/g).join('-');
        codes.push(code);
        statements.push(env.DB.prepare('INSERT INTO invitations(id,code_hash,hint,kind,note,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),await hash(normalize(code)),code.slice(-8),input.kind,input.note,now()));
      }
      await env.DB.batch(statements); return json({codes});
    }
    if(path==='/admin/revoke'&&request.method==='POST') {
      const input=await body(request);
      if(typeof input.id!=='string') failure('邀请码无效。',400);
      await env.DB.prepare('UPDATE invitations SET enabled=0 WHERE id=?').bind(input.id).run();return json({ok:true});
    }
    if(path==='/admin/logout'&&request.method==='POST') {
      const value=(request.headers.get('Cookie')||'').match(/qj_admin=([a-f0-9]{64})/)?.[1];
      await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await hash(value)).run();
      return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});
    }
  }
  if(path==='/auth/redeem'&&request.method==='POST') {
    await limit(request,env,'reader');
    const input=await body(request), code=normalize(input.code);
    if(!/^QJ[A-F0-9]{32}$/.test(code)) failure('邀请码无效、已使用或已停用。',403);
    const value=token(), tokenHash=await hash(value);
    const results=await env.DB.batch([
      env.DB.prepare("INSERT INTO reader_sessions(token_hash,invite_id,created_at) SELECT ?,id,? FROM invitations WHERE code_hash=? AND enabled=1 AND (kind='long' OR uses=0)").bind(tokenHash,now(),await hash(code)),
      env.DB.prepare('UPDATE invitations SET uses=uses+1 WHERE id=(SELECT invite_id FROM reader_sessions WHERE token_hash=?)').bind(tokenHash)
    ]);
    if(results[0].meta.changes!==1) failure('邀请码无效、已使用或已停用。',403);
    return json({token:value});
  }
  if(path==='/auth/session'&&request.method==='GET') {await reader(request,env);return json({ok:true});}
  if(path==='/auth/logout'&&request.method==='POST') {
    const row=await reader(request,env);await env.DB.prepare('DELETE FROM reader_sessions WHERE token_hash=?').bind(row.token_hash).run();return json({ok:true});
  }
  let asset;
  if(path==='/protected/catalog.json') asset='/data/catalog.json';
  else if(/^\/protected\/questions\/[a-f0-9]{20}\.json$/.test(path)) asset=path.replace('/protected/','/data/');
  else if(/^\/protected\/images\/[a-f0-9]{24}\.(png|jpg|jpeg|webp|gif|svg)$/.test(path)) asset=path.replace('/protected/images/','/assets/questions/');
  if(asset&&request.method==='GET') {
    await reader(request,env);
    const response=await env.PRIVATE_ASSETS.fetch(new Request(new URL(asset,url),{method:'GET'}));
    if(response.status!==200) return json({error:'题目文件不存在。'},404);
    const headers=new Headers(response.headers); headers.set('Cache-Control','private, no-store'); headers.set('X-Content-Type-Options','nosniff');headers.delete('ETag');
    return new Response(response.body,{status:200,headers});
  }
  return json({error:'页面不存在。'},404);
}
export default {
  async fetch(request,env,ctx) {
    let response;
    try{response=await route(request,env);}catch(error){response=json({error:error.status?error.message:'服务暂时不可用，请稍后重试。'},error.status||503);}
    const origin=request.headers.get('Origin');
    const headers=new Headers(response.headers);headers.set('Vary','Origin');
    if(origin&&(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(origin)&&!new URL(request.url).pathname.startsWith('/admin')) headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Referrer-Policy','no-referrer');
    return new Response(response.body,{status:response.status,headers});
  },
  async scheduled(event,env,ctx){ctx.waitUntil(env.DB.prepare('DELETE FROM auth_attempts WHERE expires_at<?').bind(now()).run());}
};
