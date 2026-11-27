export class RunProfile {
  private coinsValue=0;
  get coins(): number { return this.coinsValue; }
  addCoins(amount:number): void { this.coinsValue+=Math.max(0,Math.floor(amount)); }
  spendCoins(amount:number): boolean {
    if (amount<0 || this.coinsValue<amount) return false;
    this.coinsValue-=amount;
    return true;
  }
}
