export const exportState = (state) => JSON.stringify(state, null, 2);

export const importState = (raw) => JSON.parse(raw);
