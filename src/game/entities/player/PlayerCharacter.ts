import { FreeCamera, TransformNode, Scene, Vector3 } from '@babylonjs/core';
import { CharacterSupportedState, PhysicsCharacterController } from '@babylonjs/core/Physics/v2/characterController';
import { WeaponSlot } from '../weapons/WeaponSlot';
import { playerConfig as config } from './config';

export class PlayerCharacter {
  readonly slot = new WeaponSlot();
  readonly camera: FreeCamera;
  readonly visibilityHeight = config.bodyHeight;
  readonly visibilityRadius = config.bodyRadius;
  health: number = config.maxHealth;
  private readonly body: TransformNode;
  private readonly controller: PhysicsCharacterController;
  private readonly gravity = new Vector3(0, -config.gravity, 0);

  constructor(scene: Scene, feetPosition: Vector3) {
    this.body = new TransformNode('player', scene);
    this.body.position.copyFrom(feetPosition);
    this.body.position.y += config.bodyHeight / 2;
    this.controller = new PhysicsCharacterController(this.body.position, {
      capsuleHeight: config.bodyHeight, capsuleRadius: config.bodyRadius
    }, scene);
    this.controller.characterStrength = config.pushStrength;
    scene.onDisposeObservable.addOnce(() => this.controller.dispose());
    this.camera = new FreeCamera('eyes', new Vector3(0, config.eyeHeight - config.bodyHeight / 2, 0), scene);
    this.camera.parent = this.body;
    this.camera.minZ = 0.04;
    this.camera.fov = 1.14;
    this.camera.inputs.clear();
  }

  look(dx: number, dy: number): void {
    this.camera.rotation.y += dx * config.mouseRadiansPerPixel;
    const pitch = this.camera.rotation.x + dy * config.mouseRadiansPerPixel;
    this.camera.rotation.x = Math.min(1.45, Math.max(-1.45, pitch));
  }

  get feet(): Vector3 { return this.body.position.subtract(new Vector3(0,config.bodyHeight/2,0)); }
  get eyes(): Vector3 { return this.feet.add(new Vector3(0,config.eyeHeight,0)); }
  takeDamage(amount: number): void { this.health=Math.max(0,this.health-amount); }

  move(strafe: number, forward: number, dt: number): void {
    if (dt <= 0) return;
    const yaw = this.camera.rotation.y;
    const step = config.runSpeed / Math.max(1, Math.hypot(strafe, forward));
    const support = this.controller.checkSupport(dt, Vector3.Down());
    const vy = support.supportedState === CharacterSupportedState.SUPPORTED
      ? 0 : this.controller.getVelocity().y + this.gravity.y * dt;
    this.controller.setVelocity(new Vector3(
      (Math.cos(yaw) * strafe + Math.sin(yaw) * forward) * step,
      vy,
      (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * step
    ));
    this.controller.integrate(dt, support, this.gravity);
    this.body.position.copyFrom(this.controller.getPosition());
  }

  fire(timeSeconds: number): boolean {
    this.camera.getViewMatrix(true);
    const ray = this.camera.getForwardRay(undefined, undefined, this.camera.globalPosition);
    return this.slot.tryFire({ aimRay: ray, timeSeconds });
  }
}
