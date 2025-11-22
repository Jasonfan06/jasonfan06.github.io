/**
 * Component Loader Module
 * Dynamically loads HTML components into the page
 */

const components = [
    { id: 'navigation', file: 'components/navigation.html' },
    { id: 'header-section', file: 'components/header.html' },
    { id: 'about-section', file: 'components/about.html' },
    { id: 'projects-section', file: 'components/projects.html' },
    { id: 'experience-section', file: 'components/experience.html' },
    { id: 'footer-section', file: 'components/footer.html' }
];

/**
 * Load a single component
 * @param {string} elementId - The ID of the element to load content into
 * @param {string} filePath - The path to the HTML file
 * @returns {Promise<void>}
 */
async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
        }
        const html = await response.text();
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;
        } else {
            console.warn(`Element with id "${elementId}" not found`);
        }
    } catch (error) {
        console.error(`Error loading component ${elementId}:`, error);
    }
}

/**
 * Load all components in parallel
 * @returns {Promise<void>}
 */
export async function loadComponents() {
    const loadPromises = components.map(({ id, file }) => 
        loadComponent(id, file)
    );
    
    await Promise.all(loadPromises);
}


