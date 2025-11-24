/**
 * Dark Mode Module
 * Handles dark mode toggle and persistence
 */

const DARK_MODE_KEY = 'darkMode';
const DARK_MODE_CLASS = 'dark-theme';
let initialTheme = null;

function getSavedTheme() {
    const saved = localStorage.getItem(DARK_MODE_KEY);
    if (saved === 'dark' || saved === 'light') {
        return saved;
    }
    const prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
}

function setSavedTheme(theme) {
    localStorage.setItem(DARK_MODE_KEY, theme);
}

function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle(DARK_MODE_CLASS, isDark);
}

export function primeDarkMode() {
    initialTheme = getSavedTheme();
    window.__INITIAL_THEME = initialTheme;
    applyTheme(initialTheme);
}

export function initDarkMode() {
    if (!initialTheme) {
        primeDarkMode();
    }

    const themeButton = document.querySelector('theme-button');
    if (!themeButton) {
        console.warn('Theme toggle component not found');
        return;
    }

    const handleThemeChange = (event) => {
        const theme = event.detail === 'dark' ? 'dark' : 'light';
        applyTheme(theme);
        setSavedTheme(theme);
    };

    themeButton.addEventListener('change', handleThemeChange);

    if (typeof themeButton.setTheme === 'function') {
        themeButton.setTheme(initialTheme, false);
    } else if (!themeButton.hasAttribute('value')) {
        themeButton.setAttribute('value', initialTheme);
    }
}

