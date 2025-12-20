import { storage } from './storage.js';

let currentState = null;

export const initState = (defaults) => {
  currentState = storage.load() ?? defaults;
  return currentState;
};

export const getState = () => currentState;

export const setState = (nextState) => {
  currentState = nextState;
  storage.save(currentState);
};
