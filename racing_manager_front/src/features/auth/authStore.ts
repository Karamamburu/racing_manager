import { create } from 'zustand';

type AuthStatus = 'unknown' | 'authenticated' | 'guest';

type AuthStoreState = {
  status: AuthStatus;
  setStatus: (status: AuthStatus) => void;
};

export const useAuthStore = create<AuthStoreState>((set) => ({
  status: 'unknown',
  setStatus: (status) => set({ status }),
}));
