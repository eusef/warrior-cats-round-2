# Spec: Combat

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| Status     | 🔄 In progress                           |
| Design     | Mila                                    |
| Tuning     | Phil                                    |
| Depends on | movement, health bar, HUD action button |

Read alongside `CLAUDE.md`. Every rule there still applies, especially the content policy and the R3F rules. This file only adds what is specific to combat.

---

## Design intent

Mila designed the move set. Build it as specified. Do not "improve" the moves away or add mechanics she did not ask for.

**Combat is real time and positional.** The player keeps full 3D movement throughout the duel. Cats circle, close distance, and back off exactly as they do outside a fight. This is not a turn-based menu battle and it must never feel like one.

Two rules carry the whole system:

1. **Slow moves hit harder, reach further, but can be interrupted during their wind-up.**
2. **Slow moves leave you helpless for longer afterwards, so they can be punished.**

Everything else is decoration.

## Content policy (restated because this is the risky feature)

- Cats do not die. The loser yields and runs off.
- No blood, no gore, no visible wounds, no killing blows.
- Injury is a number on a health bar and nothing else.
- No taunt text, no generated dialogue. Any barks come from `src/content/lines.ts`.

## Flow

1. Player approaches a wandering CPU cat. Within `DUEL_PROMPT_RADIUS`, a **Fight** button appears on the HUD.
2. Tapping **Fight** enters duel mode. Both health bars go active. This is the first real use of the opponent health bar.
3. **The joystick keeps working.** The action bar adds four buttons alongside it: **Pounce**, **Swipe**, **Jump-kick**, **Run away**.
4. Player moves freely and taps a move when in range. Each move resolves on its own timer. There are no turns.
5. Duel ends when either health bar empties, or the player breaks away with **Run away**.

## Movement during a duel

This is the part most likely to be built wrong. Be explicit:

| Phase                    | Movement                                                     |
| ------------------------ | ------------------------------------------------------------ |
| Neutral (no move active) | **Full speed, full 360 control, same as outside combat**     |
| Wind-up                  | Locked or heavily slowed, the cat is committed               |
| Strike                   | Driven by the move itself (pounce and jump-kick lunge forward) |
| Recovery                 | Locked, this is the punish window                            |

The joystick is never disabled and never hidden. Between moves the player has complete freedom to reposition, circle, or retreat. Distance management is the skill the fight is teaching.

## Camera

A soft lock-on, not a fixed cinematic frame. Requirements:

- Keeps both cats in frame, biased so the opponent stays visible
- Sits behind the player and follows their movement, orbiting as they circle
- Never wrests control away, never cuts, never snaps
- Pulls back slightly as the gap widens so a jump-kick approach is readable
- Right-half drag still orbits manually

Do not build a separate combat camera from scratch. Extend the existing follow camera with a look-at target and a distance adjustment.

## Moves

Wind-up is the commit time before the hit lands. Reach is how far it connects. Recovery is how long you are helpless afterwards. **All three scale together:** the strongest move is the slowest, the longest reaching, and the most punishable.

| Move      | Wind-up | Reach                  | Damage | Recovery | Role                                           |
| --------- | ------- | ---------------------- | ------ | -------- | ---------------------------------------------- |
| Swipe     | Fastest | Shortest               | Low    | Shortest | Safe chip damage up close, hard to punish      |
| Pounce    | Medium  | Medium, lunges forward | Medium | Medium   | The workhorse, closes distance                 |
| Jump-kick | Slowest | Longest, big leap      | High   | Longest  | High reward gap-closer, wide open if it misses |
| Run away  | n/a     | n/a                    | none   | n/a      | Break off and end the duel                     |

Numbers live in `constants.ts`, never here. Starting values for Phil to tune by feel:

```ts
export const SWIPE    = { windup: 0.35, reach: 1.5, damage: 8,  recovery: 0.20, lunge: 0 }
export const POUNCE   = { windup: 0.70, reach: 3.0, damage: 16, recovery: 0.40, lunge: 2.0 }
export const JUMPKICK = { windup: 1.20, reach: 4.5, damage: 30, recovery: 0.70, lunge: 3.0 }

export const DUEL_PROMPT_RADIUS = 4
export const DUEL_CAM_DISTANCE  = 6
export const FLEE_DISTANCE      = 15
export const FLEE_SPEED_BONUS   = 1.3
```

## Resolution

There are no turns and no simultaneous commit. Each move runs on its own clock:

1. Player taps a move. Wind-up starts, movement locks.
2. When wind-up completes, the game checks whether the opponent is **within reach and within the forward arc**. Out of range means a clean miss, no damage.
3. On a hit, apply damage and play a hit reaction.
4. Recovery runs. The cat cannot move or act.

**Interrupt rule:** taking a hit during wind-up cancels that move entirely. It deals zero and goes straight to a short stagger.

That is what makes jump-kick a gamble. Its long wind-up gives the opponent time to land a swipe and cancel it, and its long recovery means a whiff is punished. No combo system, no frame data, no cancels.

### Worked examples

| Situation                                                    | Result                                       |
| ------------------------------------------------------------ | -------------------------------------------- |
| Player jump-kicks from far, CPU closes and swipes during wind-up | Kick cancelled, zero damage, player staggers |
| Player jump-kicks from far, CPU stays put                    | Kick lands for full damage                   |
| Player swipes from 3m away                                   | Clean miss, out of reach, short recovery     |
| Player pounces, CPU backs off mid-wind-up                    | Lunge travels but the target moved, miss     |
| Both attack at once and both connect                         | Both take damage, this is fine               |

## Duel state machine

Per cat: `neutral` -> `windup` -> `strike` -> `recovery` -> `neutral`, plus `stagger` on interrupt.

Duel level: `idle` -> `prompt` -> `active` -> `ended`.

Health, phase, active move, and the phase timer live in the store. **Phase timers and all positional movement tick on refs inside `useFrame`. The store is written only on discrete events:** move started, hit landed, move interrupted, health changed, phase changed.

## CPU behaviour

The CPU also moves in 3D. Keep it simple and readable:

- **Approach** when out of range, walking toward the player
- **Attack** when in range, picking a weighted-random move biased to swipe and pounce with an occasional jump-kick
- **Reposition** occasionally, backing off or circling for a moment

That is the whole AI. **Do not build a difficulty curve, adaptive AI, reaction-based dodging, or counters yet.** Watch Mila play first, then decide whether it needs to be smarter or dumber.

## Run away

Tapping it ends the duel. The cat gets `FLEE_SPEED_BONUS` and the duel closes once the player is `FLEE_DISTANCE` away, or immediately if the opponent is not mid-strike.

Run away must always be visible and always tappable. **Mila should never feel trapped in a fight she is losing.** If flee ever feels unreliable, make it unconditional. This is a safety valve, not a mechanic to balance.

## Feedback

Every move needs response inside 100ms:

- [ ] Attack animation on the attacker
- [ ] Hit reaction on the target
- [ ] Sound sting per move, distinct per move
- [ ] Health bar ticks down visibly, animated not instant
- [ ] Interrupted moves read as interrupted, a stumble or a whiff, never a silent no-op
- [ ] A miss reads as a miss, whiff sound plus the animation completing into empty air

## Debug hooks

Build these before any gameplay.

- `window.__game.startDuel()` spawns a CPU cat beside the player and enters a duel
- `window.__game.setHealth(player, enemy)` for win, loss, and low-health scenarios
- `window.__game.forceMove('jumpkick')` and `window.__game.forceEnemyMove('swipe')` to stage the interrupt test
- `window.__game.setDistance(n)` to place the cats at an exact gap for reach testing
- Log every move: mover, move, phase transitions, distance at strike, hit or miss, damage, resulting health

## Acceptance criteria

- [ ] Fight button appears within range of a CPU cat and only then
- [ ] **The joystick still moves the cat in full 360 during a duel, at normal speed, between moves**
- [ ] **Camera keeps both cats in frame while the player circles, without snapping or seizing control**
- [ ] Movement locks during wind-up and recovery, and only then
- [ ] Pounce and jump-kick visibly lunge the cat forward
- [ ] A move used out of reach cleanly misses for zero damage
- [ ] Jump-kick interrupted by a swipe during wind-up deals zero and staggers
- [ ] A whiffed jump-kick leaves a visible punish window
- [ ] Both health bars animate down visibly
- [ ] Duel ends in a yield-and-run, never a death
- [ ] Run away always works and never strands the player
- [ ] Zero console errors through a full duel
- [ ] 60fps held with two animated cats in frame, Chrome, iPad landscape emulation
- [ ] Joystick and the four buttons are both reachable two-thumb in landscape without overlap
- [ ] Phil confirms touch feel, camera comfort, and framerate on the actual iPad

## Out of scope

Blocking, dodging as a button, combos, special moves, multiple simultaneous opponents, XP or leveling, territory consequences for winning. Free movement, four buttons, reach, and the interrupt rule.

## Revision log

| Date       | Change                                                       |
| ---------- | ------------------------------------------------------------ |
| 2026-07-27 | Initial spec from Mila's design                              |
| 2026-07-27 | Combat is real time with full 3D movement, not turn based. Added reach and recovery per move, soft lock-on camera, CPU movement states, positional flee. |

|      |      |
| ---- | ------ |
|      |      |
|      |      |
