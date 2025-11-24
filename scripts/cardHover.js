/* ===================================
   Card Hover Effect
   =================================== */

export function initCardHover() {
    // Get all project cards and abstract boxes
    const cards = document.querySelectorAll('.project-card, .abstract');
    
    console.log(`✓ Initializing card hover for ${cards.length} cards`);
    
    cards.forEach(card => {
        let span;
        let inTime, outTime;
        let isIn = true; // Default switch on
        let isOut;
        
        // Mouse enter event
        card.addEventListener('mouseenter', function(e) {
            isOut = false;
            if (isIn) {
                inTime = new Date().getTime();
                
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
                outTime = new Date().getTime();
                let passTime = outTime - inTime;
                
                if (passTime < 500) {
                    setTimeout(mouseleave, 500 - passTime);
                } else {
                    mouseleave();
                }
            }
            
            function mouseleave() {
                span.style.animation = 'cardHoverOut .5s ease-out forwards';
                
                // Calculate top and left values, track mouse position
                const rect = card.getBoundingClientRect();
                let top = e.clientY - rect.top;
                let left = e.clientX - rect.left;
                
                span.style.top = top + 'px';
                span.style.left = left + 'px';
                
                // Wait for animation to end
                setTimeout(function() {
                    if (card.contains(span)) {
                        card.removeChild(span);
                    }
                    isIn = true;
                }, 500);
            }
        });
    });
}

