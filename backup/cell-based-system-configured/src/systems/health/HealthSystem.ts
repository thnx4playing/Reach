export type HealthState = { maxHits: number; hits: number; isDead: boolean };

export class HealthSystem {
  readonly instanceId: string;
  state: HealthState;
  private lastHitAt = 0;
  private iFramesMs = 700;

  constructor(maxHits = 5) {
    this.instanceId = Math.random().toString(36).slice(2);
    this.state = { maxHits, hits: 0, isDead: false };
  }
  get bars() {
    const { maxHits, hits } = this.state;
    const result = Math.max(0, Math.min(maxHits, maxHits - hits));
    return result;
  }

  takeDamage(n = 1) {
    if (this.state.isDead) {
      return false;
    }
    const now = Date.now();
    if (now - this.lastHitAt < this.iFramesMs) {
      return false; // invuln window
    }
    this.lastHitAt = now;
    const oldHits = this.state.hits;
    this.state.hits = Math.min(this.state.maxHits, this.state.hits + n);
    if (this.state.hits >= this.state.maxHits) this.state.isDead = true;
    return true;
  }
  heal(n = 1) {
    if (this.state.isDead) return;
    this.state.hits = Math.max(0, this.state.hits - n);
  }
  reset() { this.state = { maxHits: this.state.maxHits, hits: 0, isDead: false }; }
}
