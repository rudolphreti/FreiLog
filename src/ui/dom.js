export const createEl = (tag, options = {}) => {
  const el = document.createElement(tag);

  if (options.className) {
    el.className = options.className;
  }

  if (options.text !== undefined) {
    el.textContent = options.text;
  }

  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        el.setAttribute(key, value);
      }
    });
  }

  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        el.dataset[key] = value;
      }
    });
  }

  if (Array.isArray(options.children)) {
    options.children.forEach((child) => {
      if (child) {
        el.appendChild(child);
      }
    });
  }

  return el;
};

export const clearElement = (el) => {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
};
