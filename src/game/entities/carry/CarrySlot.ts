export interface CarryItem { readonly type:string; readonly placementType:string; }

export class CarrySlot {
  private value?:CarryItem;
  get item():CarryItem|undefined { return this.value; }
  take(item:CarryItem):boolean { if (this.value) return false; this.value=item; return true; }
  release():CarryItem|undefined { const item=this.value; this.value=undefined; return item; }
}
