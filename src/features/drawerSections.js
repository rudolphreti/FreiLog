import { setDrawerSectionState } from '../state/store.js';

const bindDrawerSection = (sectionKey, sectionRefs) => {
  if (!sectionRefs?.refs?.collapse) {
    return;
  }

  const { collapse } = sectionRefs.refs;
  const updateState = () => {
    setDrawerSectionState(sectionKey, collapse.classList.contains('show'));
  };

  collapse.addEventListener('shown.bs.collapse', updateState);
  collapse.addEventListener('hidden.bs.collapse', updateState);
};

export const bindDrawerSections = (sections) => {
  if (!sections) {
    return;
  }

  bindDrawerSection('actions', sections.actions);
  bindDrawerSection('angebote', sections.angebote);
  bindDrawerSection('settings', sections.settings);
};
