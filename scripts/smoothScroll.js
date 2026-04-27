/**
 * Smooth Scroll Module
 * Handles smooth scrolling for anchor links
 */

import { all, one, parseCssNumber } from './utils/dom.js';

function getNavOffset() {
    const nav = one('.nav-container');
    if (nav) {
        return nav.getBoundingClientRect().height;
    }

    return parseCssNumber('--nav-offset', 60);
}

/**
 * Initialize smooth scrolling for navigation links
 */
export function initSmoothScroll() {
    const navLinks = all('a[href^="#"]');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');

            // Skip if it's just "#"
            if (href === '#') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                e.preventDefault();

                // Calculate offset for fixed navigation
                const navHeight = getNavOffset();
                const targetPosition = targetElement.getBoundingClientRect().top +
                                     window.pageYOffset - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Update URL without jumping
                if (history.pushState) {
                    history.pushState(null, null, href);
                }
            }
        });
    });
}
