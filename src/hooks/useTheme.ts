import { useCallback, useState } from 'react'

const STORAGE_KEY = 'blokaz:theme'

export function useTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme === 'dark'
  )

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      const html = document.documentElement
      html.classList.add('theme-transitioning')
      html.dataset.theme = next ? 'dark' : 'light'
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
      setTimeout(() => html.classList.remove('theme-transitioning'), 180)
      return next
    })
  }, [])

  return { isDark, toggle }
}
