/**
 * Definitions for the 8 community resilience components, based on the Home Front framework.
 * Each component has guiding questions used in evidence extraction and scoring.
 */

export const RESILIENCE_COMPONENTS = [
  {
    id: 'narrative',
    name_he: 'נרטיב',
    name_en: 'Narrative',
    description:
      'The ability of a shared story or interpretation of the emergency to strengthen community coping. ' +
      'The leading narrative strengthens or weakens coping. ' +
      'The official narrative is perceived as relevant, credible, and reflective of reality.',
    guiding_questions: [
      'To what extent is there a narrative of successful coping?',
      'To what extent are there many contradictory stories among the population regarding coping?',
    ],
  },
  {
    id: 'information_communication',
    name_he: 'מידע ותקשורת',
    name_en: 'Information and Communication',
    description:
      'The ability of information — content, dissemination methods, and feedback processes — ' +
      'to address community information needs and guide effective behavior. ' +
      'Information (guidance, instructions, support) is perceived as effective and meeting population needs.',
    guiding_questions: [
      'To what extent does the population perceive information — guidance, instructions, and support — as effective and meeting their needs?',
      'To what extent do information mechanisms adapted to the community\'s special characteristics exist?',
      'To what extent do information gaps remain or is misinformation (fake news) being spread?',
    ],
  },
  {
    id: 'lifesaving_behavior',
    name_he: 'התנהגות אפקטיבית להצלת חיים',
    name_en: 'Effective Life-Saving Behavior',
    description:
      'The ability to prepare in routine times and activate during emergencies community mechanisms ' +
      'that ensure effective life-saving behavior. Formal and community enforcement of protective guidelines. ' +
      'Planning and activation of personal, family, and community action plans.',
    guiding_questions: [
      'To what extent does the population act according to life-saving guidelines?',
      'To what extent does the population perceive the event as life-threatening?',
      'To what extent does the population know and understand the published guidelines?',
    ],
  },
  {
    id: 'functional_continuity',
    name_he: 'רציפות תפקודית',
    name_en: 'Functional Continuity',
    description:
      'The ability of the community to continue functioning and providing essential personal and community ' +
      'services and needs according to the situation\'s characteristics. Supply of essential goods and services, ' +
      'operation of essential workplaces and educational institutions, and minimization of damage to daily routine.',
    guiding_questions: [
      'To what extent was daily routine disrupted in the following areas: work, studies, commerce, leisure activities?',
    ],
  },
  {
    id: 'community_capital',
    name_he: 'הון ומשאבי קהילה',
    name_en: 'Community Capital and Resources',
    description:
      'The ability to maximize community resources (human, physical, and networks) with maximum coordination ' +
      'and leveraging comparative advantages of each partner. Optimal activation of community "anchor organizations" ' +
      '— local authority and community organizations.',
    guiding_questions: [
      'To what extent do mechanisms exist for effective coordination and maximization of community resources?',
      'To what extent is there willingness among the population for active action for their community?',
    ],
  },
  {
    id: 'leadership',
    name_he: 'מנהיגות',
    name_en: 'Leadership',
    description:
      'The perceived ability of formal and informal leadership (religious figures, spiritual leaders, ' +
      'community influencers) to lead, address community needs, and serve as a source of support and empowerment. ' +
      'Personal example and source of support for the population.',
    guiding_questions: [
      'To what extent is local leadership perceived as a source of support for the population?',
      'To what extent does leadership set a personal example for the public?',
      'To what extent does local leadership enjoy trust and provide a sense of security in managing the event?',
    ],
  },
  {
    id: 'belonging_solidarity',
    name_he: 'שייכות וסולידריות',
    name_en: 'Belonging and Solidarity',
    description:
      'The ability to create a sense of belonging and solidarity to ensure support and mutual guarantee ' +
      'among community members. Creating a sense of "shared fate." Building and activating programs that ' +
      'strengthen residents\' sense of belonging and providing responses to segments perceived as "outside the camp."',
    guiding_questions: [
      'To what extent does a sense of solidarity, shared fate, and mutual guarantee exist among the public?',
      'To what extent do phenomena of mutual aid at the community level exist?',
      'To what extent are there population groups perceived as "outside the camp" or being blamed?',
    ],
  },
  {
    id: 'wellbeing_atrisk',
    name_he: 'דאגה ורווחה פיזית ונפשית בדגש על אוכלוסיות סיכון',
    name_en: 'Physical and Mental Wellbeing (At-Risk Populations)',
    description:
      'The ability of the community to identify and address the needs of vulnerable populations. ' +
      'Mapping population vulnerability and at-risk populations — in routine and emergency — and ' +
      'establishing mechanisms for identifying needs and providing responses.',
    guiding_questions: [
      'To what extent is activity taking place to identify needs of vulnerable populations (first, second, and third circles)?',
      'To what extent do sufficient and adapted responses exist for population needs — with emphasis on at-risk populations — at the authority level (physical, emotional, informational)?',
    ],
  },
];

export const COMPONENT_MAP = Object.fromEntries(
  RESILIENCE_COMPONENTS.map((c) => [c.id, c]),
);
