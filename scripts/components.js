import { COMPONENTS } from './components/manifest.js';
import { one } from './utils/dom.js';

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
        const element = one(`#${elementId}`);
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
    const loadPromises = COMPONENTS.map(({ id, file }) =>
        loadComponent(id, file)
    );

    await Promise.all(loadPromises);
}
