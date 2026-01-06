/**
 * Breadcrumbs management for overlays
 * Manages navigation history and breadcrumb display
 */

// Global breadcrumbs stack
let breadcrumbsStack = [];

/**
 * Push a breadcrumb item onto the stack
 * @param {string} label - Display label for the breadcrumb
 * @param {string} [origin] - Origin identifier (e.g., 'main', 'catalog')
 * @returns {Array} Updated breadcrumbs stack
 */
export const pushBreadcrumb = (label, origin = '') => {
  if (!label || typeof label !== 'string') {
    return breadcrumbsStack;
  }
  breadcrumbsStack.push({ label: label.trim(), origin });
  return [...breadcrumbsStack];
};

/**
 * Pop the last breadcrumb item from the stack
 * @returns {Object|null} Popped breadcrumb item or null if stack is empty
 */
export const popBreadcrumb = () => {
  if (breadcrumbsStack.length === 0) {
    return null;
  }
  return breadcrumbsStack.pop();
};

/**
 * Clear all breadcrumbs
 */
export const clearBreadcrumbs = () => {
  breadcrumbsStack = [];
};

/**
 * Get current breadcrumbs stack
 * @returns {Array} Copy of current breadcrumbs stack
 */
export const getBreadcrumbs = () => {
  return [...breadcrumbsStack];
};

/**
 * Set breadcrumbs stack (for restoring state)
 * @param {Array} stack - Array of breadcrumb items
 */
export const setBreadcrumbs = (stack = []) => {
  breadcrumbsStack = Array.isArray(stack) ? [...stack] : [];
};

