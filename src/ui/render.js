import { todayYmd } from '../utils/date.js';
import { getFreeDayInfo, isFreeDay } from '../utils/freeDays.js';
import { clearElement } from './dom.js';
import {
  buildHeader,
  buildDrawerShell,
  buildDrawerContent,
  buildAngebotSection,
  buildAngebotOverlay,
  buildAngebotCatalogOverlay,
  buildAngebotCreateOverlay,
  buildAngebotEditOverlay,
  buildAngebotDetailOverlay,
  buildAngebotDeleteConfirm,
  buildMainTabsSection,
  buildEntlassungSection,
  buildObservationsSection,
  buildObservationCatalogOverlay,
  buildObservationCreateOverlay,
  buildObservationDeleteConfirm,
  buildObservationEditOverlay,
} from './components.js';
import { UI_LABELS } from './labels.js';
import {
  normalizeCourses,
  normalizeEntlassung,
  normalizeWeekThemeAssignments,
} from '../db/dbSchema.js';
import { formatDisplayDate, getSchoolWeeks } from '../utils/schoolWeeks.js';
import { getTimetableDayKey } from '../utils/angebotModules.js';
import { bindDateEntry } from '../features/dateEntry.js';
import { bindAngebot } from '../features/angebot.js';
import { bindAngebotCatalog } from '../features/angebotCatalog.js';
import { bindObservationCatalog, bindObservations } from '../features/observations.js';
import { bindImportExport } from '../features/importExport.js';
import { bindDrawerSections } from '../features/drawerSections.js';
import { bindEntlassungControl, getEntlassungStatus } from '../features/entlassungControl.js';
import { bindEntlassungAusnahmen } from '../features/entlassungAusnahmen.js';
import { createWeeklyTableView } from '../features/weeklyTable.js';
import { createClassSettingsView } from '../features/classSettings.js';
import { createFreeDaysSettingsView } from '../features/freeDaysSettings.js';
import { bindDummyDataLoader } from '../features/dummyData.js';
import { createTimetableSettingsView } from '../features/timetableSettings.js';
import { createGeldsammlungenView } from '../features/geldsammlungen.js';
import {
  getFreizeitModulesForDate,
  normalizeModuleAssignments,
} from '../utils/angebotModules.js';
import { normalizeObservationNoteList } from '../utils/observationNotes.js';

const pad = (value) => String(value).padStart(2, '0');

const toUtcDate = (ymd) => {
  if (typeof ymd !== 'string') {
    return null;
  }
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatYmd = (date) => {
  if (!(date instanceof Date)) {
    return '';
  }
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}-${month}-${day}`;
};

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const parseWeekStartFromId = (weekId) => {
  if (typeof weekId !== 'string') {
    return '';
  }
  const match = weekId.trim().match(/(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : '';
};

const getWeekThemeDateKeys = (weekThemes) => {
  const assignments = normalizeWeekThemeAssignments(weekThemes);
  const keys = [];
  Object.keys(assignments).forEach((weekId) => {
    const startYmd = parseWeekStartFromId(weekId);
    const startDate = toUtcDate(startYmd);
    if (!startDate) {
      return;
    }
    for (let offset = 0; offset < 5; offset += 1) {
      keys.push(formatYmd(addUtcDays(startDate, offset)));
    }
  });
  return keys;
};

const buildDaysIndex = (dateKeys, days) =>
  dateKeys.reduce((acc, key) => {
    acc[key] = days?.[key] || {};
    return acc;
  }, {});

const resolveWeekThemeForDate = (selectedDate, days, weekThemes) => {
  const assignments = normalizeWeekThemeAssignments(weekThemes);
  const dateKeys = new Set([
    ...Object.keys(days || {}),
    ...getWeekThemeDateKeys(assignments),
  ]);
  if (!dateKeys.size) {
    return { theme: '', weekLabel: '' };
  }
  const schoolYears = getSchoolWeeks(buildDaysIndex([...dateKeys], days));
  const matchingWeek = schoolYears
    .flatMap((year) => year.weeks || [])
    .find((week) => week.startYmd <= selectedDate && week.endYmd >= selectedDate);
  if (!matchingWeek) {
    return { theme: '', weekLabel: '' };
  }
  const theme = assignments[matchingWeek.id] || '';
  const weekLabel = `${matchingWeek.label} · ${formatDisplayDate(matchingWeek.startYmd)} – ${formatDisplayDate(
    matchingWeek.endYmd,
  )}`;
  return {
    theme,
    weekLabel: theme ? weekLabel : '',
  };
};

const createFallbackEntry = (date) => ({
  date,
  angebote: [],
  angebotModules: {},
  angebotNotes: '',
  observations: {},
  observationNotes: {},
  absentChildIds: [],
  notes: '',
});

const normalizeObservations = (value) => {
  if (!value) {
    return {};
  }

  if (Array.isArray(value)) {
    return value.reduce((acc, item) => {
      if (item && item.child) {
        const preset = item.preset || '';
        const tags = Array.isArray(item.tags) ? item.tags : [];
        if (preset && !tags.includes(preset)) {
          tags.push(preset);
        }
        acc[item.child] = tags;
      }
      return acc;
    }, {});
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [child, item]) => {
      if (Array.isArray(item)) {
        acc[child] = item;
        return acc;
      }
      if (typeof item === 'string') {
        acc[child] = [item];
        return acc;
      }
      const entry = item && typeof item === 'object' ? item : {};
      const preset = typeof entry.preset === 'string' ? entry.preset.trim() : '';
      const tags = Array.isArray(entry.tags) ? [...entry.tags] : [];
      if (preset && !tags.includes(preset)) {
        tags.push(preset);
      }
      acc[child] = tags;
      return acc;
    }, {});
  }

  return {};
};

const normalizeObservationNotes = (value, childrenList) => {
  const source = value && typeof value === 'object' ? value : {};
  const allowed = Array.isArray(childrenList) ? new Set(childrenList) : null;
  const result = {};
  Object.entries(source).forEach(([child, note]) => {
    if (allowed && !allowed.has(child)) {
      return;
    }
    result[child] = normalizeObservationNoteList(note);
  });
  if (allowed) {
    allowed.forEach((child) => {
      if (!(child in result)) {
        result[child] = [];
      }
    });
  }
  return result;
};

const getPreservedUiState = (root) => ({
  angebotInputValue: root.querySelector('[data-role="angebot-input"]')?.value || '',
  drawerScrollTop: root.querySelector('[data-drawer-scroll]')?.scrollTop,
});

const getSelectedDate = (state) => state?.ui?.selectedDate || todayYmd();

const getEntryForDate = (db, selectedDate) =>
  db.days?.[selectedDate] || createFallbackEntry(selectedDate);

const getSortedChildren = (children) =>
  [...children].sort((a, b) => a.localeCompare(b, 'de'));

const getAbsentChildren = (entry) =>
  Array.isArray(entry.absentChildIds) ? entry.absentChildIds : [];

const sortEntlassungSlots = (slots) => {
  slots.sort((a, b) => {
    const timeA = typeof a?.time === 'string' ? a.time : '';
    const timeB = typeof b?.time === 'string' ? b.time : '';
    if (!timeA && !timeB) {
      return 0;
    }
    if (!timeA) {
      return 1;
    }
    if (!timeB) {
      return -1;
    }
    return timeA.localeCompare(timeB);
  });
};

const TIME_STEP_MINUTES = 5;
const MIN_SONDER_MINUTES = 8 * 60;
const MAX_SONDER_MINUTES = 17 * 60 + 30;

const timeToMinutes = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes)) {
    return '';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
};

const generateTimeRange = (startMinutes, endMinutes, stepMinutes = TIME_STEP_MINUTES) => {
  const result = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += stepMinutes) {
    result.push(minutesToTime(minutes));
  }
  return result;
};

const SONDER_TIME_OPTIONS = generateTimeRange(MIN_SONDER_MINUTES, MAX_SONDER_MINUTES);

const cloneSlots = (slots) =>
  (Array.isArray(slots) ? slots : []).map((slot) => ({
    time: slot?.time || '',
    children: Array.isArray(slot?.children) ? [...slot.children] : [],
    ausnahmeChildren: Array.isArray(slot?.ausnahmeChildren) ? [...slot.ausnahmeChildren] : [],
  }));

const extractAllowedTimes = (slots) => {
  const seen = new Set();
  const result = [];
  (Array.isArray(slots) ? slots : []).forEach((slot) => {
    const time = typeof slot?.time === 'string' ? slot.time : '';
    const minutes = timeToMinutes(time);
    if (minutes === null || seen.has(time)) {
      return;
    }
    seen.add(time);
    result.push(time);
  });
  return result.sort((a, b) => {
    const minutesA = timeToMinutes(a);
    const minutesB = timeToMinutes(b);
    if (minutesA === null && minutesB === null) {
      return 0;
    }
    if (minutesA === null) {
      return 1;
    }
    if (minutesB === null) {
      return -1;
    }
    return minutesA - minutesB;
  });
};

const applyAusnahmenToSlots = (baseSlots, ausnahmenForDate) => {
  const slots = cloneSlots(baseSlots);
  const slotsByTime = new Map();
  slots.forEach((slot) => {
    if (slot.time) {
      slotsByTime.set(slot.time, slot);
    }
  });

  const removeChildFromSlots = (child) => {
    slots.forEach((slot) => {
      if (!Array.isArray(slot.children)) {
        slot.children = [];
        return;
      }
      slot.children = slot.children.filter((name) => name !== child);
      if (Array.isArray(slot.ausnahmeChildren)) {
        slot.ausnahmeChildren = slot.ausnahmeChildren.filter((name) => name !== child);
      }
    });
  };

  (Array.isArray(ausnahmenForDate) ? ausnahmenForDate : []).forEach((ausnahme) => {
    const child = ausnahme?.child;
    const time = ausnahme?.time;
    if (!child || !time) {
      return;
    }
    removeChildFromSlots(child);
    let slot = slotsByTime.get(time);
    if (!slot) {
      slot = { time, children: [], ausnahmeChildren: [] };
      slots.push(slot);
      slotsByTime.set(time, slot);
    }
    if (!slot.children.includes(child)) {
      slot.children.push(child);
    }
    if (!slot.ausnahmeChildren.includes(child)) {
      slot.ausnahmeChildren.push(child);
    }
  });

  sortEntlassungSlots(slots);
  return slots;
};

const getEntlassungForDate = (entlassung, selectedDate, children) => {
  const normalized = normalizeEntlassung(entlassung, children);
  const ausnahmenForDate = normalized.ausnahmen.filter((entry) => entry?.date === selectedDate);
  const sortedAusnahmen = [...ausnahmenForDate].sort((a, b) => {
    const minutesA = timeToMinutes(a?.time) ?? Number.POSITIVE_INFINITY;
    const minutesB = timeToMinutes(b?.time) ?? Number.POSITIVE_INFINITY;
    if (minutesA !== minutesB) {
      return minutesA - minutesB;
    }
    const childA = typeof a?.child === 'string' ? a.child : '';
    const childB = typeof b?.child === 'string' ? b.child : '';
    return childA.localeCompare(childB, 'de');
  });
  const specialEntry = normalized.special.find((entry) => entry?.date === selectedDate);
  if (specialEntry) {
    const baseSlots = Array.isArray(specialEntry?.times) ? specialEntry.times : [];
    const allowedTimes = extractAllowedTimes(baseSlots);
    const slots = applyAusnahmenToSlots(baseSlots, sortedAusnahmen);
    return {
      label: 'Sonderentlassung',
      slots,
      allowedTimes,
      sonderTimes: SONDER_TIME_OPTIONS,
      ausnahmenForDate: sortedAusnahmen,
    };
  }

  const dayKey = getTimetableDayKey(selectedDate);
  const baseSlots = dayKey && Array.isArray(normalized.regular?.[dayKey])
    ? normalized.regular[dayKey]
    : [];
  const allowedTimes = extractAllowedTimes(baseSlots);
  const slots = applyAusnahmenToSlots(baseSlots, sortedAusnahmen);
  return {
    label: 'Ordentliche Entlassung',
    slots,
    allowedTimes,
    sonderTimes: SONDER_TIME_OPTIONS,
    ausnahmenForDate: sortedAusnahmen,
  };
};

const getCourseIconsForDate = (courses, selectedDate, children) => {
  const normalized = normalizeCourses(courses, children);
  const dayKey = getTimetableDayKey(selectedDate);
  if (!dayKey) {
    return new Map();
  }
  const result = new Map();
  normalized.forEach((course) => {
    if (!course || course.day !== dayKey || !course.icon || !course.name) {
      return;
    }
    const childList = Array.isArray(course.children) ? course.children : [];
    childList.forEach((child) => {
      if (!result.has(child)) {
        result.set(child, new Set());
      }
      result.get(child).add(course.icon);
    });
  });
  const output = new Map();
  result.forEach((icons, child) => {
    output.set(child, Array.from(icons));
  });
  return output;
};

let drawerShell = null;
let appShell = null;
let observationsBinding = null;
let weeklyTableViewBinding = null;
let classSettingsView = null;
let freeDaysSettingsView = null;
let angebotBinding = null;
let timetableSettingsView = null;
let entlassungBinding = null;
let entlassungAusnahmenBinding = null;
let angebotOverlayView = null;
let angebotCatalogView = null;
let angebotCatalogBinding = null;
let angebotCreateOverlay = null;
let angebotEditOverlay = null;
let angebotManageOverlayView = null;
let angebotDetailOverlayView = null;
let angebotDeleteConfirmView = null;
let angebotOpenButtonRef = null;
let angebotOpenListenerAttached = false;
let observationCatalogOverlayView = null;
let observationCatalogBinding = null;
let observationCatalogCreateOverlay = null;
let observationCatalogEditOverlay = null;
let observationDeleteConfirmView = null;
let geldsammlungenView = null;

const closeDrawer = () => {
  const closeButton = drawerShell?.refs?.closeButton;
  if (closeButton) {
    closeButton.click();
    return;
  }
  const drawerEl = document.getElementById('mainDrawer');
  if (!drawerEl) {
    return;
  }
  drawerEl.classList.remove('show');
  drawerEl.setAttribute('aria-hidden', 'true');
};

const renderDrawerContent = (
  state,
  drawerBody,
  preservedScrollTop,
  options = {},
) => {
  if (!drawerBody) {
    return null;
  }

  const scrollTop =
    typeof preservedScrollTop === 'number' ? preservedScrollTop : drawerBody.scrollTop;
  const content = buildDrawerContent({
    ...options,
  });

  drawerBody.replaceChildren(...content.nodes);

  requestAnimationFrame(() => {
    drawerBody.scrollTop = scrollTop;
  });

  return content.refs;
};

export const renderApp = (root, state) => {
  if (!root) {
    return;
  }

  const selectedDate = getSelectedDate(state);
  const db = state?.db || {};
  const entry = getEntryForDate(db, selectedDate);
  const children = db.children || [];
  const sortedChildren = getSortedChildren(children);
  const classProfile = db.classProfile || {};
  const freeDays = db.settings?.freeDays || [];
  const freeDayInfo = getFreeDayInfo(selectedDate, freeDays);
  const isReadOnlyDay = isFreeDay(selectedDate, freeDays);

  const absentChildren = getAbsentChildren(entry);
  const observations = normalizeObservations(entry.observations);
  const observationNotes = normalizeObservationNotes(entry.observationNotes, sortedChildren);
  const angebotePresets = db.angebote || [];
  const observationPresets = db.observationTemplates || [];
  const angebotCatalog = db.angebotCatalog || [];
  const weekThemes = db.themaDerWoche || {};
  const angebotStats = db.angebotStats || {};
  const observationStats = db.observationStats || {};
  const observationCatalog = db.observationCatalog || [];
  const observationGroups = db.observationGroups || {};
  const angebotGroups = Object.fromEntries(
    Object.entries(observationGroups || {}).filter(([code]) => code !== 'SCHWARZ'),
  );
  const timetableSubjects = db.timetableSubjects || [];
  const timetableLessons = db.timetableLessons || [];
  const timetableSchedule = db.timetableSchedule || {};
  const timetableSubjectColors = db.timetableSubjectColors || {};
  const geldsammlungen = db.geldsammlungen || [];
  const savedAngebotFilters = state?.ui?.overlay?.savedAngebotFilters;
  const savedObsFilters = state?.ui?.overlay?.savedObsFilters;
  const weeklyDays = db.days || {};
  const hasData =
    sortedChildren.length > 0 ||
    Object.keys(weeklyDays || {}).length > 0;

  const preservedUi = getPreservedUiState(root);

  const header = buildHeader({
    selectedDate,
    showInitialActions: !hasData,
    showExport: hasData,
    freeDayInfo,
  });
  const selectedAngebote = Array.isArray(entry.angebote) ? entry.angebote : [];
  const angebotNote = typeof entry.angebotNotes === 'string' ? entry.angebotNotes : '';
  const freizeitModules = getFreizeitModulesForDate(
    selectedDate,
    timetableSchedule,
    timetableLessons,
  );
  const angebotModules = normalizeModuleAssignments(
    freizeitModules,
    entry.angebotModules,
    selectedAngebote,
  );
  const weekThemeInfo = resolveWeekThemeForDate(selectedDate, weeklyDays, weekThemes);
  const angebotSection = buildAngebotSection({
    angebote: angebotePresets,
    selectedAngebote,
    newValue: preservedUi.angebotInputValue,
    readOnly: isReadOnlyDay,
    freizeitModules,
    angebotModules,
    angebotNote,
    weekTheme: weekThemeInfo.theme,
    weekThemeWeekLabel: weekThemeInfo.weekLabel,
  });
  angebotOpenButtonRef = angebotSection.refs.openButton || null;
  const entlassungInfo = getEntlassungForDate(
    classProfile?.entlassung,
    selectedDate,
    sortedChildren,
  );
  const entlassungStatus = getEntlassungStatus(selectedDate);
  const courseIconsByChild = getCourseIconsForDate(
    classProfile?.courses,
    selectedDate,
    sortedChildren,
  );
  const observationsSection = appShell?.observationsView
    ? appShell.observationsView
    : buildObservationsSection({
        children: sortedChildren,
        observations,
        observationNotes,
        presets: observationPresets,
        observationStats,
        absentChildren,
        observationCatalog,
        observationGroups,
        savedObsFilters,
        readOnly: isReadOnlyDay,
        freeDayInfo,
    });
  const entlassungSection = appShell?.entlassungView
    ? appShell.entlassungView
    : buildEntlassungSection({
        entlassungLabel: entlassungInfo.label,
        slots: entlassungInfo.slots,
        absentChildren,
        statusSet: entlassungStatus,
        courseIconsByChild,
        children: sortedChildren,
        ausnahmenForDate: entlassungInfo.ausnahmenForDate,
        allowedTimes: entlassungInfo.allowedTimes,
        sonderTimes: entlassungInfo.sonderTimes,
        readOnly: isReadOnlyDay,
        freeDayInfo,
      });
  if (!angebotOverlayView) {
    angebotOverlayView = buildAngebotOverlay({ angebotGroups });
  }
  if (!angebotCatalogView) {
    angebotCatalogView = buildAngebotCatalogOverlay({
      angebotGroups,
      savedFilters: savedAngebotFilters,
    });
  }
  if (!angebotManageOverlayView) {
    angebotManageOverlayView = buildAngebotCatalogOverlay({
      angebotGroups,
      savedFilters: savedAngebotFilters,
      title: UI_LABELS.angebotManage,
      role: 'angebot-manage-overlay',
      closeRole: 'angebot-manage-close',
      searchAriaLabel: `${UI_LABELS.angebotManage} durchsuchen`,
      showCreateButton: true,
      createButtonLabel: UI_LABELS.angebotCreate,
      createButtonRole: 'angebot-manage-create-open',
      manageTabs: true,
      weekThemeLabel: UI_LABELS.themaDerWoche,
    });
  }
  if (!angebotCreateOverlay) {
    angebotCreateOverlay = buildAngebotCreateOverlay({ angebotGroups });
  }
  if (!angebotEditOverlay) {
    angebotEditOverlay = buildAngebotEditOverlay({ angebotGroups });
  }
  if (!angebotDetailOverlayView) {
    angebotDetailOverlayView = buildAngebotDetailOverlay({ angebotGroups });
  }
  if (!angebotDeleteConfirmView) {
    angebotDeleteConfirmView = buildAngebotDeleteConfirm();
  }
  if (!observationCatalogOverlayView) {
    observationCatalogOverlayView = buildObservationCatalogOverlay({
      observationCatalog,
      observationGroups,
      savedFilters: savedObsFilters,
    });
  }
  if (!observationCatalogCreateOverlay) {
    observationCatalogCreateOverlay = buildObservationCreateOverlay({
      observationGroups,
    });
  }
  if (!observationCatalogEditOverlay) {
    observationCatalogEditOverlay = buildObservationEditOverlay({
      observationGroups,
      showDeleteButton: true,
      className: 'observation-edit-overlay observation-edit-overlay--global',
    });
  }
  if (!observationDeleteConfirmView) {
    observationDeleteConfirmView = buildObservationDeleteConfirm();
  }
  if (!weeklyTableViewBinding) {
    weeklyTableViewBinding = createWeeklyTableView({
      days: weeklyDays,
      children: sortedChildren,
      angebotCatalog,
      angebotGroups,
      observationCatalog,
      observationGroups,
      freeDays,
      timetableSchedule,
      timetableLessons,
      classProfile,
      weekThemes,
    });
  } else {
    weeklyTableViewBinding.update({
      days: weeklyDays,
      children: sortedChildren,
      angebotCatalog,
      angebotGroups,
      observationCatalog,
      observationGroups,
      freeDays,
      timetableSchedule,
      timetableLessons,
      classProfile,
      weekThemes,
    });
  }

  if (!classSettingsView) {
    classSettingsView = createClassSettingsView({
      profile: classProfile,
      children: sortedChildren,
    });
  } else {
    classSettingsView.update({
      profile: classProfile,
      children: sortedChildren,
    });
  }

  if (!freeDaysSettingsView) {
    freeDaysSettingsView = createFreeDaysSettingsView({
      freeDays,
    });
  } else {
    freeDaysSettingsView.update({ freeDays });
  }

  if (!timetableSettingsView) {
    timetableSettingsView = createTimetableSettingsView({
      subjects: timetableSubjects,
      lessons: timetableLessons,
      schedule: timetableSchedule,
      subjectColors: timetableSubjectColors,
    });
  } else {
    timetableSettingsView.update({
      subjects: timetableSubjects,
      lessons: timetableLessons,
      schedule: timetableSchedule,
      subjectColors: timetableSubjectColors,
    });
  }

  if (!geldsammlungenView) {
    geldsammlungenView = createGeldsammlungenView({
      geldsammlungen,
      children: sortedChildren,
    });
  } else {
    geldsammlungenView.update({
      geldsammlungen,
      children: sortedChildren,
    });
  }

  if (!drawerShell) {
    drawerShell = buildDrawerShell();
  }

  const drawerContentRefs = renderDrawerContent(
    state,
    drawerShell.refs.body,
    preservedUi.drawerScrollTop,
    {
      showExport: hasData,
      showDummy: !hasData,
      showWeekly: hasData,
    },
  );

  if (!appShell) {
    clearElement(root);
    const container = document.createElement('div');
    container.className = 'app';
    const contentWrap = document.createElement('div');
    contentWrap.className = 'container d-flex flex-column gap-3';
    const mainTabs = buildMainTabsSection({
      angebotSection: angebotSection.element,
      observationsSection: observationsSection.element,
      entlassungSection: entlassungSection.element,
    });
    contentWrap.append(header.element, mainTabs.element);

    container.append(
      contentWrap,
      drawerShell.element,
      weeklyTableViewBinding.element,
      classSettingsView.element,
      freeDaysSettingsView.element,
      timetableSettingsView.element,
      geldsammlungenView.element,
      angebotOverlayView.element,
      angebotCatalogView.element,
      angebotManageOverlayView.element,
      angebotCreateOverlay.element,
      angebotEditOverlay.element,
      angebotDetailOverlayView.element,
      angebotDeleteConfirmView.element,
      observationCatalogOverlayView.element,
      observationCatalogCreateOverlay.element,
      observationCatalogEditOverlay.element,
      observationDeleteConfirmView.element,
    );
    root.appendChild(container);

    bindDateEntry({
      input: header.refs.dateInput,
      prevButton: header.refs.prevDateButton,
      nextButton: header.refs.nextDateButton,
    });
    const actions = drawerContentRefs?.actions;
    bindImportExport({
      exportButton: header.refs.exportButton,
      importButton: header.refs.importButton,
      fileInput: header.refs.importInput,
    });
    bindImportExport({
      exportButton: actions?.exportButton,
      importButton: actions?.importButton,
      fileInput: actions?.importInput,
    });
    const settingsActions = drawerContentRefs?.settings;
    bindDummyDataLoader({
      button: actions?.dummyDataButton,
      onLoaded: closeDrawer,
    });
    bindDummyDataLoader({
      button: header.refs.dummyDataButton,
      onLoaded: closeDrawer,
    });
    if (weeklyTableViewBinding && actions?.weeklyTableButton) {
      actions.weeklyTableButton.addEventListener('click', () => {
        weeklyTableViewBinding.open();
      });
    }
    if (classSettingsView && settingsActions?.classButton) {
      settingsActions.classButton.addEventListener('click', () => {
        closeDrawer();
        classSettingsView.open();
      });
    }
    if (freeDaysSettingsView && settingsActions?.freeDaysButton) {
      settingsActions.freeDaysButton.addEventListener('click', () => {
        closeDrawer();
        freeDaysSettingsView.open();
      });
    }
    if (timetableSettingsView && settingsActions?.timetableButton) {
      settingsActions.timetableButton.addEventListener('click', () => {
        closeDrawer();
        timetableSettingsView.open();
      });
    }
    if (geldsammlungenView && settingsActions?.geldsammlungenButton) {
      settingsActions.geldsammlungenButton.addEventListener('click', () => {
        closeDrawer();
        geldsammlungenView.open();
      });
    }
    angebotBinding = bindAngebot({
      selectedList: angebotSection.refs.selectedList,
      date: selectedDate,
      readOnly: isReadOnlyDay,
    });
    angebotCatalogBinding = bindAngebotCatalog({
      openButton: angebotSection.refs.openButton,
      manageOpenButton: settingsActions?.angebotManageButton,
      overlay: angebotOverlayView.element,
      catalogOverlay: angebotCatalogView.element,
      manageOverlay: angebotManageOverlayView.element,
      createOverlay: angebotCreateOverlay.element,
      editOverlay: angebotEditOverlay.element,
      detailOverlay: angebotDetailOverlayView.element,
      deleteConfirmOverlay: angebotDeleteConfirmView.element,
      date: selectedDate,
      days: weeklyDays,
      freeDays,
      weekThemes,
      angebotGroups,
      selectedAngebote,
      angebotNote,
      modules: freizeitModules,
      moduleAssignments: angebotModules,
      catalog: angebotCatalog,
      topStats: angebotStats,
      savedFilters: savedAngebotFilters,
      readOnly: isReadOnlyDay,
    });
    observationsBinding = bindObservations({
      list: observationsSection.refs.list,
      overlay: observationsSection.refs.overlay,
      overlayPanel: observationsSection.refs.overlayPanel,
      overlayContent: observationsSection.refs.overlayContent,
      overlayTitle: observationsSection.refs.overlayTitle,
      closeButton: observationsSection.refs.closeButton,
      templatesOverlay: observationsSection.refs.templatesOverlay,
      multiObservationButton: observationsSection.refs.multiObservationButton,
      multiTemplatesOverlay: observationsSection.refs.multiTemplatesOverlay,
      assignOverlay: observationsSection.refs.assignOverlay,
      editOverlay: observationsSection.refs.editOverlay,
      createOverlay: observationsSection.refs.createOverlay,
      noteDeleteConfirmOverlay: observationsSection.refs.noteDeleteConfirmOverlay,
      date: selectedDate,
      observationGroups,
      savedFilters: savedObsFilters,
      readOnly: isReadOnlyDay,
    });
    observationCatalogBinding = bindObservationCatalog({
      openButton: settingsActions?.observationCatalogButton,
      overlay: observationCatalogOverlayView.element,
      createOverlay: observationCatalogCreateOverlay.element,
      editOverlay: observationCatalogEditOverlay.element,
      deleteConfirmOverlay: observationDeleteConfirmView.element,
      observationGroups,
      catalog: observationCatalog,
      savedFilters: savedObsFilters,
    });
    entlassungBinding = bindEntlassungControl({
      container: entlassungSection.element,
      selectedDate,
    });
    entlassungAusnahmenBinding = bindEntlassungAusnahmen({
      container: entlassungSection.element,
      entlassungView: entlassungSection,
      selectedDate,
      children: sortedChildren,
      entlassungInfo,
      readOnly: isReadOnlyDay,
    });

    bindDrawerSections(drawerContentRefs?.sections);

    appShell = {
      container,
      contentWrap,
      headerEl: header.element,
      angebotEl: angebotSection.element,
      observationsView: observationsSection,
      entlassungView: entlassungSection,
      mainTabsEl: mainTabs.element,
      mainTabsView: mainTabs,
    };
    if (!angebotOpenListenerAttached) {
      window.addEventListener('freilog:angebot-open', () => {
        if (angebotOpenButtonRef instanceof HTMLElement && !angebotOpenButtonRef.disabled) {
          angebotOpenButtonRef.click();
        }
      });
      angebotOpenListenerAttached = true;
    }
    return;
  }

  appShell.headerEl.replaceWith(header.element);
  appShell.headerEl = header.element;
  bindDateEntry({
    input: header.refs.dateInput,
    prevButton: header.refs.prevDateButton,
    nextButton: header.refs.nextDateButton,
  });

  if (appShell.mainTabsView?.refs?.angebotPane) {
    const angebotPane = appShell.mainTabsView.refs.angebotPane;
    const shouldReplaceAngebotPane =
      angebotPane.childElementCount !== 1 ||
      angebotPane.firstElementChild !== angebotSection.element;
    if (shouldReplaceAngebotPane) {
      angebotPane.replaceChildren(angebotSection.element);
    }
  }
  const shouldReplaceContentWrap =
    appShell.contentWrap.childElementCount !== 2 ||
    appShell.contentWrap.firstElementChild !== appShell.headerEl ||
    appShell.contentWrap.lastElementChild !== appShell.mainTabsEl;
  if (shouldReplaceContentWrap) {
    appShell.contentWrap.replaceChildren(appShell.headerEl, appShell.mainTabsEl);
  }

  appShell.observationsView.update({
    nextChildren: sortedChildren,
    nextObservations: observations,
    nextObservationNotes: observationNotes,
    nextObservationStats: observationStats,
    nextAbsentChildren: absentChildren,
    nextObservationCatalog: observationCatalog,
    nextObservationGroups: observationGroups,
    nextObservationPresets: observationPresets,
    nextSavedObsFilters: savedObsFilters,
    readOnly: isReadOnlyDay,
    freeDayInfo,
  });
  if (appShell.entlassungView?.update) {
    appShell.entlassungView.update({
      nextLabel: entlassungInfo.label,
      nextSlots: entlassungInfo.slots,
      nextAbsentChildren: absentChildren,
      nextStatusSet: entlassungStatus,
      nextCourseIconsByChild: courseIconsByChild,
      nextChildren: sortedChildren,
      nextAusnahmenForDate: entlassungInfo.ausnahmenForDate,
      nextAllowedTimes: entlassungInfo.allowedTimes,
      nextSonderTimes: entlassungInfo.sonderTimes,
      nextReadOnly: isReadOnlyDay,
      nextFreeDayInfo: freeDayInfo,
    });
  }

  if (observationsBinding?.updateDate) {
    observationsBinding.updateDate(selectedDate);
  }
  if (observationsBinding?.updateReadOnly) {
    observationsBinding.updateReadOnly(isReadOnlyDay);
  }
  if (entlassungBinding?.updateDate) {
    entlassungBinding.updateDate(selectedDate);
  }
  if (entlassungAusnahmenBinding?.updateDate) {
    entlassungAusnahmenBinding.updateDate(selectedDate);
  }
  if (entlassungAusnahmenBinding?.updateData) {
    entlassungAusnahmenBinding.updateData({
      children: sortedChildren,
      entlassungInfo,
      readOnly: isReadOnlyDay,
    });
  }

  const actions = drawerContentRefs?.actions;
  const settingsActions = drawerContentRefs?.settings;
  if (angebotCatalogBinding) {
    angebotCatalogBinding.update({
      date: selectedDate,
      days: weeklyDays,
      freeDays,
      weekThemes,
      selectedAngebote,
      angebotNote,
      modules: freizeitModules,
      moduleAssignments: angebotModules,
      catalog: angebotCatalog,
      topStats: angebotStats,
      angebotGroups,
      savedFilters: savedAngebotFilters,
      readOnly: isReadOnlyDay,
      openButton: angebotSection.refs.openButton,
      manageOpenButton: settingsActions?.angebotManageButton,
    });
  }

  bindImportExport({
    exportButton: header.refs.exportButton,
    importButton: header.refs.importButton,
    fileInput: header.refs.importInput,
  });
  bindImportExport({
    exportButton: actions?.exportButton,
    importButton: actions?.importButton,
    fileInput: actions?.importInput,
  });
  if (observationCatalogBinding) {
    observationCatalogBinding.update({
      catalog: observationCatalog,
      observationGroups,
      savedFilters: savedObsFilters,
      openButton: settingsActions?.observationCatalogButton,
    });
  }
  bindDummyDataLoader({
    button: actions?.dummyDataButton,
    onLoaded: closeDrawer,
  });
  bindDummyDataLoader({
    button: header.refs.dummyDataButton,
    onLoaded: closeDrawer,
  });
  if (weeklyTableViewBinding && actions?.weeklyTableButton) {
    actions.weeklyTableButton.addEventListener('click', () => {
      weeklyTableViewBinding.open();
    });
  }
  if (classSettingsView && settingsActions?.classButton) {
    settingsActions.classButton.addEventListener('click', () => {
      closeDrawer();
      classSettingsView.open();
    });
  }
  if (freeDaysSettingsView && settingsActions?.freeDaysButton) {
    settingsActions.freeDaysButton.addEventListener('click', () => {
      closeDrawer();
      freeDaysSettingsView.open();
    });
  }
  if (timetableSettingsView && settingsActions?.timetableButton) {
    settingsActions.timetableButton.addEventListener('click', () => {
      closeDrawer();
      timetableSettingsView.open();
    });
  }
  if (geldsammlungenView && settingsActions?.geldsammlungenButton) {
    settingsActions.geldsammlungenButton.addEventListener('click', () => {
      closeDrawer();
      geldsammlungenView.open();
    });
  }

  appShell.angebotEl = angebotSection.element;
  angebotOpenButtonRef = angebotSection.refs.openButton || null;
  angebotBinding = bindAngebot({
    selectedList: angebotSection.refs.selectedList,
    date: selectedDate,
    readOnly: isReadOnlyDay,
  });
  bindDrawerSections(drawerContentRefs?.sections);
};
