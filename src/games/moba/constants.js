/** RIFT LEGENDS — map layout & combat tuning. West = BLUE (player), East = RED (enemy). */

export const NEXUS_X = 48
export const SPAWN_X = 42.5          // hero / minion spawn point on the base platform edge
export const TOWER_XS = [26, 38]     // tier 0 (outer, falls first), tier 1 (inner)
export const TOWER_Z = [3.1, -3.1]   // outer north of lane center, inner south
export const LANE_HALF = 5.5
export const BOUNDS = { x: 52, z: 21.5 }
export const RIVER_ANGLE = 0.55      // yaw of the river band crossing mid

export const TEAMS = {
  blue: { sign: -1, color: '#54e0ff', dark: '#0b3f66', minion: '#3f9fff', caster: '#9a6bff' },
  red:  { sign: 1,  color: '#ff5a3c', dark: '#571109', minion: '#ff6141', caster: '#ff3fc4' },
}

export const HERO = {
  speed: 7, range: 8, atkCd: 0.9, atkDmg: 10,
  hp: 100, hpPerLevel: 15, regen: 1.2,
  energy: 100, energyRegen: 6,
  xpLevels: [0, 80, 200, 360, 560, 800], // thresholds for levels 1..6
  recallTime: 2.5,
}

export const MINION = {
  hp: 22, speed: 3.3, aggro: 7, reach: 1.4,
  meleeDmg: 4, meleeCd: 1,
  casterDmg: 6, casterCd: 2.1, casterRange: 6.5, boltSpeed: 15,
  cap: 24, waveEvery: 22, firstWave: 3,
}

export const TOWER = { hp: 120, range: 11, dmgChamp: 12, dmgMinion: 8, period: 1.2, aimTime: 0.4 }
export const NEXUS_HP = 200

export const GOLD = { cs: 20, tower: 100, kill: 300, itemEvery: 300 }
export const XP = { cs: 20, kill: 150 }

export const ENEMY = {
  hp: 120, regen: 1.2, towerRegen: 4, speed: 6.4,
  pokeRange: 13, pokeDmg: 12, boltSpeed: 13.5, spacing: 10,
  novaDmg: 25, novaR: 4.6, respawn: 12,
}

export const ENERGY_COST = {
  dash: 20, projectile: 20, slowfield: 25, nova: 25, buff: 20, shield: 25,
  heal: 25, summon: 25, pull: 25, giant: 30, ghost: 25, meteor: 30,
}
