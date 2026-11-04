import {autoRotate} from './rotation.js';

/** A cylindrical carousel: cards retain their physical places on a rotating ring. */
export function initRing(root){
 const stage=root.querySelector('.ac-deck-stage'),ring=stage.querySelector('.ac-ring'),cards=[...ring.children],count=root.querySelector('[data-deck-count]'),prefix=root.id==='services'?'service':'event',step=360/cards.length;
 if(!cards.length){stage.innerHTML='<p class="form-note">Gathering details will be added here.</p>';root.querySelector('.ac-deck-controls').hidden=true;return;}
 let angle=0,radius=0,drag,rotation,lastFront=-1;
 const render=()=>{
  const front=((Math.round(-angle/step)%cards.length)+cards.length)%cards.length;
  ring.style.transform=`translateZ(${-radius}px) rotateY(${angle}deg)`;
  root.dataset.rotationAngle=angle.toFixed(2);
  if(front!==lastFront){const logical=Number(cards[front].dataset.sourceIndex??front);root.dataset.activeIndex=logical;count.textContent=`${String(logical+1).padStart(2,'0')} / ${String(root.dataset.logicalCount||cards.length).padStart(2,'0')}`;}
  cards.forEach((card,i)=>{
   const distance=Math.abs(((i*step+angle+540)%360+360)%360-180);
   card.style.opacity=String(1-Math.min(distance,160)/160*.65);
   card.style.filter=`blur(${Math.min(distance,150)/150*1.8}px)`;
   card.style.zIndex=String(Math.round(200-distance));
   if(front!==lastFront){card.classList.toggle('is-front',i===front);card.inert=i!==front;card.setAttribute('aria-hidden',i!==front);}
  });lastFront=front;
 };
 const measure=()=>{const sharedSlots=Math.max(6,...[...document.querySelectorAll('.ac-deck .ac-ring')].map(r=>r.children.length));radius=cards.length===1?0:cards.length===2?cards[0].offsetWidth*.7:Math.round((cards[0].offsetWidth/1.9)/Math.tan(Math.PI/sharedSlots)*1.22);cards.forEach((card,i)=>card.style.transform=`translate(-50%,-50%) rotateY(${i*step}deg) translateZ(${radius}px)`);render();};
 const resize=new ResizeObserver(()=>{if(!root.isConnected){resize.disconnect();return;}measure();});resize.observe(stage);measure();
 const go=direction=>{if(cards.length<2)return;rotation.interacted(3500);angle=(Math.round(angle/step)-direction)*step;ring.classList.add('is-stepping');render();};
 root.querySelector(`#${prefix}-prev`).addEventListener('click',()=>go(-1));root.querySelector(`#${prefix}-next`).addEventListener('click',()=>go(1));
 stage.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();go(event.key==='ArrowLeft'?-1:1);}});
 stage.addEventListener('dragstart',event=>event.preventDefault());
 stage.addEventListener('pointerdown',event=>{if(cards.length<2||event.button!==0||event.target.closest('button,a'))return;drag={x:event.clientX,y:event.clientY,angle,moved:false};ring.classList.remove('is-stepping');stage.setPointerCapture(event.pointerId);rotation.interacted(3500);});
 stage.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x;if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(event.clientY-drag.y)){drag.moved=true;angle=drag.angle+dx*.38;render();}});
 const release=()=>{if(!drag)return;if(drag.moved){angle=Math.round(angle/step)*step;ring.classList.add('is-stepping');render();}drag=null;};
 stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);
 if(cards.length===1){root.querySelectorAll('.ac-deck-controls button').forEach(button=>button.disabled=true);root.dataset.rotationState='paused';return;}
 root.querySelectorAll('.ac-card-cta').forEach(button=>button.addEventListener('pointerenter',()=>rotation.interacted(3500)));
 rotation=autoRotate(root,{visibilityTarget:stage,interactionDelay:3500,pauseOnPointerFocus:false,pauseOnHover:true,frame:dt=>{if(!drag){ring.classList.remove('is-stepping');angle-=3*dt;render();}}});
}
