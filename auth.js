'use strict';
window.QJAuth=(()=>{
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const base=local?'http://127.0.0.1:8787':window.QJ_SITE?.apiBase;
  const storage='qj-access-v1:'+new URL('./',document.baseURI).pathname;
  let access=localStorage.getItem(storage)||'', resolveLogin;
  const blobs=new Map();
  const gate=document.getElementById('invite-gate'), message=document.getElementById('invite-message');
  const show=()=>{document.body.classList.add('access-locked');gate.hidden=false;document.getElementById('invite-code').focus();};
  const hide=()=>{document.body.classList.remove('access-locked');gate.hidden=true;};
  function forget(){access='';localStorage.removeItem(storage);for(const promise of blobs.values())promise.then(URL.revokeObjectURL).catch(()=>{});blobs.clear();}
  async function request(path,options={}){
    if(!base)throw new Error('服务地址尚未配置。');
    const r=await fetch(base+path,{...options,cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(access?{Authorization:'Bearer '+access}:{}),...options.headers}});
    if(r.status===401){forget();location.reload();throw new Error('访问资格已失效。');}
    if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error(data.error||'服务暂时不可用，请稍后重试。');}
    return r;
  }
  const protectedPath=path=>path.replace(/^data\//,'/protected/').replace(/^assets\/questions\//,'/protected/images/');
  document.getElementById('invite-form').onsubmit=async e=>{
    e.preventDefault();const button=document.getElementById('invite-submit');button.disabled=true;message.textContent='正在验证…';
    try{
      try{localStorage.setItem(storage+'-check','1');localStorage.removeItem(storage+'-check');}catch{throw new Error('浏览器无法保存访问资格，请启用本地存储后重试。');}
      const r=await request('/auth/redeem',{method:'POST',body:JSON.stringify({code:document.getElementById('invite-code').value})});
      access=(await r.json()).token;
      try{localStorage.setItem(storage,access);}catch{access='';throw new Error('浏览器无法保存访问资格，请启用本地存储后重试。');}
      hide();message.textContent='';resolveLogin();
    }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
  };
  document.getElementById('access-logout').onclick=async()=>{
    if(!confirm('退出会清除本浏览器的访问资格；一次性邀请码无法再次兑换。确定退出？'))return;
    try{await request('/auth/logout',{method:'POST',body:'{}'});}catch{}
    forget();location.reload();
  };
  return {
    async ready(){
      if(access){try{await request('/auth/session');hide();return;}catch(error){message.textContent=error.message;}}
      show();await new Promise(resolve=>resolveLogin=resolve);
    },
    async json(path){return (await request(protectedPath(path))).json();},
    async checkSession(){await request('/auth/session');},
    async image(path){
      if(!blobs.has(path))blobs.set(path,request(protectedPath(path)).then(r=>r.blob()).then(URL.createObjectURL).catch(error=>{blobs.delete(path);throw error;}));
      return blobs.get(path);
    }
  };
})();
