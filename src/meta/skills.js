/**
 * The universal skill catalog. Players equip exactly 4 (Q/W/E/R).
 * Every game interprets a skill's `archetype` + `params` in its own context —
 * the descriptions in `inGame` tell the player what each skill becomes there.
 */
export const SKILLS = [
  {
    id: 'blink', name: 'Blink Step', icon: '⚡', color: '#7df9ff', cd: 5,
    archetype: 'dash', params: { range: 12 },
    desc: 'Instantly teleport a short distance.',
    inGame: {
      moba: 'Blink to your cursor — escape ganks or dive the backline.',
      hoops: 'Ankle-breaker warp — teleport past your defender for an open lane.',
      arena: 'Blink out of the horde before it closes around you.',
      kart: 'Blink 12 meters up the road — corner-cut like a legend.',
      brawl: 'Blink-dodge through attacks — or blink back to the ledge.',
      siege: 'Blink across the battlefield to plug a breach instantly.',
    },
  },
  {
    id: 'starfire', name: 'Starfire Bolt', icon: '☄️', color: '#ffb454', cd: 3.5,
    archetype: 'projectile', params: { damage: 34, speed: 26, radius: 1.4 },
    desc: 'Hurl a blazing skillshot bolt.',
    inGame: {
      moba: 'Long-range poke that bursts on the first enemy hit.',
      hoops: 'Ignite the ball — your next shot flies flat and true (+accuracy).',
      arena: 'Piercing bolt that detonates on impact.',
      kart: 'Fire a blazing shell at the kart ahead — direct hit spins them out.',
      brawl: 'A flaming bolt that racks up damage % from across the stage.',
      siege: 'Artillery bolt — bursts on the first raider it touches.',
    },
  },
  {
    id: 'frostring', name: 'Frost Ring', icon: '❄️', color: '#9fd8ff', cd: 9,
    archetype: 'slowfield', params: { radius: 5.5, slow: 0.55, duration: 3.5, damage: 10 },
    desc: 'Freeze the ground, chilling all enemies inside.',
    inGame: {
      moba: 'Zone control — slow the enemy wave and champion.',
      hoops: 'Ice the defender\'s shoes — they lag behind your drive.',
      arena: 'Kite the horde through the frost and watch them crawl.',
      kart: 'Drop an ice slick behind you — pursuers skid and crawl.',
      brawl: 'Chill the platform — slowed fighters are easy to launch.',
      siege: 'Frost the chokepoint and watch the assault crawl.',
    },
  },
  {
    id: 'quake', name: 'Seismic Slam', icon: '💥', color: '#ffd166', cd: 8,
    archetype: 'nova', params: { radius: 5, damage: 40, knock: 7 },
    desc: 'Slam the ground, blasting everything around you.',
    inGame: {
      moba: 'Point-blank burst that shoves minions and champions away.',
      hoops: 'Shockwave screen — knock the defender back and rise up clean.',
      arena: 'Panic button — clear space when you\'re surrounded.',
      kart: 'Shockwave shunts every nearby kart off your racing line.',
      brawl: 'Point-blank launcher — a kill move at high percent.',
      siege: 'Blast the raiders swarming you off the walls.',
    },
  },
  {
    id: 'overdrive', name: 'Overdrive', icon: '🔥', color: '#ff7a5c', cd: 11,
    archetype: 'buff', params: { haste: 0.6, duration: 4 },
    desc: 'Overclock yourself — massive move speed.',
    inGame: {
      moba: 'Run down fleeing kills or escape a bad fight.',
      hoops: 'Fast-break turbo — blow past everyone coast to coast.',
      arena: 'Outrun everything. Everything.',
      kart: 'Raw turbo. Pedal, meet metal.',
      brawl: 'Move and swing faster — a combo machine.',
      siege: 'Sprint between fronts before the lanes collapse.',
    },
  },
  {
    id: 'aegis', name: 'Aegis Barrier', icon: '🛡️', color: '#8ea9ff', cd: 12,
    archetype: 'shield', params: { absorb: 60, duration: 5 },
    desc: 'Project a barrier that absorbs damage.',
    inGame: {
      moba: 'Tank a tower shot or a full combo for free.',
      hoops: 'Unstealable handle — dribble through traffic untouched.',
      arena: 'Wade through the horde while the shield holds.',
      kart: 'A barrier that eats one hit — shells, slams, slicks.',
      brawl: 'A barrier that soaks hits while you keep swinging.',
      siege: 'Hold the line inside the barrier.',
    },
  },
  {
    id: 'mend', name: 'Vital Surge', icon: '💚', color: '#7dffa8', cd: 13,
    archetype: 'heal', params: { amount: 45 },
    desc: 'A surge of life energy restores you.',
    inGame: {
      moba: 'Turn a losing trade into a double kill.',
      hoops: 'Second wind — instantly refill your stamina meter.',
      arena: 'Sustain through the late waves.',
      kart: 'Patch your kart — restore lost top speed and some boost.',
      brawl: 'Shave 45% off your damage meter.',
      siege: 'Combat medic — patch yourself mid-siege.',
    },
  },
  {
    id: 'decoy', name: 'Mirror Decoy', icon: '👥', color: '#c58fff', cd: 14,
    archetype: 'summon', params: { duration: 6, hp: 40 },
    desc: 'Spawn a holographic clone of yourself.',
    inGame: {
      moba: 'Draws tower and champion aggro while you reposition.',
      hoops: 'Holo-screener — the AI bites on the fake every time.',
      arena: 'The horde swarms the clone. It does not swarm you.',
      kart: 'Deploy a holo-kart that baits homing shells.',
      brawl: 'A clone that fights beside you for 6 seconds.',
      siege: 'The decoy draws raider fire away from the citadel.',
    },
  },
  {
    id: 'gravity', name: 'Gravity Well', icon: '🌀', color: '#7f7fff', cd: 13,
    archetype: 'pull', params: { radius: 6.5, pull: 11, duration: 2.2, damage: 8 },
    desc: 'Collapse space — drag enemies to a point.',
    inGame: {
      moba: 'Yank the enemy champion out of position. Free kill.',
      hoops: 'Magnetize the rock — loose balls and rebounds snap to you.',
      arena: 'Bunch the horde up, then delete it with your other skills.',
      kart: 'Magnetize boost rings and slipstream toward the kart ahead.',
      brawl: 'Yank fighters into the air above you — combo starter.',
      siege: 'Drag raiders into your turret kill-zone.',
    },
  },
  {
    id: 'titan', name: 'Titan Form', icon: '🗿', color: '#ffb3d9', cd: 16,
    archetype: 'giant', params: { scale: 1.75, duration: 5, power: 1.5 },
    desc: 'Grow colossal — stronger, heavier, scarier.',
    inGame: {
      moba: 'Bonus damage and bulk — walk through the front line.',
      hoops: 'Posterize mode — dunk from the free-throw line, undeniable.',
      arena: 'Stomp attacks hit everything near you.',
      kart: 'Monster-kart mode — crush whatever you touch.',
      brawl: 'Heavier, harder — your smashes hit like trucks.',
      siege: 'Become the wall.',
    },
  },
  {
    id: 'ghost', name: 'Phase Cloak', icon: '👻', color: '#b8ecff', cd: 15,
    archetype: 'ghost', params: { duration: 3 },
    desc: 'Shift out of phase — untouchable, translucent.',
    inGame: {
      moba: 'Walk through the fight untargetable. Style on them.',
      hoops: 'Phase through the defender — they guard empty air.',
      arena: 'The horde can\'t hit what isn\'t there.',
      kart: 'Phase through shells, slicks, and karts.',
      brawl: 'Untouchable for 3 seconds — walk through the brawl.',
      siege: 'Slip through the horde untouched.',
    },
  },
  {
    id: 'comet', name: 'Comet Crash', icon: '🌠', color: '#ff9de2', cd: 18,
    archetype: 'meteor', params: { damage: 70, radius: 4.5, delay: 0.9 },
    desc: 'Call a comet down from orbit. It is not subtle.',
    inGame: {
      moba: 'Massive delayed nuke — lead your target or zone the objective.',
      hoops: 'Call the comet onto the rim — alley-oop from the heavens.',
      arena: 'Delete an entire wave in one screen-shaking impact.',
      kart: 'Call a comet onto your closest rival. Rude.',
      brawl: 'A comet smashes the stage — massive launch power.',
      siege: 'Orbital strike on a lane push. Deleted.',
    },
  },
]

export const getSkill = id => SKILLS.find(s => s.id === id)
export const KEY_LABELS = ['Q', 'W', 'E', 'R']
export const KEY_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR']

/**
 * Skill keys for WASD-movement games, where KeyW would collide with "move
 * forward": 1-4 primary, with Q/E/R kept as non-conflicting aliases.
 */
export const WASD_KEY_LABELS = ['1', '2', '3', '4']
const WASD_CODES = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, KeyQ: 0, KeyE: 2, KeyR: 3 }
export const wasdKeyIndex = code => WASD_CODES[code] ?? -1
