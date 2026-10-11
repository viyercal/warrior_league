// Remote-only field battle journey. All gameplay changes come from browser input.
export default async function field(ctx) {
  const { page, open, act, capture, note, sleep, check } = ctx;
  const key = async k => act(`press ${k}`, () => page.keyboard.press(k));
  const state = () => page.evaluate(() => {
    const s = window.__scene, e = window.__ipl?.engine, p = s?.hero?.group?.position;
    return { type: s?.constructor.name, mode: window.__ipl?.sm?.currentName, time: e?.elapsedTime, fps: e?.fps,
      paused: e?.paused, phase: s?.phase, cinematic: !!s?.cine?.active,
      hp: s?.hp, maxHp: s?.maxHp, dead: !!s?.playerDead || s?.deadT > 0,
      over: s?.over, wave: s?.wave, waveState: s?.waveState, kills: s?.kills,
      gold: s?.gold, cds: s?.cds?.slice(), boss: !!s?.boss?.alive,
      enemies: s?.horde?.active.length ?? s?.army?.active.length,
      position: p && { x: p.x, z: p.z },
      towers: s?.turrets?.pads.map(pad => ({ x: pad.x, z: pad.z,
        turret: pad.turret && { hp: pad.turret.hp, level: pad.turret.level, dead: pad.turret.dead } })),
    };
  });
  // Use visible-world positions only to direct ordinary cursor clicks and aiming.
  const point = (kind, index = 0) => page.evaluate(({ kind, index }) => {
    const s = window.__scene, p = s?.hero?.group?.position;
    if (!p || !s.camera) return null;
    let target = p.clone();
    if (kind === 'enemy') {
      const enemies = [...(s.horde?.active || s.army?.active || [])]
        .filter(e => e.alive !== false && e.team !== 'blue')
        .map(e => e.minion?.group?.position || e.group?.position).filter(Boolean);
      if (s.enemy?.alive) enemies.push(s.enemy.group.position);
      if (s.boss?.alive && s.boss.group) enemies.push(s.boss.group.position);
      enemies.sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p));
      if (!enemies.length) return null;
      target.copy(enemies[0]);
    } else if (kind === 'pad') {
      const pads = [...(s.turrets?.pads || [])].sort((a, b) =>
        Math.hypot(a.x-p.x, a.z-p.z) - Math.hypot(b.x-p.x, b.z-p.z));
      if (!pads[index]) return null;
      target.set(pads[index].x, 0, pads[index].z);
    } else if (kind === 'forward') { target.x += 9; target.z = 0; }
    else { target.x += Math.cos(index) * 5; target.z += Math.sin(index) * 5; }
    const world = { x: target.x, z: target.z };
    target.project(s.camera);
    const x = (target.x*.5+.5)*innerWidth, y = (-target.y*.5+.5)*innerHeight;
    if (target.z > 1 || x < 40 || x > innerWidth-40 || y < 95 || y > innerHeight-170) return null;
    return { x, y, world };
  }, {kind, index});
  const clickWorld = async (kind, index = 0) => {
    const p = await point(kind, index);
    if (p) await act(`right click ${kind}`, () => page.mouse.click(p.x, p.y, {button:'right'}));
    return p;
  };
  const hold = async (k, ms) => act(`hold ${k} ${ms}ms`, async () => {
    await page.keyboard.down(k); try { await sleep(ms); } finally { await page.keyboard.up(k); }
  });
  const pauseTest = async mode => {
    await key('Escape'); await sleep(300);
    const visible = await page.locator('.session-overlay').isVisible();
    check(`${mode}: pause menu opens`, visible, await state());
    if (!visible) return;
    const before = await state(); await sleep(900); const after = await state();
    check(`${mode}: pause freezes simulation`, Math.abs(after.time-before.time)<0.06, {before, after});
    await capture(`${mode}-pause`);
    await act('resume via menu', () => page.locator('[data-action="resume"]').click());
    await sleep(300);
    check(`${mode}: resume closes menu`, !(await page.locator('.session-overlay').isVisible()), await state());
  };
  const restartAndHub = async mode => {
    await key('Escape'); await sleep(250);
    if (!await page.locator('.session-overlay').isVisible()) {
      note('coverage', `${mode}: restart unavailable`, 'Match may have returned to hub naturally; screenshot records final state.'); return;
    }
    await act('restart through pause menu', () => page.locator('[data-action="restart"]').click());
    await sleep(1600); await key('z'); await sleep(450);
    const fresh = await state();
    check(`${mode}: restart restores a living player`, fresh.hp > 0 && !fresh.over, fresh);
    await capture(`${mode}-restarted`);
    await key('Escape'); await sleep(250);
    await act('return to hub through pause menu', () => page.locator('[data-action="hub"]').click());
    await sleep(1600);
    check(`${mode}: return to hub`, (await state()).mode === 'hub', await state());
  };
  for (const mode of ['moba', 'arena', 'siege']) {
    try {
      await open(mode);
      await capture(`${mode}-entry`);
      await key('z'); await sleep(500);
      await key('h'); await capture(`${mode}-help`); await key('h');
      await pauseTest(mode);
      const initial = await state();
      if (mode === 'siege') {
        // Reach a real pad from spawn; no position, money, or wave injection.
        for (let i=0; i<8; i++) {
          await clickWorld('pad'); await sleep(800);
          if (await page.locator('.siege-tower-panel').isVisible()) break;
        }
        const panel = page.locator('.siege-tower-panel');
        if (await panel.isVisible()) {
          await capture('siege-build-affordance');
          const build = panel.locator('button').nth(0);
          if (await build.isEnabled()) {
            const before = await state();
            await act('build tower through visible button', () => build.click()); await sleep(1000);
            const after = await state();
            check('siege: build spends gold and creates tower', after.gold < before.gold && after.towers.some(p=>p.turret&&!p.turret.dead), {before, after});
          }
          await key('g'); await key('f');
          await capture('siege-maintenance-after-build');
        } else note('coverage', 'Siege pad not reached', 'Normal click orders did not expose maintenance within bounded navigation time. Review entry and play screenshots.');
      }
      const start = Date.now(); let turns=0, lastCapture=0, naturalEnd=false;
      while (Date.now()-start < 65000) {
        const s = await state();
        if (s.mode !== mode || s.over) {
          naturalEnd=true; await capture(`${mode}-natural-end`); break;
        }
        if (s.cinematic || s.phase === 'bossin') { await capture(`${mode}-encounter-cinematic`); await key('z'); }
        const enemy = await point('enemy');
        if (mode === 'moba') {
          if (enemy) await act('attack visible enemy', () => page.mouse.click(enemy.x, enemy.y, {button:'right'}));
          else await clickWorld('forward');
          if (turns % 3 === 0) for (const k of ['q','w','e','r']) await key(k);
          if (s.hp < 45 && !s.dead) { await key('b'); await sleep(1800); }
          await sleep(1100);
        } else {
          if (enemy) await act('aim and fire at visible enemy', async () => {
            await page.mouse.move(enemy.x, enemy.y); await page.mouse.down();
            try { await sleep(650); } finally { await page.mouse.up(); }
          });
          if (turns % 4 === 0) await clickWorld('orbit', turns*.7);
          else await hold(['a','w','d','s'][Math.floor(turns/3)%4], 500);
          if (turns % 4 === 0) for (const k of ['1','2','3','4']) await key(k);
          if (mode === 'siege' && turns%6===0 && await page.locator('.siege-tower-panel').isVisible()) {
            const buttons = page.locator('.siege-tower-panel button');
            for (let i=1; i>=0; i--) if (await buttons.nth(i).isEnabled())
              await act(i?'repair a damaged tower':'upgrade nearby tower',()=>buttons.nth(i).click());
          }
          await sleep(350);
        }
        turns++;
        if (Date.now()-start-lastCapture > 20000) {
          await capture(`${mode}-combat-${turns}`); lastCapture=Date.now()-start;
        }
      }
      const final = await state();
      await capture(`${mode}-battle-final`);
      check(`${mode}: runtime remains finite`, !final.position || (Number.isFinite(final.position.x)&&Number.isFinite(final.position.z)&&Number.isFinite(final.hp)), final);
      check(`${mode}: simulation progressed`, final.time > initial.time + 2 || naturalEnd, {initial, final, turns});
      note('observation', `${mode}: normal battle journey`, JSON.stringify({initial, final, turns, naturalEnd}));
      if ((mode==='arena'||mode==='siege') && !final.boss)
        note('coverage', `${mode}: boss not reached`, `Normal progression ended at wave ${final.wave}; this journey does not establish boss playability.`);
      if (!naturalEnd) await restartAndHub(mode);
    } catch (error) {
      note('error', `${mode}: journey interrupted`, String(error.stack || error));
      try { await capture(`${mode}-interrupted`); } catch {}
    } finally {
      for (const k of ['a','w','d','s','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']) await page.keyboard.up(k).catch(()=>{});
      await page.mouse.up().catch(()=>{});
    }
  }
}
