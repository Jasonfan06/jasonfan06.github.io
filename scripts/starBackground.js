/* ===================================
   Star Sky Background for Dark Mode
   =================================== */

export function initStarBackground() {
    // Create star container
    const starContainer = document.createElement('div');
    starContainer.className = 'star-background';
    document.body.insertBefore(starContainer, document.body.firstChild);
    
    // Generate stars with different sizes
    createStars(starContainer, 'small-star', 700, 1);
    createStars(starContainer, 'medium-star', 400, 2);
    createStars(starContainer, 'large-star', 100, 3);
    
    console.log('✓ Star background initialized');
}

function createStars(container, className, count, size) {
    const star = document.createElement('div');
    star.className = `star ${className}`;
    
    // Generate random star positions
    const skySize = 2000;
    const shadows = [];
    
    for (let i = 0; i < count; i++) {
        const x = Math.floor(Math.random() * skySize);
        const y = Math.floor(Math.random() * skySize);
        shadows.push(`${x}px ${y}px #fff`);
    }
    
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.boxShadow = shadows.join(', ');
    
    container.appendChild(star);
}

