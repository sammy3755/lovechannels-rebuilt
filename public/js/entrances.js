/** Reveal static content without touching the transforms owned by 3D carousels. */
export function initEntrances(){
 const app=document.querySelector('.atelier-site');if(!app)return;
 const selectors=['.ac-section-head','.ac-vision-copy','.ac-vision-visual','.ac-gph-copy','.ac-gph-art','.ac-media-grid>div','.ac-media-list>article','.ac-footer-grid>div','.ac-gallery>button','.ac-wing-product>div:last-child','.ac-children>img','.ac-children>div','.ac-people-heading','.ac-people-bio','.ac-podcast-list>article','.ac-announcements>div','.ac-counters>div','.ac-story-links'];
 const candidates=[...app.querySelectorAll(selectors.join(','))];
 const nodes=candidates.filter(node=>!candidates.some(parent=>parent!==node&&parent.contains(node)));
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}},{threshold:.08,rootMargin:'0px 0px -16px 0px'});
 nodes.forEach((node,i)=>{node.classList.add('lc-reveal');node.dataset.enter=['up','left','right','soft'][i%4];node.style.setProperty('--reveal-delay',Math.min([...node.parentElement.children].indexOf(node),3)*55+'ms');observer.observe(node);});
 const cleanup=new MutationObserver(()=>{if(!app.isConnected){observer.disconnect();cleanup.disconnect();}});cleanup.observe(document.querySelector('#app'),{childList:true});
}
