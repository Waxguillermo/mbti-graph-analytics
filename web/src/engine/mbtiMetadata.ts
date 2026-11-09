import type { MbtiCode, MbtiGroupKey } from './types';

export interface MbtiGroupMeta {
  key: MbtiGroupKey;
  name: string;
  shortCode: 'NT' | 'NF' | 'SJ' | 'SP';
  color: string;
  softBg: string;
  borderHex: string;
  tagline: string;
}

export interface MbtiTypeMeta {
  code: MbtiCode;
  roleSlug: string;
  title: string;
  group: MbtiGroupKey;
  groupName: string;
  color: string;
  softBg: string;
  defaultGender: 'male' | 'female';
  workStyleSummary: string;
  animationUrl: string;
  avatarSvgUrl: string;
  avatarVariantSvgUrl: string;
  avatarPngUrl: string;
  sceneHeaderUrl: string;
  sceneIntroUrl: string;
}

export const MBTI_GROUPS: Record<MbtiGroupKey, MbtiGroupMeta> = {
  analysts: {
    key: 'analysts',
    name: 'Analysts',
    shortCode: 'NT',
    color: '#88619A',
    softBg: '#F5EFF8',
    borderHex: '#DFCFEA',
    tagline: 'Rational, systems-oriented problem solvers driven by abstraction and strategy.',
  },
  diplomats: {
    key: 'diplomats',
    name: 'Diplomats',
    shortCode: 'NF',
    color: '#33A474',
    softBg: '#ECF8F3',
    borderHex: '#C5E9D9',
    tagline: 'Empathetic, vision-focused collaborators who align teams around shared meaning.',
  },
  sentinels: {
    key: 'sentinels',
    name: 'Sentinels',
    shortCode: 'SJ',
    color: '#4298B4',
    softBg: '#EDF6F9',
    borderHex: '#C7E3ED',
    tagline: 'Structured, dependable executors who anchor timelines, quality, and follow-through.',
  },
  explorers: {
    key: 'explorers',
    name: 'Explorers',
    shortCode: 'SP',
    color: '#D99B26',
    softBg: '#FDF6E7',
    borderHex: '#F3DFB3',
    tagline: 'Adaptable, hands-on iterators who thrive under rapid prototyping and change.',
  },
};

interface RawTypeSpec {
  code: MbtiCode;
  roleSlug: string;
  title: string;
  group: MbtiGroupKey;
  defaultGender: 'male' | 'female';
  workStyleSummary: string;
}

const RAW_TYPES: RawTypeSpec[] = [
  {
    code: 'INTJ',
    roleSlug: 'architect',
    title: 'Architect',
    group: 'analysts',
    defaultGender: 'male',
    workStyleSummary: 'Strategic systems thinker with long-range architectural focus and structured execution.',
  },
  {
    code: 'INTP',
    roleSlug: 'logician',
    title: 'Logician',
    group: 'analysts',
    defaultGender: 'female',
    workStyleSummary: 'Analytical first-principles explorer who Stress-tests assumptions and models.',
  },
  {
    code: 'ENTJ',
    roleSlug: 'commander',
    title: 'Commander',
    group: 'analysts',
    defaultGender: 'female',
    workStyleSummary: 'Decisive project driver who aligns ambitious scope with crisp milestones.',
  },
  {
    code: 'ENTP',
    roleSlug: 'debater',
    title: 'Debater',
    group: 'analysts',
    defaultGender: 'male',
    workStyleSummary: 'Curious challenger who generates bold reframings and rapid conceptual synthesis.',
  },
  {
    code: 'INFJ',
    roleSlug: 'advocate',
    title: 'Advocate',
    group: 'diplomats',
    defaultGender: 'male',
    workStyleSummary: 'Thoughtful synthesizer combining quiet conviction, foresight, and cohesive team care.',
  },
  {
    code: 'INFP',
    roleSlug: 'mediator',
    title: 'Mediator',
    group: 'diplomats',
    defaultGender: 'female',
    workStyleSummary: 'Reflective, open-minded collaborator bringing nuance, empathy, and creative depth.',
  },
  {
    code: 'ENFJ',
    roleSlug: 'protagonist',
    title: 'Protagonist',
    group: 'diplomats',
    defaultGender: 'male',
    workStyleSummary: 'Charismatic facilitator who bridges perspectives and keeps group momentum high.',
  },
  {
    code: 'ENFP',
    roleSlug: 'campaigner',
    title: 'Campaigner',
    group: 'diplomats',
    defaultGender: 'female',
    workStyleSummary: 'Energetic ideator who sparks creative angles and inclusive team dialogue.',
  },
  {
    code: 'ISTJ',
    roleSlug: 'logistician',
    title: 'Logistician',
    group: 'sentinels',
    defaultGender: 'male',
    workStyleSummary: 'Methodical, fact-driven anchor ensuring precision, reliability, and clean delivery.',
  },
  {
    code: 'ISFJ',
    roleSlug: 'defender',
    title: 'Defender',
    group: 'sentinels',
    defaultGender: 'female',
    workStyleSummary: 'Attentive, steady organizer who safeguards quality details and team harmony.',
  },
  {
    code: 'ESTJ',
    roleSlug: 'executive',
    title: 'Executive',
    group: 'sentinels',
    defaultGender: 'female',
    workStyleSummary: 'Pragmatic coordinator who turns ambiguous deliverables into structured workflows.',
  },
  {
    code: 'ESFJ',
    roleSlug: 'consul',
    title: 'Consul',
    group: 'sentinels',
    defaultGender: 'male',
    workStyleSummary: 'Supportive connector who keeps communication clear, organized, and responsive.',
  },
  {
    code: 'ISTP',
    roleSlug: 'virtuoso',
    title: 'Virtuoso',
    group: 'explorers',
    defaultGender: 'male',
    workStyleSummary: 'Tactical hands-on troubleshooter focused on direct, pragmatic experimentation.',
  },
  {
    code: 'ISFP',
    roleSlug: 'adventurer',
    title: 'Adventurer',
    group: 'explorers',
    defaultGender: 'female',
    workStyleSummary: 'Flexible, observant maker bringing calm adaptability and craft sensitivity.',
  },
  {
    code: 'ESTP',
    roleSlug: 'entrepreneur',
    title: 'Entrepreneur',
    group: 'explorers',
    defaultGender: 'male',
    workStyleSummary: 'Action-biased problem solver energized by fast iteration and high-stakes pitches.',
  },
  {
    code: 'ESFP',
    roleSlug: 'entertainer',
    title: 'Entertainer',
    group: 'explorers',
    defaultGender: 'female',
    workStyleSummary: 'Dynamic communicator who injects energy, spontaneity, and engaging presentation.',
  },
];

export const MBTI_TYPES: Record<MbtiCode, MbtiTypeMeta> = Object.fromEntries(
  RAW_TYPES.map((spec) => {
    const codeLower = spec.code.toLowerCase();
    const base = `${codeLower}-${spec.roleSlug}`;
    const altGender = spec.defaultGender === 'male' ? 'female' : 'male';
    const groupMeta = MBTI_GROUPS[spec.group];
    const meta: MbtiTypeMeta = {
      code: spec.code,
      roleSlug: spec.roleSlug,
      title: spec.title,
      group: spec.group,
      groupName: groupMeta.name,
      color: groupMeta.color,
      softBg: groupMeta.softBg,
      defaultGender: spec.defaultGender,
      workStyleSummary: spec.workStyleSummary.replace('Stress-tests', 'stress-tests'),
      animationUrl: `/assets/16personalities/animations/${base}.json`,
      avatarSvgUrl: `/assets/16personalities/avatars/svg/${base}-${spec.defaultGender}.svg`,
      avatarVariantSvgUrl: `/assets/16personalities/avatars/svg-variants/${base}-${altGender}.svg`,
      avatarPngUrl: `/assets/16personalities/avatars/png/${base}.png`,
      sceneHeaderUrl: `/assets/16personalities/scenes/headers/${base}-desktop1.svg`,
      sceneIntroUrl: `/assets/16personalities/scenes/introductions/${base}.svg`,
    };
    return [spec.code, meta];
  }),
) as Record<MbtiCode, MbtiTypeMeta>;

export const TRAIT_METADATA: Array<{
  key: 'E' | 'N' | 'T' | 'J' | 'A';
  name: string;
  leftPole: string;
  rightPole: string;
  compatibilityRule: string;
}> = [
  {
    key: 'E',
    name: 'Energy',
    leftPole: 'Introverted (I)',
    rightPole: 'Extraverted (E)',
    compatibilityRule: 'Complementary (1 − E)',
  },
  {
    key: 'N',
    name: 'Mind',
    leftPole: 'Observant (S)',
    rightPole: 'Intuitive (N)',
    compatibilityRule: 'Aligned (N)',
  },
  {
    key: 'T',
    name: 'Nature',
    leftPole: 'Feeling (F)',
    rightPole: 'Thinking (T)',
    compatibilityRule: 'Aligned (T)',
  },
  {
    key: 'J',
    name: 'Tactics',
    leftPole: 'Prospecting (P)',
    rightPole: 'Judging (J)',
    compatibilityRule: 'Anchored toward 65%',
  },
  {
    key: 'A',
    name: 'Identity',
    leftPole: 'Turbulent (T)',
    rightPole: 'Assertive (A)',
    compatibilityRule: 'Anchored toward 65%',
  },
];

export const LOUVAIN_CLUSTER_PALETTE = [
  {
    code: 'C1',
    defaultArchetype: 'Strategic Drivers',
    color: '#EA580C',
    fillRgba: 'rgba(234, 88, 12, 0.10)',
    borderRgba: 'rgba(234, 88, 12, 0.42)',
  },
  {
    code: 'C2',
    defaultArchetype: 'Empathetic Diplomats',
    color: '#0D9488',
    fillRgba: 'rgba(13, 148, 136, 0.10)',
    borderRgba: 'rgba(13, 148, 136, 0.42)',
  },
  {
    code: 'C3',
    defaultArchetype: 'Structured Organizers',
    color: '#0284C7',
    fillRgba: 'rgba(2, 132, 199, 0.10)',
    borderRgba: 'rgba(2, 132, 199, 0.42)',
  },
  {
    code: 'C4',
    defaultArchetype: 'Assertive Analysts',
    color: '#7C3AED',
    fillRgba: 'rgba(124, 58, 237, 0.10)',
    borderRgba: 'rgba(124, 58, 237, 0.42)',
  },
] as const;

export function formatStudentDisplayName(rawId: string): string {
  const trimmed = rawId.trim();
  if (/^S\d+$/i.test(trimmed)) {
    return `Student ${trimmed.toUpperCase()}`;
  }
  return trimmed;
}
