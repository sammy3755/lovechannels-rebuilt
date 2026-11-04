export const fontStyles=[
 {id:'manrope',name:'Manrope',description:'Bold, open and refined',heading:'Manrope',body:'Manrope',bold:true},
 {id:'jakarta',name:'Plus Jakarta Sans',description:'Clean, confident and contemporary',heading:'Plus Jakarta Sans',body:'Plus Jakarta Sans',bold:true},
 {id:'outfit',name:'Outfit',description:'Geometric and welcoming',heading:'Outfit',body:'Outfit',bold:true},
 {id:'inter',name:'Altranex · Inter',description:'Bold headings and clean, regular body text',heading:'Inter',body:'Inter',bold:true},
 {id:'poppins',name:'Poppins',description:'Soft, rounded and modern',heading:'Poppins',body:'Poppins'},
 {id:'space',name:'Space Grotesk',description:'Clean and expressive',heading:'Space Grotesk',body:'Inter'},
 {id:'dm-sans',name:'DM Sans',description:'Friendly and open',heading:'DM Sans',body:'DM Sans'},
 {id:'editorial',name:'Original · Playfair Display',description:'The original editorial style',heading:'Playfair Display',body:'Inter'},
 {id:'italiana',name:'Italiana',description:'Light and elegant',heading:'Italiana',body:'DM Sans'}
];
export function applyFont(id){
 const font=fontStyles.find(f=>f.id===id);if(!font)return;
 const root=document.documentElement;root.dataset.font=id;root.dataset.type=font.bold?'bold':'classic';
 root.style.setProperty('--serif',`'${font.heading}', ${['editorial','italiana'].includes(id)?'Georgia, serif':'sans-serif'}`);
 root.style.setProperty('--sans',`'${font.body}', 'Segoe UI', sans-serif`);
}
export function initFont(){
 let saved;try{saved=localStorage.getItem('lc-font');}catch{}
 const requested=new URLSearchParams(location.search).get('font');
 applyFont(fontStyles.some(f=>f.id===requested)?requested:fontStyles.some(f=>f.id===saved)?saved:'inter');
}
