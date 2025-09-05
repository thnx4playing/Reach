export type HealthState = { maxHits: number; hits: number; isDead: boolean };

export class HealthSystem {
  readonly instanceId: string;
  state: HealthState;
  private lastHitAt = 0;
  private iFramesMs = 700;

  constructor(maxHits = 5) {
    this.instanceId = Math.random().toString(36).slice(2);
    this.state = { maxHits, hits: 0, isDead: false };
    if (__DEV__) {
      console.log('[HEALTH SYSTEM] Constructor: maxHits=', maxHits, 'state=', this.state);
    }
  }
  get bars() { 
    const result = Math.max(0, Math.min(5, 5 - this.state.hits));
    if (__DEV__) {
      console.log('[HEALTH SYSTEM] bars calculation: maxHits=', this.state.maxHits, 'hits=', this.state.hits, 'result=', result);
    }
    return result;
  }

  takeDamage(n = 1) {
    if (this.state.isDead) {
      if (__DEV__) console.log('HEALTH DEBUG: Cannot take damage - already dead');
      return false;
    }
    const now = Date.now();
    if (now - this.lastHitAt < this.iFramesMs) {
      if (__DEV__) console.log('HEALTH DEBUG: Cannot take damage - invulnerability frames active');
      return false; // invuln window
    }
    this.lastHitAt = now;
    const oldHits = this.state.hits;
    this.state.hits = Math.min(this.state.maxHits, this.state.hits + n);
    if (this.state.hits >= this.state.maxHits) this.state.isDead = true;
    
    if (__DEV__) {
      console.log(`HEALTH DEBUG: Took ${n} damage! Hits: ${oldHits} -> ${this.state.hits}, Bars: ${this.bars}, Dead: ${this.state.isDead}`);
    }
    return true;
  }
  heal(n = 1) {
    if (this.state.isDead) return;
    this.state.hits = Math.max(0, this.state.hits - n);
  }
  reset() { this.state = { maxHits: this.state.maxHits, hits: 0, isDead: false }; }
}
