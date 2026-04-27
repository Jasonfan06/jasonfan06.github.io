/* ===================================
   Card Hover Effect
   =================================== */

import { all } from './utils/dom.js';

const HOVER_ANIMATION_MS = 500;

export function initCardHover() {
    // Get all cards that should have the hover effect
    const cards = all('.project-card');

    console.log(`✓ Initializing card hover for ${cards.length} cards`);

    cards.forEach(card => {
        let span;
        let isIn = true; // Default switch on
        let isOut;

        // Mouse enter event
        card.addEventListener('mouseenter', function(e) {
            isOut = false;
            if (isIn) {
                // Create span element and add to card
                span = document.createElement('span');
                span.className = 'card-hover-effect';
                card.appendChild(span);

                // Use in animation
                span.style.animation = 'cardHoverIn .5s ease-out forwards';

                // Calculate top and left values, track mouse position
                const rect = card.getBoundingClientRect();
                let top = e.clientY - rect.top;
                let left = e.clientX - rect.left;

                span.style.top = top + 'px';
                span.style.left = left + 'px';

                isIn = false;
                isOut = true;
            }
        });

        // Mouse leave event
        card.addEventListener('mouseleave', function(e) {
            if (isOut) {
                mouseleave();
            }

            function mouseleave() {
                const exitingSpan = span;
                if (!exitingSpan) return;

                span = null;
                isIn = true;
                isOut = false;

                const currentStyle = getComputedStyle(exitingSpan);
                const currentWidth = currentStyle.width;
                const currentHeight = currentStyle.height;
                exitingSpan.style.animation = 'none';
                exitingSpan.style.width = currentWidth;
                exitingSpan.style.height = currentHeight;

                // Calculate top and left values, track mouse position
                const rect = card.getBoundingClientRect();
                let top = e.clientY - rect.top;
                let left = e.clientX - rect.left;

                exitingSpan.style.top = top + 'px';
                exitingSpan.style.left = left + 'px';

                const exitAnimation = exitingSpan.animate(
                    [
                        { width: currentWidth, height: currentHeight },
                        { width: '0px', height: '0px' }
                    ],
                    {
                        duration: HOVER_ANIMATION_MS,
                        easing: 'ease-out',
                        fill: 'forwards'
                    }
                );

                // Wait for animation to end
                exitAnimation.addEventListener('finish', function() {
                    if (card.contains(exitingSpan)) {
                        card.removeChild(exitingSpan);
                    }
                }, { once: true });
            }
        });
    });
}
