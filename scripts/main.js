/**
 * Main JavaScript Module
 * Handles component loading, dark mode, and smooth interactions
 */

import { loadComponents } from './components.js';
import { primeDarkMode, initDarkMode } from './darkMode.js';
import { initAnimations } from './animations.js';
import { initSmoothScroll } from './smoothScroll.js';
import { initRayTracing } from './rayTracing.js';
import { initStarBackground } from './starBackground.js';
import './themeButton.js';

/**
 * Initialize the application
 */
async function init() {
    try {
        // Apply saved theme before components mount
        primeDarkMode();
        
        // Initialize star background
        initStarBackground();
        
        // Load all HTML components
        await loadComponents();
        
        // Initialize dark mode toggle
        initDarkMode();
        
        // Initialize scroll animations
        initAnimations();
        
        // Initialize smooth scrolling
        initSmoothScroll();
        
        // Initialize ray tracing effect
        initRayTracing();
        
        console.log('✓ Site initialized successfully');
    } catch (error) {
        console.error('Error initializing site:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}


