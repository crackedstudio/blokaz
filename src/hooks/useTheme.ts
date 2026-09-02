import { isDarkTheme, useThemeStore } from '../stores/themeStore'

export function useTheme() {
  return useThemeStore((state) => ({
    userTheme: state.userTheme,
    modeTheme: state.modeTheme,
    effectiveTheme: state.effectiveTheme,
    // A positive test on the dark set, not `!== 'light'`: that older form
    // classed every non-light theme as dark, and silver is pale.
    isDark: isDarkTheme(state.effectiveTheme),
    setUserTheme: state.setUserTheme,
    cycleTheme: state.cycleTheme,
    setMode: state.setMode,
  }))
}
