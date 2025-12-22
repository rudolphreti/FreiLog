import { DEFAULT_TOPIC_ID, TOPICS } from '../config/topics.js';

const TOPIC_MAP = new Map(TOPICS.map((topic) => [topic.id, topic]));

export const getTopicList = () => [...TOPICS].sort((a, b) => a.sortOrder - b.sortOrder);

export const getTopicById = (id) => TOPIC_MAP.get(id) || null;

const normalizeTopicId = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return TOPIC_MAP.has(trimmed) ? trimmed : null;
};

const sortTopicIds = (topics) =>
  [...topics].sort((a, b) => {
    const orderA = TOPIC_MAP.get(a)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = TOPIC_MAP.get(b)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

export const normalizeTopicList = (value) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];

  const unique = new Set();
  source.forEach((item) => {
    const normalized = normalizeTopicId(item);
    if (normalized) {
      unique.add(normalized);
    }
  });

  if (!unique.size) {
    unique.add(DEFAULT_TOPIC_ID);
  }

  return sortTopicIds(unique);
};

export const resolvePrimaryTopic = (primaryTopic, topics) => {
  const normalizedPrimary = normalizeTopicId(primaryTopic);
  if (normalizedPrimary && topics.includes(normalizedPrimary)) {
    return normalizedPrimary;
  }
  const sorted = sortTopicIds(topics);
  return sorted[0] || DEFAULT_TOPIC_ID;
};

export const buildTopicEntry = ({ text, topics, primaryTopic } = {}) => {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedText) {
    return null;
  }

  const normalizedTopics = normalizeTopicList(topics);
  const resolvedPrimary = resolvePrimaryTopic(primaryTopic, normalizedTopics);
  const isAlarm =
    resolvedPrimary === 'alarm' || normalizedTopics.includes('alarm');

  return {
    text: normalizedText,
    topics: normalizedTopics,
    primaryTopic: resolvedPrimary,
    isAlarm,
  };
};

export const normalizeTopicEntry = (value) => {
  if (typeof value === 'string') {
    return buildTopicEntry({ text: value });
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.text === 'string') {
      return buildTopicEntry({
        text: value.text,
        topics: value.topics,
        primaryTopic: value.primaryTopic,
      });
    }
  }

  return null;
};

export const normalizeTopicEntries = (value) => {
  const items = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const entry = normalizeTopicEntry(item);
    if (!entry) {
      return;
    }
    const key = entry.text.toLocaleLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(entry);
  });

  return result;
};

export const groupEntriesByPrimaryTopic = (entries) => {
  const normalized = normalizeTopicEntries(entries);
  const groups = new Map();

  normalized.forEach((entry) => {
    const topicId = entry.primaryTopic || DEFAULT_TOPIC_ID;
    if (!groups.has(topicId)) {
      groups.set(topicId, []);
    }
    groups.get(topicId).push(entry);
  });

  const orderedTopics = getTopicList();
  return orderedTopics.map((topic) => ({
    topic,
    items: (groups.get(topic.id) || []).sort((a, b) =>
      a.text.localeCompare(b.text, 'de'),
    ),
  }));
};

export const getEntryText = (entry) => {
  if (typeof entry === 'string') {
    return entry.trim();
  }
  if (entry && typeof entry === 'object' && typeof entry.text === 'string') {
    return entry.text.trim();
  }
  return '';
};
