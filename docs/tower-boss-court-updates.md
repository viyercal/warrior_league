# Tower maintenance and boss balance

Last Bastion is the tower defense mode. War Chariots remains the racing mode. This update adds tower maintenance, improves every existing boss encounter (the Pit Warden, Siege Colossus, and four Crucible stages), and removes Blood Court's automatic Skyfall scoring.

## Player behavior

- Stand near a tower platform. Click the contextual buttons, press F to build or upgrade, or press G to repair. Repairs restore up to 30 HP and charge 0.75 gold per restored HP, rounded up. Tower tiers have 60, 90, and 120 HP; an upgrade also restores full health. The panel shows costs and disables unavailable actions.
- The Pit Warden alternates slams, radial volleys, and charges toward a warned destination. It has attack recovery windows, enrages at half health, and calls final reinforcements at 20% health.
- The Siege Colossus advances faster, alternates close slams and mortar volleys, prioritizes distinct upgraded towers, and targets the player when enraged or no towers remain. Gate strikes and impacts have warnings. Mortar warnings match their damage areas.
- All four Crucible opponents have revised combo decisions and close-range pressure. Sera approaches while her ranged arts recharge. The Eternal presses harder while wounded. Fighter health, damage, movement physics, and cooldown durations remain unchanged.
- Blood Court Skyfall requires possession and buffs one timed shot for five simulation seconds. The hammer itself awards no points. Bad timing misses, defense reduces the bonus, and release or possession loss consumes the effect.

## Verification and coverage

| Area | Checked behavior |
|---|---|
| Tower actions | Mouse build/repair/upgrade; F/G; costs; partial repair; full health; construction; maximum tier; insufficient gold; destroyed/rebuilt tower; range; pause; death; victory; defeat; help text |
| Tower layout | 1440x900, 900x800, 390x844; visible content; panel bounds; separation from other controls and toasts |
| Skyfall | Actual keyboard cast/release; no impact points; bad miss; normal perfect scoring; defense; single consumption; expiry; pause; possession requirement; turnover and check reset |
| Warden | Locked slam/charge targets; dodge safety; burst/recovery; one-time phase summons; finished-match guard; live entrance, fight, death, and next wave |
| Colossus | Dodgeable slam warning; distinct prioritized mortar targets; damage inside the warned area; player targeting; death cleanup; warned gate strike; defeat flow |
| Crucible | All four AI approach and combo decisions; wounded Eternal cadence; stage advancement; boss entry; retry; champion result/stat persistence; hub return |

Repeatable evidence: `tower-maintenance-results.json`, `skyfall-balance-results.json`, `boss-balance-results.json`, and `boss-public-results.json`. The public Cloudflare link passed nine deployment checks with no asset failures or browser errors. The existing Crucible tower flow probe passed 10 checks. The production build passes with the existing large shared-chunk warning. Browser checks found no runtime errors.

Independent adversarial review identified an offset between mortar warning and landing position. One locked target now drives trajectory, warning, and impact. Browser testing also caught stale tower-prompt calls in terminal states; all were replaced. Follow-up review reported no remaining substantive findings. An old cinematic probe used a fixed wall-clock delay and sampled the fissure animation too early under concurrent browser load; it now waits for the actual animation state.

The changes are behaviorally verified, but the difficulty tuning has not been calibrated through a human playtest study.

**Executive summary:** Towers can be maintained in combat, all existing boss encounters have stronger behavior with readable counterplay, and Skyfall requires a successfully timed basketball shot.
