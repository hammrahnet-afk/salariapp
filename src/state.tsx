import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_CONFIG, loadConfig, saveConfig, type AppConfig } from './lib/settings';
import { UNIT_LABEL } from './lib/settings';

interface AppState {
  cfg: AppConfig;
  update: (patch: Partial<AppConfig> | ((c: AppConfig) => AppConfig)) => Promise<void>;
  unit: string;
  toggleTheme: () => void;
  /** هر داده‌ای که تغییر کرد این عدد را بالا ببرید تا صفحات تازه شوند */
  version: number;
  bump: () => void;
  ready: boolean;
}

const Ctx = createContext<AppState>({
  cfg: DEFAULT_CONFIG,
  update: async () => undefined,
  unit: 'تومان',
  toggleTheme: () => undefined,
  version: 0,
  bump: () => undefined,
  ready: false,
});

export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadConfig().then((c) => {
      setCfg(c);
      applyTheme(c.theme);
      setReady(true);
    });
  }, []);

  const update = useCallback(async (patch: Partial<AppConfig> | ((c: AppConfig) => AppConfig)) => {
    const next = typeof patch === 'function' ? patch(cfg) : { ...cfg, ...patch };
    setCfg(next);
    applyTheme(next.theme);
    await saveConfig(next);
  }, [cfg]);

  const toggleTheme = useCallback(() => {
    void update((c) => ({ ...c, theme: c.theme === 'dark' ? 'light' : 'dark' }));
  }, [update]);

  const value = useMemo<AppState>(
    () => ({ cfg, update, unit: UNIT_LABEL(cfg), toggleTheme, version, bump: () => setVersion((v) => v + 1), ready }),
    [cfg, update, toggleTheme, version, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1220' : '#0d9488');
}

/** کلید میانبر برای خواندن واحد پول در قالب متن */
export const unitOf = UNIT_LABEL;
