// HSB/HSV: hue in degrees, saturation and brightness in percent.
// CSS has no native hsb() colour function, so conversion happens at the rendering boundary.
export function hsbToHex([h,s,b]){
 h=((h%360)+360)%360;s/=100;b/=100;
 const c=b*s,x=c*(1-Math.abs((h/60)%2-1)),m=b-c;
 const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
export const hsbPalettes=[
 {id:'white-blue-only',name:'White & Blue Only',mode:'light',bright:true,fresh:true,colours:'White and royal blue · no grey or gold accents',hsbTokens:{
  canvas:[0,0,100],surface:[0,0,100],'surface-alt':[0,0,100],ink:[220.392157,100,60],muted:[220.392157,100,60],line:[220.392157,100,60],primary:[220.392157,100,60],'on-primary':[0,0,100],gold:[220.392157,100,60],'gold-soft':[0,0,100],'hero-accent':[0,0,100]
 }},
 {id:'blue-white',name:'Blue & White',mode:'light',bright:true,fresh:true,colours:'Pure white · ECB royal blue · neutral grey',hsbTokens:{
  canvas:[0,0,100],surface:[0,0,100],'surface-alt':[220,2,97],ink:[220,12,29],muted:[220,10,40],line:[220,5,89],primary:[220.392157,100,60],'on-primary':[0,0,100],gold:[220.392157,100,60],'gold-soft':[220,5,98],'hero-accent':[0,0,100]
 }},
 {id:'sky-white',name:'Sky & White',mode:'light',bright:true,fresh:true,colours:'Airy white · clear ocean blue · ice blue',hsbTokens:{
  canvas:[200,2,100],surface:[0,0,100],'surface-alt':[198,8,100],ink:[207,50,40],muted:[205,30,48],line:[200,16,91],primary:[195,48,100],'on-primary':[214,71,24],gold:[203,93,59],'gold-soft':[198,13,100],'hero-accent':[192,29,100]
 }},
 {id:'periwinkle-white',name:'Periwinkle',mode:'light',bright:true,fresh:true,colours:'Porcelain white · vivid cornflower blue · soft mist',hsbTokens:{
  canvas:[224,2,100],surface:[0,0,100],'surface-alt':[223,6,100],ink:[222,39,40],muted:[220,25,48],line:[222,13,92],primary:[219,43,100],'on-primary':[225,65,28],gold:[224,77,70],'gold-soft':[222,11,100],'hero-accent':[218,25,100]
 }},
 {id:'black-gold',name:'Black Gold',mode:'dark',colours:'Black · white · golden yellow / HSB',hsbTokens:{
  canvas:[0,0,8],surface:[0,0,12],'surface-alt':[0,0,17],ink:[0,0,97],muted:[0,0,72],line:[0,0,27],primary:[47,84,100],'on-primary':[0,0,9],gold:[47,84,100],'gold-soft':[47,55,22],'hero-accent':[47,70,100]
 }},
 {id:'blue-trio',name:'Blue Trio',mode:'dark',colours:'Navy · biro blue · sky blue / HSB',hsbTokens:{
  canvas:[220,82,24],surface:[220,75,31],'surface-alt':[225,64,38],ink:[201,12,98],muted:[205,26,82],line:[221,44,47],primary:[227,88,76],'on-primary':[210,2,100],gold:[201,48,96],'gold-soft':[223,65,36],'hero-accent':[201,38,100]
 }}
];
