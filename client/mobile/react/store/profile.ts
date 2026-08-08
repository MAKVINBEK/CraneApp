import { DEFAULT_PROFILE_SETTINGS, STORAGE_KEYS } from "@/consts";
import type { ISettingsDto, IUserDto } from "@/types";
import { create } from "zustand";

interface InitialState {
  token: string | null;
  isAuth: boolean;
  isLoading: boolean;
  user: IUserDto | null;
  settings: ISettingsDto;
  setUser: (user: IUserDto) => void;
  setToken: (token: string) => void;
  setSettings: (settings: ISettingsDto) => void;
  updateUser: (data: Partial<Omit<IUserDto, "id">>) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<InitialState>((set, get) => ({
  token: localStorage.getItem(STORAGE_KEYS.TOKEN) || "",
  user: null,
  settings: DEFAULT_PROFILE_SETTINGS,
  isAuth: false,
  isLoading: false,
  setUser: (user) => {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ user, isAuth: !!user });
  },
  setToken: (token) => {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    set({ token });
  },
  setSettings: (settings) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    set({ settings });
  },
  updateUser: (data) => {
    const user = get().user;

    if (!user) return;

    set({ user: { ...user, ...data } });
  },
  clearProfile: () => {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    set({
      user: null,
      isAuth: false,
      token: null,
      settings: DEFAULT_PROFILE_SETTINGS,
    });
  },
}));
