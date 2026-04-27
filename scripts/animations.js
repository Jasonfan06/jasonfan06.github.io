/**
 * Animations Module
 * Handles scroll-based animations and intersection observers
 */

import { all, one } from './utils/dom.js';

/**
 * Create an intersection observer for scroll animations
 * @returns {IntersectionObserver}
 */
function createScrollObserver() {
    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    return new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optionally unobserve after animation
                // observer.unobserve(entry.target);
            }
        });
    }, options);
}

/**
 * Animate elements on scroll
 */
function observeScrollElements() {
    const observer = createScrollObserver();
    
    // Observe all sections
    const sections = all('.section-container');
    sections.forEach(section => {
        section.classList.add('animate-on-scroll');
        observer.observe(section);
    });
    
    // Observe project cards
    const projectCards = all('.project-card');
    projectCards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 0.1}s`;
        observer.observe(card);
    });
    
    // Observe experience items
    const experienceItems = all('.experience-item');
    experienceItems.forEach((item, index) => {
        item.style.transitionDelay = `${index * 0.1}s`;
        observer.observe(item);
    });
}

/**
 * Add parallax effect to scroll indicator
 */
function initScrollIndicator() {
    const scrollIndicator = one('.scroll-indicator');
    if (!scrollIndicator) return;
    
    // Hide scroll indicator after scrolling
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100 && scrollIndicator) {
            scrollIndicator.style.opacity = '0';
            scrollIndicator.style.pointerEvents = 'none';
        } else if (scrollIndicator) {
            scrollIndicator.style.opacity = '0.4';
            scrollIndicator.style.pointerEvents = 'auto';
        }
    });
    
    // Click to scroll down
    scrollIndicator.addEventListener('click', () => {
        const aboutSection = document.getElementById('about');
        if (aboutSection) {
            aboutSection.scrollIntoView({ behavior: 'smooth' });
        }
    });
}

/**
 * Add active state to navigation links based on scroll position
 */
function initActiveNavigation() {
    const sections = all('section[id], article[id]');
    const navLinks = all('.nav-link');
    
    if (sections.length === 0 || navLinks.length === 0) return;
    
    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                
                // Remove active class from all links
                navLinks.forEach(link => {
                    link.classList.remove('active');
                });
                
                // Add active class to current link
                const activeLink = one(`.nav-link[href="#${id}"]`);
                if (activeLink) {
                    activeLink.classList.add('active');
                }
            }
        });
    }, observerOptions);
    
    sections.forEach(section => observer.observe(section));
}

/**
 * Add hover effect to project tags
 */
function initTagInteractions() {
    const tags = all('.tag');
    tags.forEach(tag => {
        tag.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px) scale(1.05)';
        });

        tag.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
}

/**
 * Initialize all animations
 */
export function initAnimations() {
    observeScrollElements();
    initScrollIndicator();
    initActiveNavigation();
    initTagInteractions();
}
