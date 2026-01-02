import { bindAngebotCatalog } from './angebotCatalog.js';
import {
  buildAngebotCatalogOverlay,
  buildAngebotCreateOverlay,
  buildAngebotEditOverlay,
  buildAngebotOverlay,
} from '../ui/components.js';
import { createTimetableSettingsView } from './timetableSettings.js';
import { getFixedAngeboteForDay, saveFixedAngeboteForDay } from '../db/dbRepository.js';
import { TIMETABLE_DAY_ORDER } from '../utils/timetable.js';

const DAY_LABEL_BY_KEY = TIMETABLE_DAY_ORDER.reduce((acc, { key, label }) => {
  acc[key] = label;
  return acc;
}, {});

const formatAssignmentTitle = ({ dayLabel, module }) => {
  const slot = module?.descriptor || module?.timeLabel || '';
  const label = dayLabel || '';
  if (slot) {
    return `Przypisz fixe Angebote do ${label}, ${slot}`;
  }
  return `Przypisz fixe Angebote do ${label}`;
};

const createFixedContextAdapter = (dayKey) => ({
  getEntry: () => {
    const { assignments, aggregated } = getFixedAngeboteForDay(dayKey);
    return { angebote: aggregated, angebotModules: assignments };
  },
  persist: (_id, patch) => {
    saveFixedAngeboteForDay(dayKey, {
      assignments: patch.angebotModules,
      angebote: patch.angebote,
    });
  },
});

const buildAssignmentOverlays = ({ angebotGroups, savedAngebotFilters }) => {
  const assignmentOverlay = buildAngebotOverlay({ angebotGroups });
  const assignmentCatalogOverlay = buildAngebotCatalogOverlay({
    angebotGroups,
    savedFilters: savedAngebotFilters,
  });
  const assignmentCreateOverlay = buildAngebotCreateOverlay({ angebotGroups });
  const assignmentEditOverlay = buildAngebotEditOverlay({ angebotGroups });

  return {
    overlays: [
      assignmentOverlay.element,
      assignmentCatalogOverlay.element,
      assignmentCreateOverlay.element,
      assignmentEditOverlay.element,
    ],
    overlay: assignmentOverlay.element,
    catalogOverlay: assignmentCatalogOverlay.element,
    createOverlay: assignmentCreateOverlay.element,
    editOverlay: assignmentEditOverlay.element,
    refs: assignmentOverlay.refs,
  };
};

export const createAngebotSettingsView = ({
  timetableLessons = [],
  timetableSchedule = {},
  timetableSubjects = [],
  timetableSubjectColors = {},
  angebotGroups = {},
  catalog = [],
  topStats = {},
  savedAngebotFilters,
} = {}) => {
  let currentCatalog = catalog || [];
  let currentTopStats = topStats || {};
  let currentGroups = angebotGroups || {};
  let currentSavedFilters = savedAngebotFilters;
  let assignmentBinding = null;

  const assignmentOverlays = buildAssignmentOverlays({
    angebotGroups,
    savedAngebotFilters,
  });

  const handleFreizeitClick = ({ dayKey, dayLabel, module, lesson }) => {
    const { modules, assignments, aggregated } = getFixedAngeboteForDay(dayKey);
    const adapter = createFixedContextAdapter(dayKey);
    const targetModuleId = module?.id || modules[0]?.id || '';
    const normalizedLabel = DAY_LABEL_BY_KEY[dayKey] || dayLabel || '';
    const titleText = formatAssignmentTitle({
      dayLabel: normalizedLabel,
      module,
    });
    if (assignmentOverlays.refs?.overlayTitle) {
      assignmentOverlays.refs.overlayTitle.textContent = titleText;
    }
    if (assignmentOverlays.overlay) {
      assignmentOverlays.overlay.dataset.activeModule = targetModuleId;
    }

    const bindingPayload = {
      date: dayKey,
      selectedAngebote: aggregated,
      catalog: currentCatalog,
      topStats: currentTopStats,
      angebotGroups: currentGroups,
      savedFilters: currentSavedFilters,
      readOnly: false,
      modules,
      moduleAssignments: assignments,
      contextAdapter: adapter,
    };

    if (!assignmentBinding) {
      assignmentBinding = bindAngebotCatalog({
        ...bindingPayload,
        overlay: assignmentOverlays.overlay,
        catalogOverlay: assignmentOverlays.catalogOverlay,
        createOverlay: assignmentOverlays.createOverlay,
        editOverlay: assignmentOverlays.editOverlay,
      });
    } else {
      assignmentBinding.update(bindingPayload);
    }

    if (assignmentBinding?.open) {
      assignmentBinding.open();
    } else if (assignmentOverlays.overlay) {
      assignmentOverlays.overlay.classList.add('is-open');
      assignmentOverlays.overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('observation-overlay-open');
    }
  };

  const timetableView = createTimetableSettingsView(
    {
      subjects: timetableSubjects,
      subjectColors: timetableSubjectColors,
      lessons: timetableLessons,
      schedule: timetableSchedule,
    },
    {
      freizeitHint: 'Klicke auf Freizeit, um fixe Angebote hinzuzufügen.',
      onFreizeitClick: handleFreizeitClick,
    },
  );

  const update = ({
    timetableLessons: nextLessons = timetableLessons,
    timetableSchedule: nextSchedule = timetableSchedule,
    timetableSubjects: nextSubjects = timetableSubjects,
    timetableSubjectColors: nextSubjectColors = timetableSubjectColors,
    angebotGroups: nextGroups = currentGroups,
    catalog: nextCatalog = currentCatalog,
    topStats: nextStats = currentTopStats,
    savedAngebotFilters: nextFilters = currentSavedFilters,
  } = {}) => {
    timetableLessons = nextLessons;
    timetableSchedule = nextSchedule;
    timetableSubjects = nextSubjects;
    timetableSubjectColors = nextSubjectColors;
    currentGroups = nextGroups || {};
    currentCatalog = nextCatalog || [];
    currentTopStats = nextStats || {};
    currentSavedFilters = nextFilters;
    timetableView.update({
      subjects: timetableSubjects,
      subjectColors: timetableSubjectColors,
      lessons: timetableLessons,
      schedule: timetableSchedule,
    });
  };

  return {
    element: timetableView.element,
    overlays: assignmentOverlays.overlays,
    open: timetableView.open,
    close: timetableView.close,
    update,
  };
};
