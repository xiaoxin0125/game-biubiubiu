// Fixed light theme.

const theme = 'light'

function applyLightTheme() {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

applyLightTheme()

export function useTheme() {
  return {
    theme,
    cycle: applyLightTheme,
  }
}
