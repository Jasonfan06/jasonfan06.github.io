/**
 * Main JavaScript Module
 * Handles component loading, dark mode, and smooth interactions
 */

import { loadComponents } from './components.js';
import { initDarkMode } from './darkMode.js';
import { initAnimations } from './animations.js';
import { initSmoothScroll } from './smoothScroll.js';

/**
 * Initialize the application
 */
async function init() {
    try {
        // Load all HTML components
        await loadComponents();
        
        // Initialize dark mode toggle
        initDarkMode();
        
        // Initialize scroll animations
        initAnimations();
        
        // Initialize smooth scrolling
        initSmoothScroll();
        
        // Update last updated date in footer
        updateLastModified();
        
        console.log('✓ Site initialized successfully');
    } catch (error) {
        console.error('Error initializing site:', error);
    }
}

/**
 * Update the last modified date in the footer
 */
function updateLastModified() {
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement) {
        const date = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        lastUpdatedElement.textContent = date.toLocaleDateString('en-US', options);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}


