/** Shared by movement planners and target reachability checks. Permits expire each frame. */
export class PathBuildQueue {
  private readonly waiting=new Set<object>();
  private readonly reserved=new Set<object>();
  private available=0;

  constructor(private readonly limit:number) {
    if(!Number.isInteger(limit) || limit<1)throw new RangeError('Expected a positive path build budget');
  }

  beginFrame():void {
    this.reserved.clear();
    this.available=this.limit;
    for(const owner of this.waiting) {
      this.waiting.delete(owner);
      this.reserved.add(owner);
      if(--this.available===0)break;
    }
  }

  tryAcquire(owner:object):boolean {
    if(this.reserved.delete(owner))return true;
    if(this.available>0) {
      --this.available;
      return true;
    }
    this.waiting.add(owner);
    return false;
  }

  cancel(owner:object):void {
    this.waiting.delete(owner);
    // An unused reservation simply expires; never let a newcomer skip the FIFO.
    this.reserved.delete(owner);
  }
}
