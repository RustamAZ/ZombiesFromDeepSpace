import { PlayerProfile } from './PlayerProfile';
import type { PlayerProfileData } from './PlayerProfileData';

export interface ProfileRepository { load(): PlayerProfile; save(profile: PlayerProfile): void; }

export class LocalProfileRepository implements ProfileRepository {
  constructor(private readonly key='kubotseh-profile-v1') {}
  load(): PlayerProfile {
    try { const data=JSON.parse(localStorage.getItem(this.key) ?? 'null') as PlayerProfileData | null; return new PlayerProfile(data ?? undefined); }
    catch { return new PlayerProfile(); }
  }
  save(profile: PlayerProfile): void {
    try { localStorage.setItem(this.key,JSON.stringify(profile.serialize())); }
    catch(error) { console.warn('Profile could not be persisted',error); }
  }
}
