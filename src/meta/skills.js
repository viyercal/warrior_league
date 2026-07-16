/**
 * The universal skill catalog. Players equip exactly 4 (Q/W/E/R).
 * Every game interprets a skill's `archetype` + `params` in its own context —
 * the descriptions in `inGame` tell the player what each skill becomes there.
 */
export const SKILLS = [
  {
    id: 'blink', name: 'Shadow Step', icon: '👣', color: '#9aa3b2', cd: 5,
    archetype: 'dash', params: { range: 12 },
    desc: 'Vanish into smoke and reappear a short distance away.',
    inGame: {
      moba: 'Step through shadow to your cursor — slip an ambush or dive their line.',
      hoops: 'Vanish past your marker — reappear with an open lane to the hoop.',
      arena: 'Step through shadow before the horde closes its jaws around you.',
      kart: 'Shadow-step 12 lengths up the track — cut the corner like a wraith.',
      brawl: 'Step through their strike in a puff of ash — or back to the ledge.',
      siege: 'Cross the battlefield in one stride to plug a breach in the wall.',
    },
  },
  {
    id: 'starfire', name: 'Flaming Spear', icon: '🔥', color: '#ff5a26', cd: 3.5,
    archetype: 'projectile', params: { damage: 34, speed: 26, radius: 1.4 },
    desc: 'Hurl a forge-fired spear that bursts into embers.',
    inGame: {
      moba: 'Long-range throw that bursts on the first foe it finds.',
      hoops: 'Bless the ball with forge fire — your next shot flies flat and true.',
      arena: 'A burning spear that detonates on impact.',
      kart: 'Hurl a flaming spear at the chariot ahead — a clean hit spins them out.',
      brawl: 'A burning spear that stacks damage from across the arena.',
      siege: 'Spear from the ramparts — bursts on the first raider it touches.',
    },
  },
  {
    id: 'frostring', name: 'Grave Chill', icon: '💀', color: '#b8c4c8', cd: 9,
    archetype: 'slowfield', params: { radius: 5.5, slow: 0.55, duration: 3.5, damage: 10 },
    desc: 'Curse the ground with grave-cold — all within slow to a crawl.',
    inGame: {
      moba: 'Curse the lane — the enemy wave and warlord wade through the cold.',
      hoops: 'Grave-chill your marker\'s legs — they drag behind your drive.',
      arena: 'Kite the horde through the cursed ground and watch them crawl.',
      kart: 'Leave cursed frost in your wake — pursuers skid and crawl.',
      brawl: 'Chill the arena floor — slowed warriors are easy to launch.',
      siege: 'Curse the chokepoint and watch the assault falter.',
    },
  },
  {
    id: 'quake', name: 'Earthbreaker', icon: '🪨', color: '#b0793a', cd: 8,
    archetype: 'nova', params: { radius: 5, damage: 40, knock: 7 },
    desc: 'Split the ground with one blow — everything near you is thrown.',
    inGame: {
      moba: 'Point-blank eruption that hurls minions and warlords away.',
      hoops: 'Shatter the court — knock your marker back and rise up clean.',
      arena: 'The panic blow — break the circle when the Pit closes in.',
      kart: 'The shockwave hurls every nearby chariot off your line.',
      brawl: 'Point-blank launcher — a killing blow at high percent.',
      siege: 'Hurl the raiders swarming you back off the walls.',
    },
  },
  {
    id: 'overdrive', name: 'Bloodrush', icon: '🩸', color: '#c23b2e', cd: 11,
    archetype: 'buff', params: { haste: 0.6, duration: 4 },
    desc: 'Battle fury floods your veins — massive move speed.',
    inGame: {
      moba: 'Run down the fleeing wounded — or escape a fight gone wrong.',
      hoops: 'Fury sprint — blow past every defender end to end.',
      arena: 'Outrun everything. Everything.',
      kart: 'Whip the team into a frenzy. Raw speed.',
      brawl: 'Strike and move faster — a flurry of iron.',
      siege: 'Sprint between fronts before the gates fall.',
    },
  },
  {
    id: 'aegis', name: 'Iron Bulwark', icon: '🛡️', color: '#8c939f', cd: 12,
    archetype: 'shield', params: { absorb: 60, duration: 5 },
    desc: 'Raise a wall of ancestral iron that soaks the blows meant for you.',
    inGame: {
      moba: 'Shrug off a tower bolt or a full combo behind raised iron.',
      hoops: 'An unbreakable grip — carry the ball through traffic untouched.',
      arena: 'Wade through the horde while the iron holds.',
      kart: 'Plating that eats one hit — spears, rams, cursed frost.',
      brawl: 'Iron that soaks their blows while you keep swinging.',
      siege: 'Hold the line behind the bulwark.',
    },
  },
  {
    id: 'mend', name: 'Warrior\'s Resolve', icon: '✊', color: '#ffb84d', cd: 13,
    archetype: 'heal', params: { amount: 45 },
    desc: 'Grit your teeth and refuse to fall — wounds close, strength returns.',
    inGame: {
      moba: 'Turn a losing duel into a double kill.',
      hoops: 'Second wind — your stamina surges back at once.',
      arena: 'Endure through the late waves.',
      kart: 'Steady the chariot — recover lost speed and some charge.',
      brawl: 'Shake off 45% of your wounds.',
      siege: 'Bind your wounds without leaving the wall.',
    },
  },
  {
    id: 'decoy', name: 'Phantom Twin', icon: '🎭', color: '#8f86a3', cd: 14,
    archetype: 'summon', params: { duration: 6, hp: 40 },
    desc: 'Conjure a spectral double of yourself from ash and shadow.',
    inGame: {
      moba: 'Towers and warlords strike the phantom while you reposition.',
      hoops: 'A phantom screener — the defense bites on the fake every time.',
      arena: 'The horde swarms the phantom. It does not swarm you.',
      kart: 'A phantom chariot rides ahead and baits the hunting spears.',
      brawl: 'A twin that fights at your side for 6 seconds.',
      siege: 'The phantom draws raider fury away from the bastion.',
    },
  },
  {
    id: 'gravity', name: 'Chained Harrow', icon: '⛓️', color: '#a1252c', cd: 13,
    archetype: 'pull', params: { radius: 6.5, pull: 11, duration: 2.2, damage: 8 },
    desc: 'Hurl cursed chains that drag every foe to one point.',
    inGame: {
      moba: 'Drag the enemy warlord out of position. An execution follows.',
      hoops: 'Chain the ball — loose balls and rebounds snap to your hands.',
      arena: 'Chain the horde into a heap, then break it with your other arts.',
      kart: 'Hook boost rings and drag yourself toward the chariot ahead.',
      brawl: 'Drag warriors into the air above you — the combo begins.',
      siege: 'Drag raiders into your ballista kill-zone.',
    },
  },
  {
    id: 'titan', name: 'Colossus Form', icon: '🗿', color: '#c9b083', cd: 16,
    archetype: 'giant', params: { scale: 1.75, duration: 5, power: 1.5 },
    desc: 'Swell into a living colossus — stronger, heavier, dreadful.',
    inGame: {
      moba: 'Heavier blows, thicker hide — walk through their front line.',
      hoops: 'Colossus slam — dunk from the free-throw line, undeniable.',
      arena: 'Your stomps strike everything near you.',
      kart: 'A colossus at the reins — crush whatever you touch.',
      brawl: 'Heavier, harder — your blows land like siege stones.',
      siege: 'Become the wall.',
    },
  },
  {
    id: 'ghost', name: 'Wraith Walk', icon: '🌫️', color: '#d8d2c2', cd: 15,
    archetype: 'ghost', params: { duration: 3 },
    desc: 'Fade into the mist of the dead — untouchable, half-seen.',
    inGame: {
      moba: 'Walk the fight as a wraith, untargetable. Let them swing at fog.',
      hoops: 'Drift through the defender — they guard empty air.',
      arena: 'The horde cannot bite what is not there.',
      kart: 'Ride through spears, frost, and chariots like mist.',
      brawl: 'Untouchable for 3 seconds — walk through the melee.',
      siege: 'Slip through the raider horde untouched.',
    },
  },
  {
    id: 'comet', name: 'Skyfall Hammer', icon: '🔨', color: '#ff8c3b', cd: 18,
    archetype: 'meteor', params: { damage: 70, radius: 4.5, delay: 0.9 },
    desc: 'Call a burning hammer down from the heavens. It is not subtle.',
    inGame: {
      moba: 'A massive delayed strike — lead your target or claim the objective.',
      hoops: 'Call the hammer onto the rim — an alley-oop from the heavens.',
      arena: 'Erase an entire wave in one ground-shaking blow.',
      kart: 'Call the hammer onto your closest rival. Dishonorable. Effective.',
      brawl: 'The hammer smashes the arena — massive launch power.',
      siege: 'The sky falls on their lane push. Ended.',
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
