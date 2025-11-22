/**
 * Dark Mode Module
 * Handles dark mode toggle and persistence
 */

const DARK_MODE_KEY = 'darkMode';
const DARK_MODE_CLASS = 'latex-dark';

/**
 * Get dark mode preference from localStorage
 * @returns {boolean}
 */
function getDarkModePreference() {
    const saved = localStorage.getItem(DARK_MODE_KEY);
    if (saved !== null) {
        return saved === 'true';
    }
    
    // Check system preference
    return window.matchMedia && 
           window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Set dark mode preference in localStorage
 * @param {boolean} isDark
 */
function setDarkModePreference(isDark) {
    localStorage.setItem(DARK_MODE_KEY, isDark.toString());
}

/**
 * Apply dark mode to the document
 * @param {boolean} isDark
 */
function applyDarkMode(isDark) {
    // Remove any auto class that might interfere
    document.body.classList.remove('latex-dark-auto');
    
    if (isDark) {
        document.body.classList.add(DARK_MODE_CLASS);
    } else {
        document.body.classList.remove(DARK_MODE_CLASS);
    }
}

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
    const isDark = document.body.classList.contains(DARK_MODE_CLASS);
    const newMode = !isDark;
    
    applyDarkMode(newMode);
    setDarkModePreference(newMode);
    
    // Add a subtle animation effect
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
}

/**
 * Initialize dark mode
 */
export function initDarkMode() {
    // Apply saved preference immediately
    const isDark = getDarkModePreference();
    applyDarkMode(isDark);
    
    // Wait for the toggle button to be loaded
    setTimeout(() => {
        const toggleButton = document.getElementById('dark-mode-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', toggleDarkMode);
        }
    }, 100);
    
    // Listen for system preference changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', (e) => {
                // Only auto-switch if user hasn't set a preference
                if (localStorage.getItem(DARK_MODE_KEY) === null) {
                    applyDarkMode(e.matches);
                }
            });
    }
}

