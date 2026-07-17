import * as THREE from 'three'

/** Court geometry + game rules shared across hoops modules. Units = meters-ish. */
export const COURT = {
  MINX: -7.5, MAXX: 7.5,          // sidelines
  BASE_Z: -7, HALF_Z: 7,          // baseline (hoop end) / half-court line
  FLOOR_W: 24, FLOOR_D: 19,       // full floor incl. out-of-bounds apron
  ARC_R: 6.75,                    // 3pt arc radius from rim point
  RIM: new THREE.Vector3(0, 3.05, -5.62),
  RIM_FLOOR: new THREE.Vector3(0, 0, -5.62),
  CHECK: new THREE.Vector3(0, 0, 5.4),   // check-ball spot at the top
  BOARD_Z: -6.1,
  BOUND: { minX: -10.6, maxX: 10.6, minZ: -8.3, maxZ: 9.2 },
}

export const RULES = { TARGET: 11, SHOT_CLOCK: 14 }
export const AI_NAME = 'IRONHIDE'   // display name of the CPU warrior
export const GRAV = -16          // stylized ball gravity

export const isThree = pos =>
  Math.hypot(pos.x - COURT.RIM_FLOOR.x, pos.z - COURT.RIM_FLOOR.z) > COURT.ARC_R
