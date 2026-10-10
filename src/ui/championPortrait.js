import { championArt } from '../meta/champions.js'
import './champions.css'

export function championPortrait(parent, champion, skin) {
  const image = document.createElement('img')
  image.className = 'champion-portrait'
  image.alt = `${champion.name}: ${skin.name}`
  image.draggable = false
  image.style.setProperty('--portrait-focus', champion.focal)
  image.addEventListener('error', () => { image.style.opacity = '0' })
  image.src = championArt(champion, skin)
  parent.append(image)
  return image
}
