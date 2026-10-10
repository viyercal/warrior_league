const champions = [
  {id:'caelan',number:'01',name:'Caelan',role:'The armored duelist',description:'A human guardian who fights at close range with a long glaive. His broad shoulder armor, indigo cloak, and determined face are the features that make him recognizable.',skins:[
    ['dawnsworn','Dawnsworn','Signature look','Ivory armor and antique gold. A steadfast protector holding a ruined bridge against the siege.'],
    ['ashen-oath','Ashen Oath','Alternate skin','Blackened steel, a torn crimson cloak, and an ember-fractured weapon. The same guardian after surviving a fallen kingdom.'],
    ['celestial-guard','Celestial Guard','Alternate skin','Pearl armor etched with constellations. His battlefield becomes a celestial causeway above a distant world.']]},
  {id:'nyra',number:'02',name:'Nyra',role:'The agile huntress',description:'A fast fighter who closes the distance with two linked crescent blades. Her long braid, alert expression, and flowing chain give her a distinctive silhouette in motion.',skins:[
    ['veil-huntress','Veil Huntress','Signature look','Oxblood leather and bronze blades in a rain-soaked city. A patient hunter suddenly springing into action.'],
    ['lunar-phantom','Lunar Phantom','Alternate skin','Silver woven armor and a translucent veil. Her blades and movements echo the arcs of the moon.'],
    ['thornbound','Thornbound','Alternate skin','Carved wood, forest leather, and burgundy petals. Her chainblades become a living pattern of thorns.']]},
  {id:'orren',number:'03',name:'Orren',role:'The colossal guardian',description:'A huge protective defender made from stone, roots, and ancient bronze. His massive shield arm and heavy hammer communicate strength, while his face gives him age and humanity.',skins:[
    ['rootbound','Rootbound','Signature look','An ancient temple guardian waking beneath the moss. Living roots bind stone and weathered armor into one body.'],
    ['furnace-king','Furnace King','Alternate skin','Forged iron and narrow molten seams. A living monument at the heart of a vast underground forge.'],
    ['frost-relic','Frost Relic','Alternate skin','Blue marble, silver, and glacial edges. A forgotten guardian emerging from a frozen palace.']]},
  {id:'serai',number:'04',name:'Serai',role:'The commanding spellcaster',description:'A composed, experienced mage who controls the battlefield from a distance. Her ring staff, sculptural robes, and deliberate hand gestures are the core of her identity.',skins:[
    ['tidecaller','Tidecaller','Signature look','Teal, ivory, and bronze above a stormy sea. She directs powerful water magic with the precision of a craftsperson.'],
    ['star-cartographer','Star Cartographer','Alternate skin','Indigo robes traced with copper constellations. The staff becomes an instrument for drawing paths through the stars.'],
    ['desert-oracle','Desert Oracle','Alternate skin','Sand-colored silk, turquoise ceramics, and a crimson sash. She shapes a storm into an intricate map of the desert.']]}
]
const collection=document.querySelector('#collection'),viewer=document.querySelector('.viewer'),stage=document.querySelector('.image-stage'),frame=document.querySelector('.image-frame'),image=document.querySelector('#full-art'),loading=document.querySelector('.load-state'),retry=document.querySelector('#retry')
const artworks=[]
for(const champion of champions){
  const section=document.createElement('section');section.className='champion';section.dataset.champion=champion.id
  section.innerHTML=`<header class="champion-header"><div><div class="champion-heading"><span class="champion-number">${champion.number}</span><div><h2>${champion.name}</h2><span class="role">${champion.role}</span></div></div><p class="champion-description">${champion.description}</p></div><button class="board-button">Compare all three costumes <span aria-hidden="true">↗</span></button></header><div class="skin-grid"></div>`
  for(const [slug,title,type,caption] of champion.skins){
    const art={champion:champion.name,title,type,caption,file:`images/${champion.id}-${slug}.png`}
    const index=artworks.push(art)-1,card=document.createElement('article');card.className='art-card'
    card.innerHTML=`<button class="art-open" aria-label="View ${champion.name}: ${title}"><img src="${art.file}" alt="${champion.name}, ${title}" loading="lazy"><span class="expand">View artwork <span aria-hidden="true">↗</span></span></button><p class="skin-type">${type.toUpperCase()}</p><h3 class="skin-name">${title}</h3><p class="skin-caption">${caption}</p>`
    card.querySelector('button').addEventListener('click',event=>openArt(index,event.currentTarget))
    card.querySelector('img').addEventListener('error',event=>{event.currentTarget.hidden=true;const fallback=document.createElement('span');fallback.className='image-failed';fallback.textContent='Preview unavailable. Open artwork to retry.';event.currentTarget.after(fallback)},{once:true})
    section.querySelector('.skin-grid').append(card)
  }
  const board=artworks.push({champion:champion.name,title:'Costume studies',type:'Character design board',caption:`${champion.name}'s original three-look design board. Compare the face, silhouette, materials, and signature equipment.`,file:`images/${champion.number}-${champion.id}-board.png`})-1
  section.querySelector('.board-button').setAttribute('aria-label',`Compare ${champion.name} costumes`)
  section.querySelector('.board-button').addEventListener('click',event=>openArt(board,event.currentTarget))
  collection.append(section)
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)))
  document.querySelectorAll('.champion').forEach(section=>{section.hidden=button.dataset.filter!=='all'&&section.dataset.champion!==button.dataset.filter})
}))
let active=0,zoom=1,opener=null,ready=false
const setLoading=(error=false)=>{ready=false;image.hidden=true;loading.hidden=false;retry.hidden=!error;document.querySelector('#load-message').textContent=error?'This artwork could not load. Try again or open the original.':'Loading artwork…';updateButtons()}
function updateButtons(){document.querySelector('#zoom-out').disabled=!ready||zoom<=1;document.querySelector('#zoom-in').disabled=!ready||zoom>=3;document.querySelector('#fit').disabled=!ready||zoom===1;document.querySelector('#zoom-level').textContent=zoom===1?'Fit':`${zoom.toFixed(1)}×`}
function sizeImage(){
  if(!ready||!viewer.open)return
  const pad=innerWidth<=700?16:40,fit=Math.min((stage.clientWidth-pad)/image.naturalWidth,(stage.clientHeight-pad)/image.naturalHeight,1)
  const width=Math.max(1,image.naturalWidth*fit*zoom),height=Math.max(1,image.naturalHeight*fit*zoom)
  image.style.width=`${width}px`;image.style.height=`${height}px`
  frame.style.width=`${Math.max(stage.clientWidth,width+pad)}px`;frame.style.height=`${Math.max(stage.clientHeight,height+pad)}px`
  updateButtons()
}
function loadArt(index){
  active=(index+artworks.length)%artworks.length;zoom=1
  const art=artworks[active]
  document.querySelector('#art-character').textContent=`${art.champion} · ${art.type}`
  document.querySelector('#art-title').textContent=art.title
  document.querySelector('#art-caption').textContent=art.caption
  document.querySelector('#position').textContent=`${active+1} / ${artworks.length}`
  document.querySelector('#original').href=art.file
  image.alt=`${art.champion}: ${art.title}`
  setLoading();frame.style.width=frame.style.height='100%';stage.scrollTo(0,0);image.src=art.file
}
function openArt(index,trigger){opener=trigger;viewer.showModal();loadArt(index)}
image.addEventListener('load',()=>{ready=true;image.hidden=false;loading.hidden=true;sizeImage()})
image.addEventListener('error',()=>setLoading(true))
retry.addEventListener('click',()=>{const art=artworks[active];setLoading();image.src=`${art.file}?retry=${Date.now()}`})
document.querySelector('#close').addEventListener('click',()=>viewer.close())
viewer.addEventListener('close',()=>{opener?.focus({preventScroll:true})})
document.querySelector('#previous').addEventListener('click',()=>loadArt(active-1))
document.querySelector('#next').addEventListener('click',()=>loadArt(active+1))
function changeZoom(value){if(!ready)return;zoom=Math.max(1,Math.min(3,value));sizeImage();stage.scrollTo((frame.offsetWidth-stage.clientWidth)/2,(frame.offsetHeight-stage.clientHeight)/2)}
document.querySelector('#zoom-in').addEventListener('click',()=>changeZoom(zoom+.5))
document.querySelector('#zoom-out').addEventListener('click',()=>changeZoom(zoom-.5))
document.querySelector('#fit').addEventListener('click',()=>changeZoom(1))
viewer.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return
  if(zoom>1&&event.target.closest('.image-stage')&&['ArrowLeft','ArrowRight'].includes(event.code))return
  if(event.code==='ArrowRight'){event.preventDefault();loadArt(active+1)}
  if(event.code==='ArrowLeft'){event.preventDefault();loadArt(active-1)}
  if(event.key==='+'||event.key==='='){event.preventDefault();changeZoom(zoom+.5)}
  if(event.key==='-'){event.preventDefault();changeZoom(zoom-.5)}
})
addEventListener('resize',sizeImage)
