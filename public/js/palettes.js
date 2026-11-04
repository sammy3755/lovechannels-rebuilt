import {hsbPalettes,hsbToHex} from './hsb-palettes.js';
// Shared palette catalogue for the header, chooser, saved preferences and URL previews.
export const palettes=[
 {id:'light',name:'Ivory',mode:'light',colours:'Warm ivory · olive ash · muted gold',canvas:'#eeeae1'},
 {id:'dark',name:'Noir',mode:'dark',colours:'Soft charcoal · warm white · gold',canvas:'#151715'},
 {id:'forest',name:'Forest',mode:'light',colours:'Pale sage · forest green · antique gold',canvas:'#e9ede5'},
 {id:'sand',name:'Sand',mode:'light',colours:'Warm sand · cocoa · bronze',canvas:'#efe3d6'},
 {id:'midnight',name:'Midnight',mode:'dark',colours:'Slate blue · silver white · pale olive',canvas:'#1c2530'},
 {id:'rosewood',name:'Rosewood',mode:'dark',colours:'Dark rosewood · blush white · rose gold',canvas:'#2d2428'},
 {id:'gold-ash',name:'Gold Ash',mode:'dark',colours:'Golden yellow · dark ash · white',canvas:'#25282b'},
 {id:'gold-white',name:'Gold White',mode:'light',colours:'Warm white · golden yellow · charcoal',canvas:'#f5f3ec'},
 {id:'gold-lemon',name:'Gold Lemon',mode:'light',colours:'Light lemon · golden yellow · ash',canvas:'#f4f2dc'},
 {id:'antique-gold',name:'Champagne',mode:'light',colours:'Champagne white · antique gold · dark ash',canvas:'#eee8d9'},
 {id:'crimson-white',name:'Red White',mode:'light',colours:'Soft white · deep red · slate grey',canvas:'#f6f0ed'},
 {id:'crimson-noir',name:'Red Noir',mode:'dark',colours:'Soft black · ruby red · warm white',canvas:'#201e21'},
 {id:'royal-blue',name:'Blue White',mode:'light',colours:'Porcelain white · royal blue · red',canvas:'#edf2f6'},
 {id:'cobalt-noir',name:'Blue Noir',mode:'dark',colours:'Ink blue · cobalt · pearl white',canvas:'#172331'},
 {id:'lemon-blue',name:'Lemon Blue',mode:'light',colours:'Light lemon · deep blue · white',canvas:'#f0f2d9'},
 {id:'lemon-noir',name:'Lemon Ash',mode:'dark',colours:'Dark ash · pale lemon · white',canvas:'#252923'},
 {id:'pearl-slate',name:'White Ash',mode:'light',colours:'Pearl white · light grey · dark ash',canvas:'#eff0ed'},
 {id:'mono-noir',name:'Black White',mode:'dark',colours:'Soft black · ash grey · warm white',canvas:'#1c1e20'},
 {id:'sunshine',name:'Sunshine',mode:'light',bright:true,colours:'Sunflower yellow · white · warm charcoal',canvas:'#fff4b5'},
 {id:'turquoise',name:'Turquoise',mode:'light',bright:true,colours:'Bright mint · turquoise · ocean ink',canvas:'#d5f7f0'},
 {id:'coral',name:'Coral',mode:'light',bright:true,colours:'Peach white · bright coral · warm plum',canvas:'#ffe0d4'},
 {id:'mango',name:'Mango',mode:'light',bright:true,colours:'Mango yellow · cream white · burnt orange',canvas:'#ffe5b7'},
 {id:'sky',name:'Sky Blue',mode:'light',bright:true,colours:'Clear sky blue · white · deep cobalt',canvas:'#dcefff'},
 {id:'lilac',name:'Lilac',mode:'light',bright:true,colours:'Bright lavender · orchid · pearl white',canvas:'#eee2ff'},
 {id:'rose',name:'Rose Pink',mode:'light',bright:true,colours:'Soft pink · vivid rose · warm white',canvas:'#ffe2ec'},
 {id:'spring',name:'Spring Green',mode:'light',bright:true,colours:'Fresh lime · leafy green · white',canvas:'#e0f5c6'},
 {id:'lemon-pop',name:'Lemon Pop',mode:'light',bright:true,colours:'Bright lemon · electric blue · white',canvas:'#eaffbb'},
 {id:'tangerine',name:'Tangerine',mode:'light',bright:true,colours:'Apricot · bold orange · porcelain white',canvas:'#ffeadf'},
 ...hsbPalettes.map(p=>({...p,canvas:hsbToHex(p.hsbTokens.canvas)}))
];
export const themeNames=Object.fromEntries(palettes.map(p=>[p.id,p.name]));
export function applyPalette(id){
 const palette=palettes.find(p=>p.id===id);if(!palette)return;
 for(const key of Object.keys(hsbPalettes[0].hsbTokens))document.documentElement.style.removeProperty('--'+key);
 if(palette.hsbTokens)for(const [key,value] of Object.entries(palette.hsbTokens))document.documentElement.style.setProperty('--'+key,hsbToHex(value));
 document.documentElement.style.colorScheme=palette.mode;
 document.documentElement.dataset.theme=id;
 document.documentElement.dataset.colourMode=palette.mode;
 document.querySelector('meta[name="theme-color"]').content=palette.canvas;
 document.querySelectorAll('.theme-name').forEach(n=>n.textContent=palette.name);
}
