# Game object architecture

Apply these conventions when adding gameplay objects under `src/game`.

## First prototype brief

SceneController starts in the main menu and loads Workshop on demand. Workshop owns the rooms, targets, navigation and voxel enemies. Sweep each projectile to its first impact. Use the material layers and shared debris queue for damage. Movement, navigation and subsequent shots must respect the resulting openings.

## Abstractions and implementations

- An abstract game-object class declares required fields and methods only. Use abstract declarations throughout, with no constructor logic, initializers or method bodies. For example, `Weapon` declares `readonly config` and `tryFire(context)`. Each concrete weapon implements its firing rules and owns its cooldown state.
- Give each concrete implementation its own folder. For example, `CubeBlaster extends Weapon` and implements its shot by spawning a cube projectile. Keep projectile-specific dependencies inside that implementation.
- Consumers depend on the abstraction. `PlayerCharacter` asks its `WeaponSlot` to fire. The slot holds a `Weapon` and forwards the call. The code that equips the player chooses the concrete weapon. Adding a weapon should require changes only to its implementation, config and equip selection.

## Configuration and balance

Suggested layout for the first weapon:

```text
entities/weapons/
  Weapon.ts                 # contract: required fields and methods
  config.ts                 # WeaponConfig and defaultWeaponConfig
  cubeBlaster/
    CubeBlaster.ts          # concrete shot behavior
    config.ts               # CubeBlasterConfig and cubeBlasterConfig
```

- Keep the common config type and base defaults together at the family level. Extend `WeaponConfig` for the blaster. Compose `cubeBlasterConfig` from `defaultWeaponConfig` and explicit overrides so shared defaults have a single source.
- Place a typed `config.ts` beside each concrete game object. A balance change belongs there. For a blaster this includes damage, seconds between shots, projectile speed, penetration strength and impact radius. Use names that state the units, such as `shotIntervalSeconds`.
- Let the concrete constructor default to its adjacent config and accept a compatible config for variants. Treat config as read-only. Keep mutable runtime state on the instance so two blasters with the same config have independent cooldowns.
- Follow the same split for enemies and characters. For example, maximum health and run speed are configuration, current health and velocity belong to the instance, and movement and damage rules belong to the appropriate class.

## Defense Run

- Construction uses `CarrySlot` (one generic carried item), `BuildCatalog` (type-to-price/factory), and `PlacementGrid` (stable room/cell IDs). No purchase/carry/placement logic belongs in CubeTurret. Workshop composes the catalog with concrete factories. BuildingView is only the temporary shop/held-item/preview presentation.
- A carried construction kit disables firing without replacing the equipped weapon. E buys/picks up; Q installs after a fresh footprint and sight check; R puts it down for later pickup. The shop sells only one outstanding kit and only if a room has a free cell. Buying uses RunProfile coins and the wave purchase restriction; installation remains possible during a wave.
- ZombieTargetPriority chooses an intention once on actual room entry, not in corridors or every frame. Armed turret weights: player 30%, turrets 40%, core 30%; empty turrets: 45/10/45; no turrets: 50/0/50. Available targets require a strict non-breaching route. Door breaches recalculate paths, not intention. Player body-block is the only interrupt; projectile damage slows/knocks back but does not change target.
- Construction slots count toward the four-turret room cap, including starter and destroyed turrets. Dynamic turrets must be registered with combat targets and UI together. UI arrays grow when the turret registry grows.

- `Workshop` owns the current level only: rooms, doors, enemies, turrets, core and navigation. It must not own permanent player data.
- `PlayerProfile` owns gold, experience and future persistent resources. Access external persistence only through `ProfileRepository`; a future Yandex adapter must implement that interface rather than leak SDK calls into game objects.
- `EnemyWaveController` owns wave phases and live/queued counts. It spawns enemies through a callback and learns about a death by observing the enemy state; it does not decide enemy behavior.
- `Turret` is an abstract contract with declarations only. A concrete turret owns combat state; its `Visual` owns meshes and exposes its muzzle transform. Range means target-acquisition range, distinct from projectile flight range.
- Concrete turret level configs own upgrade costs, fire rates, visual sizing and projectile factories. Workshop gates paid upgrades through RunProfile during preparation. Upgrade the existing turret and keep its health, ammo, slot and level on rebuild.
- `Projectile` declares the flight data and impact hook. `ProjectileSystem` sweeps the flight to the first collision. Explosions damage each live zombie in radius once (including the direct target), without cover rays. Chip at most one nearby shell voxel per victim as cosmetic debris; do not run structural fracture or create a rigid body for that chip. Doors retain material-based destruction; blast fragments do not deal secondary damage.
- A door visual must never be the only source of truth. Its interaction state controls the matching physical colliders and navigation cells. A changed door or destroyed voxel must increment navigation revision so a pursuing enemy replans from its current position.
- UI under `src/game/ui` only renders state and forwards commands. It must not mutate health, gold, ammo, wave state or door state directly.

## Levels and training

- Levels two and three keep the stress HUD. Level three uses level two's wave quota per spawn room, rotating spawns across three lanes while sharing one per-frame spawn and navigation budget. Tunnel pairs are ordered outer room to inner room; the inner room's vacuum covers the corridor.
- `maxPathBuildsPerFrame` budgets both movement plans and target reachability on one FIFO. A pending check is not an unreachable target: keep the current target and retry before rolling room intent. See `OPTIMIZATIONS.md` for historical measurements.
- Possible follow-up (not implemented): build one reverse direction field per actual target ID, not per enemy or per intention. Share directions from each cell; prefer any walkable route before a breach. Keep crowd avoidance and door attack positions local. Start with the stationary core and invalidate its field when traversability changes; profile before extending to individual turrets or the moving player.

- `levels/LevelRegistry` maps stable level IDs to immutable definitions. Layout, turret placements and waves live in each level's `config.ts`; do not hardcode tutorial geometry in Workshop.
- `LevelSession` owns one FirstPersonGame lifetime. SceneController owns the persistent profile and disposes the old session before restarting or changing levels. RunProfile is new for each session.
- `LevelScenario` is a declaration-only contract. TutorialScenario and SurvivalScenario own progression; EnemyWaveController only handles spawning, counts, countdowns and waiting for scenario requirements.
- Requirements read current world state, including completed vacuum animations. Repaired doors replace their models, so do not capture the old door instance in requirements. Scenario entry effects (bonus, empty ammo) run once per completed wave.
- Training starts with a destroyed turret, then 3 enemies after 10 seconds, repair, 8 enemies, refill and repair, and endless batches of 5 every 5 seconds (30 alive maximum). Only defeat during that final wave completes training. Earlier defeat retries training.
- Save tutorial completion immediately via ProfileRepository. Old v1 profiles default to incomplete without losing resources. Level definitions and completion are saved separately from transient world damage; mid-run voxel snapshots are not supported.
- Training may grant a service shortfall to prevent a soft lock; count uncollected coin pickups toward available funds. Normal levels never receive this subsidy.
- Level UI text belongs in ui/levelTexts.ts. Main-level access must be checked on launch, not just by disabling the menu button.

## Input

- Gameplay consumes only the `GameInput` contract. DesktopInput and MobileInput translate devices into movement, look deltas, held fire and one-shot commands; never emulate keyboard events from mobile UI.
- Mobile touch roles are assigned on pointer down and remain fixed until release. The left canvas half is movement only; the right half is look only. UI buttons own their pointers and must not also rotate the camera.
- Compute touch halves from `canvas.getBoundingClientRect()`, not the browser window. External letterboxing is not an input surface.
- Mobile controls support movement, look and fire simultaneously with separate pointer IDs. Reset all pointers on pause, blur, visibility change, resize, level transition and dispose.
- The mobile fire button owns a fire-look pointer: holding fires, dragging contributes camera look and moves the button within the game frame, and release/reset returns it to its anchored position.
- Interaction and purchase buttons read `Workshop.getInteractions` every frame and execute `tryInteract` / `tryPurchase`; Workshop remains the authority for range, target, cost and wave restrictions.
- FullscreenController requests the document root on the first mobile `pointerdown`, supports the WebKit-prefixed fallback, and can be retried by start/resume actions. On desktop request pointer lock before fullscreen because fullscreen consumes transient browser activation. Suppress the context menu only inside `#game-frame`.
- Keep the mobile document viewport native so browser toolbars can retract on rotation. Use `100dvh` on `#app` and suppress zoom/gestures on the game surface, not on `html/body` or via the viewport meta tag.
- Render the Babylon canvas at the device pixel ratio capped by `shooter/renderingConfig.ts`; recalculate it on resize/orientation changes so Retina screens stay sharp without unbounded GPU cost.
