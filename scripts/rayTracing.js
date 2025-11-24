/* ===================================
   Ray Tracing Mouse Effect
   =================================== */

export function initRayTracing() {
    // Get all project cards and abstract boxes
    const cards = document.querySelectorAll('.project-card, .abstract');
    
    console.log(`✓ Initializing ray tracing for ${cards.length} cards`);
    
    cards.forEach(card => {
        // Create a light effect overlay element
        const lightEffect = document.createElement('div');
        lightEffect.className = 'ray-tracing-light';
        card.appendChild(lightEffect);
        
        // Track mouse movement on the card
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Update CSS custom properties for the light position
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
            
            // Calculate normalized position (0 to 1)
            const normalizedX = x / rect.width;
            const normalizedY = y / rect.height;
            
            // Update light effect position
            lightEffect.style.left = `${x}px`;
            lightEffect.style.top = `${y}px`;
            lightEffect.style.opacity = '1';
        });
        
        // Hide light effect when mouse leaves
        card.addEventListener('mouseleave', () => {
            lightEffect.style.opacity = '0';
        });
        
        // Show light effect when mouse enters
        card.addEventListener('mouseenter', () => {
            lightEffect.style.opacity = '1';
        });
    });
}

