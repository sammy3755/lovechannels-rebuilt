export function initEntrances(){
 const app=document.querySelector('.atelier-site');if(!app)return;
 const nodes=[...app.querySelectorAll('.ac-section-head,.ac-vision-copy,.ac-gph-copy,.ac-media-grid>div,.ac-footer-grid>div')];
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}},{threshold:.12});
 nodes.forEach((node,i)=>{node.classList.add('lc-reveal');node.dataset.enter=i%3===1?'left':i%3===2?'right':'up';observer.observe(node);});
 const cleanup=new MutationObserver(()=>{if(!app.isConnected){observer.disconnect();cleanup.disconnect();}});cleanup.observe(document.querySelector('#app'),{childList:true});
}
