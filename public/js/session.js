let revision=0;
export const sessionRevision=()=>revision;
// Timers lock the screen; only the server decides whether a session is valid.
export function initSessionMonitor(){
 let session=null,offset=0,timer,dirty=false,lastTouch=0,busy=false,account;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('lovechannels-session'):null;
 const stop=()=>{revision++;session=null;clearTimeout(timer);dirty=false;};
 const expire=()=>{if(!session)return;stop();window.dispatchEvent(new Event('lc-session-expired'));};
 const clock=()=>Date.now()+offset;
 const schedule=()=>{clearTimeout(timer);if(!session)return;const remaining=Math.min(session.idleExpiresAt,session.absoluteExpiresAt)-clock();if(remaining<=0){expire();return;}timer=setTimeout(expire,Math.min(remaining+25,2147483647));};
 window.addEventListener('lc-session-expired',stop);
 window.addEventListener('lc-session-update',event=>{
  const value=event.detail.session;
  if(!value){const hadAccount=account;account=undefined;stop();if(hadAccount)channel?.postMessage({type:'changed'});return;}
  if(session?.issuedAt&&value.issuedAt&&value.issuedAt<session.issuedAt)return;
  if(!session||value.issuedAt!==session.issuedAt)revision++;
  const previous=session?.idleExpiresAt,fresh=!session||value.absoluteExpiresAt!==session.absoluteExpiresAt||value.idleExpiresAt>session.idleExpiresAt;session=value;offset=value.serverNow-Date.now();lastTouch=value.idleExpiresAt-value.idleSeconds*1000-offset;if(fresh)dirty=false;schedule();
  const id=event.detail.user?.id;if(id&&account!==id){account=id;channel?.postMessage({type:'changed'});}else if(previous&&value.idleExpiresAt>previous+1000&&!event.detail.localOnly){channel?.postMessage({type:'changed'});}
 });
 async function touch(){
  if(!session||!dirty||busy||document.hidden||Date.now()-lastTouch<60000)return;
  if(clock()>=Math.min(session.idleExpiresAt,session.absoluteExpiresAt)){expire();return;}
  busy=true;const startedRevision=revision;
  try{
   const response=await fetch('/api/session/touch',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
   if(revision!==startedRevision)return;
   if(response.status===401){expire();return;}
   if(response.ok){const result=await response.json();window.dispatchEvent(new CustomEvent('lc-session-update',{detail:result}));}
  }catch{/* A temporary network failure cannot extend either server deadline. */}
  finally{busy=false;}
 }
 for(const event of ['pointerdown','keydown','wheel','touchstart','input'])document.addEventListener(event,e=>{if(!e.isTrusted||!session)return;if(clock()>=Math.min(session.idleExpiresAt,session.absoluteExpiresAt)){expire();return;}dirty=true;void touch();},{passive:true});
 setInterval(()=>{if(session){schedule();void touch();}},10000);
 async function check(){
  if(document.hidden||!session)return;
  schedule();if(!session)return;const startedRevision=revision;
  try{const response=await fetch('/api/session',{credentials:'same-origin'});if(!response.ok)return;const result=await response.json();if(revision!==startedRevision)return;if(!result.user){expire();return;}if(account&&result.user.id!==account){stop();location.reload();return;}window.dispatchEvent(new CustomEvent('lc-session-update',{detail:{...result,localOnly:true}}));}catch{}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
 channel?.addEventListener('message',()=>void check());
}
