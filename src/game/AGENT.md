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
