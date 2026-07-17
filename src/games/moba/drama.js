import { pick, distXZ } from '../../core/utils.js'
import { GOLD } from './constants.js'

const SHUTDOWN_BOUNTY = 50
const STREAKS = {
  3: ['KILLING SPREE', 'THE RIFT TREMBLES'],
  5: ['RAMPAGE', 'NOTHING LEFT STANDING'],
  7: ['UNSTOPPABLE', 'A LEGEND WALKS THE LANE'],
}
const TAUNTS = {
  firstkill: ['YOUR SKULL WILL CROWN MY GATE'],
  recall: ['RUN HOME, LITTLE CHAMPION', 'YES — FLEE WHILE YOU STILL CAN'],
  retreat: ['THIS LANE IS NOT DONE WITH YOU', 'I ONLY RETREAT TO SHARPEN MY AXE'],
}

/**
 * WAR RIFT drama director — announcer banners (FIRST BLOOD, kill streaks,
 * SHUTDOWN), warlord taunt plates, and the low-HP heartbeat / UNBROKEN beat.
 * Pure presentation layered on the scene's existing kill/death events; the
 * only mechanical touch is the sanctioned +50g SHUTDOWN bounty it returns.
 */
export class Drama {
  constructor(g) {
    this.g = g
    this.playerStreak = 0
    this.enemyStreak = 0
    this.firstBlood = false
    this.enemyFirstKill = false
    this.lastTauntT = -1
    this.prevEnemyState = 'lane'
    // low-HP state (per life)
    this.lowOn = false
    this.wasLow = false
    this.unbrokenUsed = false
    this.heartT = 0
  }

  /** The enemy warlord fell. Returns bonus gold (the SHUTDOWN bounty). */
  onEnemySlain(byPlayer) {
    const g = this.g
    const wasStreaking = this.enemyStreak >= 3
    this.enemyStreak = 0
    if (byPlayer) this.playerStreak++
    const streak = byPlayer ? STREAKS[this.playerStreak] : null

    let primary = null
    let bonus = 0
    if (!this.firstBlood) {
      this.firstBlood = true
      primary = 'fb'
      g.banner('FIRST BLOOD', {
        color: '#ffb84d', duration: 2.2,
        sub: byPlayer ? 'THE CROWD ROARS YOUR NAME' : 'THE WATCHTOWERS DRAW FIRST',
      })
      g.ctx.audio.play('crowd', { vol: 0.8 })
    } else if (byPlayer && wasStreaking) {
      primary = 'sd'
      bonus = SHUTDOWN_BOUNTY
      g.banner('SHUTDOWN', { color: '#ffb84d', sub: 'THE RAMPAGE ENDS BY YOUR HAND', duration: 2.2 })
      g.ui.hud.toast(`+${SHUTDOWN_BOUNTY}g SHUTDOWN BOUNTY`)
      g.ctx.audio.play('crowd', { vol: 0.8 })
    }

    if (streak) {
      const show = () => {
        if (g.over) return
        g.banner(streak[0], { color: '#ff5a26', sub: streak[1], duration: 2.4 })
        g.ctx.audio.play('crowd', { vol: 0.9 })
      }
      primary ? g._timeout(show, 1600) : show()
    } else if (!primary) {
      g.banner('ENEMY SLAIN', { color: '#ffb84d', duration: 2, sub: byPlayer ? `+${GOLD.kill} GOLD` : '' })
    }
    return bonus
  }

  onPlayerDeath() {
    const g = this.g
    this.playerStreak = 0
    this.enemyStreak++
    this.wasLow = false
    this.heartT = 0
    if (this.lowOn) { this.lowOn = false; g.ui.lowHp(false) }
    if (!this.firstBlood) {
      this.firstBlood = true
      g.banner('FIRST BLOOD', { color: '#c23b2e', sub: 'THE WARLORD DRAWS FIRST', duration: 2.2 })
      g.ctx.audio.play('crowd', { vol: 0.6 })
    }
    if (!this.enemyFirstKill) {
      this.enemyFirstKill = true
      this.taunt('firstkill')
    }
  }

  onRespawn() {
    this.wasLow = false
    this.unbrokenUsed = false
  }

  onRecallStart() {
    if (this.g.enemy.alive) this.taunt('recall')
  }

  /** Small warlord taunt plate by his portrait. Sparse: max one per 30s. */
  taunt(kind) {
    const g = this.g
    if (g.over) return
    if (this.lastTauntT >= 0 && g.gameT - this.lastTauntT < 30) return
    this.lastTauntT = g.gameT
    g.ui.taunt(pick(TAUNTS[kind]))
    g.ctx.audio.play('back', { vol: 0.3 })
  }

  update(dt) {
    const g = this.g
    // the warlord turns tail at low HP — let him sneer about it
    const st = g.enemy.state
    if (st !== this.prevEnemyState) {
      if (st === 'retreat' && g.enemy.alive && !g.over
        && distXZ(g.enemy.group.position, g.hero.group.position) < 24) this.taunt('retreat')
      this.prevEnemyState = st
    }

    // ---- low-HP drama: crimson pulse + heartbeat thumps ----
    const frac = g.hp / g.maxHp
    const low = !g.over && !g.playerDead && frac < 0.25
    if (low !== this.lowOn) {
      this.lowOn = low
      g.ui.lowHp(low)
    }
    if (low) {
      this.wasLow = true
      this.heartT -= dt
      if (this.heartT <= 0) {
        this.heartT = 0.92
        g.ctx.audio.play('bounce', { vol: 0.34 })
        g.ctx.audio.play('bounce', { delay: 0.17, vol: 0.22 })
      }
    } else this.heartT = 0
    // clawed back from the brink — once per life
    if (this.wasLow && !this.unbrokenUsed && !g.playerDead && !g.over && frac >= 0.5) {
      this.unbrokenUsed = true
      this.wasLow = false
      g.ui.hud.toast('UNBROKEN — you clawed back from the brink')
      g.ctx.audio.play('crowd', { vol: 0.35 })
    }
  }
}
