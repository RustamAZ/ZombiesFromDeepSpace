export interface Requirement { readonly label:string; readonly complete:boolean; }

export class StateRequirement implements Requirement {
  constructor(readonly label:string,private readonly check:()=>boolean) {}
  get complete():boolean { return this.check(); }
}

export class RequirementGroup {
  constructor(readonly items:readonly Requirement[] = []) {}
  get complete():boolean { return this.items.every(item=>item.complete); }
}
