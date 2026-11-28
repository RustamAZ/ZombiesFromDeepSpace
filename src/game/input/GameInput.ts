export type InputCommand='interact'|'purchase'|'alternate'|'pause'|'debug';
export type LookDelta={x:number;y:number};

export abstract class GameInput {
  abstract get moveX():number;
  abstract get moveZ():number;
  abstract get firing():boolean;
  abstract setEnabled(enabled:boolean):void;
  abstract consumeLook():LookDelta;
  abstract consume(command:InputCommand):boolean;
  abstract reset():void;
  abstract dispose():void;
}
