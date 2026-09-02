import { create } from 'zustand'

export type ThemeName = 'light' | 'dark-navy' | 'dark-forest' | 'silver'

/**
 * Themes that have to be earned before they can be selected. Silver is the
 * level-12 SilverGod unlock — see utils/silverGod.ts.
 */
export const LOCKED_THEMES: readonly ThemeName[] = ['silver']

/**
 * Dark-family themes. A positive test on purpose: the old check was
 * `effectiveTheme !== 'light'`, which silently classes every new theme as dark
 * — and silver is pale, so that would pick unreadable chrome for it.
 */
export const DARK_THEMES: readonly ThemeName[] = ['dark-navy', 'dark-forest']

export const isDarkTheme = (theme: ThemeName): boolean =>
  DARK_THEMES.includes(theme)
export type UserTheme = 'auto' | ThemeName
export type ThemeMode =
  | 'lobby'
  | 'classic'
  | 'tournaments'
  | 'tournament-play'
  | 'leaderboard'
  | 'payouts'
  | 'admin'

const STORAGE_KEY = 'blokaz:theme'
const TRANSITION_MS = 180

// When userTheme is 'auto', all pages use the same base theme derived from
// the OS preference — no per-page theme switching. Light OS → light,
// dark OS → dark-navy. Users who want a specific look pick it in Settings.
const getOsTheme = (): ThemeName => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark-navy'
    : 'light'
}

/**
 * Base rotation. Earned themes are appended by `unlockedCycle()` so a locked
 * theme is never reachable by clicking the toggle.
 */
const CYCLE_ORDER: UserTheme[] = ['auto', 'light', 'dark-navy', 'dark-forest']

const isUserTheme = (value: string | null): value is UserTheme =>
  value === 'auto' ||
  value === 'light' ||
  value === 'dark-navy' ||
  value === 'dark-forest' ||
  value === 'silver'

/**
 * Which themes this player may select. Locked themes are only offered once
 * their unlock has been recorded; everything else is always available.
 *
 * Read at call time rather than cached — the unlock can land mid-session, the
 * moment a level-12 refresh comes back.
 */
export const availableThemes = (sovereign: boolean): UserTheme[] => [
  ...CYCLE_ORDER,
  ...(sovereign ? (['silver'] as UserTheme[]) : []),
]

/** A locked theme must never apply, however it got requested. */
const isSelectable = (theme: UserTheme, sovereign: boolean): boolean =>
  !LOCKED_THEMES.includes(theme as ThemeName) || sovereign

const computeInitialUserTheme = (): UserTheme => {
  if (typeof window === 'undefined') return 'auto'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isUserTheme(stored)) return stored
  return 'auto'
}

// Mode theme is now always the OS theme — page navigation no longer
// changes the active theme when the user is on 'auto'.
const getModeTheme = (_mode: ThemeMode): ThemeName => getOsTheme()

const getEffectiveTheme = (userTheme: UserTheme, modeTheme: ThemeName) =>
  userTheme === 'auto' ? modeTheme : userTheme

const applyTheme = (
  effectiveTheme: ThemeName,
  userTheme: UserTheme,
  modeTheme: ThemeName
) => {
  if (typeof window === 'undefined') return
  const html = document.documentElement
  html.classList.add('theme-transitioning')
  html.dataset.theme = effectiveTheme
  window.localStorage.setItem(STORAGE_KEY, userTheme)
  window.dispatchEvent(
    new CustomEvent('themechange', {
      detail: { theme: effectiveTheme, userTheme, modeTheme },
    })
  )
  window.setTimeout(
    () => html.classList.remove('theme-transitioning'),
    TRANSITION_MS
  )
}

interface ThemeState {
  userTheme: UserTheme
  mode: ThemeMode
  modeTheme: ThemeName
  effectiveTheme: ThemeName
  initialized: boolean
  initialize: (mode?: ThemeMode) => void
  sovereign: boolean
  setUserTheme: (theme: UserTheme) => void
  setSovereign: (sovereign: boolean) => void
  cycleTheme: () => void
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  userTheme: 'auto',
  /**
   * Whether the player has cleared level 12. Pushed in from the live level
   * state and never persisted — a stored flag would be a one-line self-grant.
   */
  sovereign: false,
  mode: 'lobby',
  modeTheme: getModeTheme('lobby'),
  effectiveTheme: 'light',
  initialized: false,

  initialize: (mode = 'lobby') => {
    const userTheme = computeInitialUserTheme()
    const modeTheme = getModeTheme(mode)
    const effectiveTheme = getEffectiveTheme(userTheme, modeTheme)
    set({
      userTheme,
      mode,
      modeTheme,
      effectiveTheme,
      initialized: true,
    })
    applyTheme(effectiveTheme, userTheme, modeTheme)

    // Keep 'auto' in sync if the user changes their OS dark/light preference
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const { userTheme: current, mode: currentMode } = useThemeStore.getState()
        if (current === 'auto') {
          const newModeTheme = getModeTheme(currentMode)
          const newEffective = getEffectiveTheme('auto', newModeTheme)
          set({ modeTheme: newModeTheme, effectiveTheme: newEffective })
          applyTheme(newEffective, 'auto', newModeTheme)
        }
      })
    }
  },

  setUserTheme: (userTheme) => {
    const { modeTheme, sovereign } = get()
    // Refuse a theme this player has not earned. Reached both from the UI and
    // from a hand-edited localStorage value on boot.
    const safe = isSelectable(userTheme, sovereign) ? userTheme : 'auto'
    const effectiveTheme = getEffectiveTheme(safe, modeTheme)
    set({ userTheme: safe, effectiveTheme })
    applyTheme(effectiveTheme, safe, modeTheme)
  },

  /**
   * Reports whether level 12 is cleared. An unlock that lands mid-session makes
   * silver selectable immediately; losing it (disconnect, server unreachable)
   * drops the player back off the theme rather than leaving it stuck on.
   */
  setSovereign: (sovereign) => {
    set({ sovereign })
    const { userTheme, modeTheme } = get()
    if (!isSelectable(userTheme, sovereign)) {
      const effectiveTheme = getEffectiveTheme('auto', modeTheme)
      set({ userTheme: 'auto', effectiveTheme })
      applyTheme(effectiveTheme, 'auto', modeTheme)
    }
  },

  cycleTheme: () => {
    const { userTheme, sovereign, setUserTheme } = get()
    // Walks the unlocked set, so a locked theme is never reachable by clicking.
    const order = availableThemes(sovereign)
    const nextTheme = order[(order.indexOf(userTheme) + 1) % order.length]
    setUserTheme(nextTheme)
  },

  setMode: (mode) => {
    const { userTheme } = get()
    const modeTheme = getModeTheme(mode)
    const effectiveTheme = getEffectiveTheme(userTheme, modeTheme)
    set({ mode, modeTheme, effectiveTheme })
    applyTheme(effectiveTheme, userTheme, modeTheme)
  },
}))

export const initializeThemeStore = (mode?: ThemeMode) => {
  const state = useThemeStore.getState()
  if (state.initialized) return
  state.initialize(mode)
}
