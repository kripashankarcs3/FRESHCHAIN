import { create } from 'zustand';

/**
 * Operator identity.
 *
 * Previously this was three hardcoded strings scattered across the shell,
 * Settings and the scan flow, which meant editing your bay in one place did
 * nothing anywhere else. It now lives in one store, persists per device, and
 * every surface reads from it.
 *
 * When a real auth system exists this store is the seam to swap — nothing else
 * needs to know where the identity came from.
 */

const STORAGE_KEY = 'freshchain-profile';

export interface Profile {
  name: string;
  role: string;
  node: string;
  bay: string;
  phone: string;
  /** ISO date the operator joined — drives "N days on shift". */
  joinedAt: string;
}

export const DEFAULT_PROFILE: Profile = {
  name: 'Operator',
  role: 'Floor Supervisor',
  node: 'Ghaziabad node',
  bay: 'Bay 2',
  phone: '+91 98••• ••210',
  joinedAt: '2026-06-01',
};

function readStored(): Profile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    // Merge over defaults so a profile saved by an older build that lacks a
    // newer field still loads instead of rendering undefined.
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

interface ProfileState {
  profile: Profile;
  updateProfile: (patch: Partial<Profile>) => void;
  resetProfile: () => void;
}

export const useProfile = create<ProfileState>((set, get) => ({
  profile: readStored(),

  updateProfile: (patch) => {
    const next = { ...get().profile, ...patch };
    set({ profile: next });
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private-browsing or storage-full: the in-memory profile still works
      // for this session, which is all the demo needs.
    }
  },

  resetProfile: () => {
    set({ profile: DEFAULT_PROFILE });
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* see above */
    }
  },
}));

/** "OP" — the avatar monogram, derived so it tracks a renamed operator. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
