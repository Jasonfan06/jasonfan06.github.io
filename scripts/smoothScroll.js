/**
 * Smooth Scroll Module
 * Handles smooth scrolling for anchor links
 */

function getNavOffset() {
    const nav = document.querySelector('.nav-container');
    if (nav) {
        return nav.getBoundingClientRect().height;
    }

    const cssOffset = getComputedStyle(document.documentElement)
        .getPropertyValue('--nav-offset');
    const parsedOffset = parseFloat(cssOffset);
    return Number.isFinite(parsedOffset) ? parsedOffset : 60;
}

/**
 * Initialize smooth scrolling for navigation links
 */
export function initSmoothScroll() {
    // Wait for navigation to load
    setTimeout(() => {
        const navLinks = document.querySelectorAll('a[href^="#"]');
        
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
    }, 200);
}
