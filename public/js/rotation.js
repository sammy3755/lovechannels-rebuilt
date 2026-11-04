const rotations=new Set();
export function disposeRotations(){for(const stop of [...rotations])stop();}

/** Shared lifecycle for every automatic carousel. No timers survive a page change. */
export function autoRotate(root,{next,interval=5500,frame,pauseOnHover=true,pauseOnPointerFocus=true,visibilityTarget=root,interactionDelay=10000,button=root.querySelector('[data-rotation-toggle]')}){
 const events=new AbortController(),motion=matchMedia('(prefers-reduced-motion: reduce)');
 let timer,raf,last=0,visible=false,hover=false,focused=false,paused=motion.matches,manualUntil=0,disposed=false;
 const sync=()=>{
  clearTimeout(timer);cancelAnimationFrame(raf);if(disposed)return;
  if(!root.isConnected){stop();return;}
  const running=!paused&&visible&&!hover&&!focused&&!document.hidden;
  root.dataset.rotationState=paused?'paused':running?'running':'waiting';
  if(button){button.textContent=paused?'Play rotation':'Pause rotation';button.setAttribute('aria-pressed',String(paused));button.setAttribute('aria-label',`${paused?'Start':'Pause'} automatic rotation`);}
  root.setAttribute('aria-live',paused?'polite':'off');
  if(running&&frame){last=performance.now();const animate=now=>{if(disposed)return;if(Date.now()>=manualUntil)frame(Math.min((now-last)/1000,.05));last=now;raf=requestAnimationFrame(animate);};raf=requestAnimationFrame(animate);}
  else if(running)timer=setTimeout(()=>{if(Date.now()>=manualUntil)next();sync();},Math.max(interval,manualUntil-Date.now()));
 };
 const stop=()=>{disposed=true;clearTimeout(timer);cancelAnimationFrame(raf);events.abort();observer.disconnect();rotations.delete(stop);};
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.2;sync();},{threshold:[0,.2]});
 observer.observe(visibilityTarget);
 root.addEventListener('pointerenter',()=>{hover=pauseOnHover;sync();},{signal:events.signal});
 root.addEventListener('pointerleave',()=>{hover=false;sync();},{signal:events.signal});
 root.addEventListener('focusin',event=>{focused=pauseOnPointerFocus||event.target.matches(':focus-visible');sync();},{signal:events.signal});
 root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget)){focused=false;sync();}},{signal:events.signal});
 root.addEventListener('pointerdown',()=>{manualUntil=Date.now()+interactionDelay;sync();},{signal:events.signal});
 root.addEventListener('keydown',()=>{manualUntil=Date.now()+interactionDelay;sync();},{signal:events.signal});
 document.addEventListener('visibilitychange',sync,{signal:events.signal});
 motion.addEventListener('change',event=>{paused=event.matches;sync();},{signal:events.signal});
 button?.addEventListener('click',()=>{paused=!paused;manualUntil=0;sync();},{signal:events.signal});
 rotations.add(stop);sync();
 return {interacted(delay=10000){manualUntil=Date.now()+delay;sync();},stop};
}
