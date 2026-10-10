// Original Warrior League roster. Skin IDs are stable saved-profile values.
export const CHAMPIONS = [
  {
    id: 'caelan', name: 'Caelan', title: 'The Dawnsworn', role: 'Armored duelist', number: '01',
    description: 'A guardian with an unbroken oath. Caelan meets the enemy with a long glaive, layered plate, and the resolve to hold the line.',
    motif: 'Resolve · Steel · Sunlight', focal: '44% 35%',
    appearance: { head: 'visor', hair: 'spikes', archetype: 'vanguard', cape: true, trail: 'spark' },
    skins: [
      { id: 'dawnsworn', name: 'Dawnsworn', description: 'Ivory plate, antique gold, and an indigo cloak beneath the first light of a besieged kingdom.', primary: '#d6c5a0', secondary: '#263148', glow: '#e4b966' },
      { id: 'ashen-oath', name: 'Ashen Oath', description: 'Blackened steel and a torn crimson cloak. His oath survives in the embers of a fallen kingdom.', primary: '#65594f', secondary: '#521e24', glow: '#ed8144' },
      { id: 'celestial-guard', name: 'Celestial Guard', description: 'Pearl armor etched with constellations, guarding a causeway suspended above a distant world.', primary: '#c8d3dc', secondary: '#28345f', glow: '#a8cdff' },
    ],
  },
  {
    id: 'nyra', name: 'Nyra', title: 'The Veil Huntress', role: 'Agile huntress', number: '02',
    description: 'A patient hunter, a sudden storm. Nyra closes the distance with linked crescent blades and a dancer’s command of motion.',
    motif: 'Precision · Shadows · Crescent blades', focal: '43% 28%',
    appearance: { head: 'classic', hair: 'swept', archetype: 'raider', cape: false, trail: 'ribbon' },
    skins: [
      { id: 'veil-huntress', name: 'Veil Huntress', description: 'Oxblood leather, bronze blades, and rain-swept rooftops. The city never hears her coming.', primary: '#9e7758', secondary: '#512630', glow: '#d9a66a' },
      { id: 'lunar-phantom', name: 'Lunar Phantom', description: 'Silver woven armor and a translucent veil, her crescent blades tracing arcs of moonlight.', primary: '#c0cad7', secondary: '#353456', glow: '#b2c5ef' },
      { id: 'thornbound', name: 'Thornbound', description: 'Carved wood, forest leather, and burgundy petals. Living thorns follow the curve of every strike.', primary: '#899367', secondary: '#532b39', glow: '#b3c97b' },
    ],
  },
  {
    id: 'orren', name: 'Orren', title: 'The Rootbound', role: 'Colossal guardian', number: '03',
    description: 'An ancient protector given breath by the forest. Stone, roots, and weathered bronze form a living bulwark against the dark.',
    motif: 'Endurance · Ancient stone · Living roots', focal: '46% 35%',
    appearance: { head: 'visor', hair: 'horns', archetype: 'juggernaut', cape: false, trail: 'spark' },
    skins: [
      { id: 'rootbound', name: 'Rootbound', description: 'Moss-covered stone and ancient bronze, waking beneath the roots of a forgotten temple.', primary: '#8e9c75', secondary: '#494237', glow: '#bed184' },
      { id: 'furnace-king', name: 'Furnace King', description: 'Forged iron and molten seams. A living monument at the heart of an underground forge.', primary: '#6b6260', secondary: '#3b2825', glow: '#ef8b43' },
      { id: 'frost-relic', name: 'Frost Relic', description: 'Blue marble, silver, and glacial edges, emerging from the silence of a frozen palace.', primary: '#acced9', secondary: '#304959', glow: '#b7e5ef' },
    ],
  },
  {
    id: 'serai', name: 'Serai', title: 'The Tidecaller', role: 'Commanding spellcaster', number: '04',
    description: 'A scholar of forces that shape worlds. Serai directs elemental magic with a ring staff, a steady hand, and absolute composure.',
    motif: 'Wisdom · Elemental magic · Celestial maps', focal: '37% 27%',
    appearance: { head: 'orb', hair: 'swept', archetype: 'mystic', cape: true, trail: 'ribbon' },
    skins: [
      { id: 'tidecaller', name: 'Tidecaller', description: 'Teal, ivory, and bronze above a stormy sea. Every wave answers the movement of her hand.', primary: '#b5a67d', secondary: '#235a63', glow: '#8bcdd2' },
      { id: 'star-cartographer', name: 'Star Cartographer', description: 'Indigo robes traced with copper constellations, drawing new paths through the stars.', primary: '#b39373', secondary: '#303859', glow: '#bcc5f6' },
      { id: 'desert-oracle', name: 'Desert Oracle', description: 'Sand-colored silk, turquoise ceramics, and a crimson sash, shaping a storm into a map of the desert.', primary: '#d4b992', secondary: '#67313d', glow: '#8bc7bc' },
    ],
  },
]

export const getChampion = id => CHAMPIONS.find(champion => champion.id === id) || CHAMPIONS[0]
export const getSkin = (champion, id) => champion.skins.find(skin => skin.id === id) || champion.skins[0]
export const championArt = (champion, skin) => `${import.meta.env.BASE_URL}concepts/images/${champion.id}-${skin.id}.png`
export const defaultSkins = () => Object.fromEntries(CHAMPIONS.map(champion => [champion.id, champion.skins[0].id]))
export const skinAppearance = (champion, skin) => ({
  ...champion.appearance, championId: champion.id, skinId: skin.id,
  primary: skin.primary, secondary: skin.secondary, glow: skin.glow,
})

export function selectedChampion(profile) {
  const champion = getChampion(profile?.champion)
  return { champion, skin: getSkin(champion, profile?.skins?.[champion.id]) }
}

/** Stable identity selects the authored costume as well as its palette. */
export function selectChampion(profile, championId, skinId) {
  const champion = getChampion(championId)
  const skin = getSkin(champion, skinId ?? profile.skins?.[champion.id])
  profile.champion = champion.id
  profile.skins = { ...defaultSkins(), ...profile.skins, [champion.id]: skin.id }
  profile.appearance = skinAppearance(champion, skin)
  return { champion, skin }
}
