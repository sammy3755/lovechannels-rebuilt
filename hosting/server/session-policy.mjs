export const sessionPolicy=role=>role==='admin'?{idleSeconds:300,absoluteSeconds:7200}:{idleSeconds:900,absoluteSeconds:28800};
export function sessionInfo(user,now=Date.now()){
 const policy=sessionPolicy(user.session_scope==='admin'?'admin':'member');
 const absoluteExpiresAt=Math.min(Number(user.session_expires),Number(user.session_issued_at)+policy.absoluteSeconds*1000);
 return {...policy,scope:user.session_scope||'member',issuedAt:Number(user.session_issued_at),serverNow:now,absoluteExpiresAt,idleExpiresAt:Math.min(absoluteExpiresAt,Number(user.session_last_seen)+policy.idleSeconds*1000)};
}
export function sessionIsValid(user,now=Date.now()){
 if(!user||!(Number(user.session_issued_at)>0)||!(Number(user.session_last_seen)>0))return false;
 const info=sessionInfo(user,now);
 return now<info.absoluteExpiresAt&&now<info.idleExpiresAt;
}
