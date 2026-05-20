/**
 * Definitions for the 8 community resilience components, based on the Home Front Command framework.
 * (Pikud HaOref / פיקוד העורף — Civil Defense assessment methodology, based on Fran Norris 2008)
 *
 * Community resilience is defined as the community's ability, during and after a crisis or emergency,
 * to leverage its resources, adapt to changes in the environment, continue to function, and provide
 * essential community services — in order to preserve or strengthen the physical and mental health
 * of its members.
 *
 * Each component has:
 *   description        — what the component measures
 *   key_elements       — the sub-factors that drive the component (where defined in the framework)
 *   principle          — the governing principle or guiding rule (where applicable)
 *   guiding_questions  — evaluation questions used in evidence extraction and scoring (1–10)
 */

export const RESILIENCE_COMPONENTS = [
  {
    id: 'narrative',
    name_he: 'נרטיב',
    name_en: 'Narrative',
    description:
      'The ability of the public story surrounding the crisis to influence coping. ' +
      'A dominant narrative can strengthen or weaken the community\'s ability to endure. ' +
      'The official narrative must be perceived as credible and relevant. ' +
      'Multiple narratives may coexist — complementary or conflicting. ' +
      'Examples of competing frames: "there is a purpose to the war" vs. "victory is not worth the price."',
    guiding_questions: [
      'To what extent is there a dominant narrative of successful coping?',
      'To what extent is the official narrative perceived as credible and relevant by the population?',
      'To what extent are there contradictory or competing narratives undermining the shared story?',
    ],
    behavioral_manifestations: [
      'A narrative of successful coping is visible and circulating (residents/officials describe coping as effective)',
      'The coping story reflects the entire population, not just a subset',
      'Residents express that the authority\'s narrative is credible and reflects their lived reality',
      'Competing or contradictory narratives are explicitly voiced by residents or groups',
    ],
  },
  {
    id: 'information_communication',
    name_he: 'מידע, תקשורת ושיתוף',
    name_en: 'Information, Communication, and Sharing',
    description:
      'The ability of information and public messaging to guide life-saving behavior, ' +
      'and to be clear, credible, available, and accessible to all population segments. ' +
      'Includes adapted messaging for different sectors and feedback mechanisms. ' +
      'When information is unavailable or not credible, rumors and misinformation fill the vacuum. ' +
      'The goal is to channel the population toward effective life-saving behavior.',
    guiding_questions: [
      'To what extent does the population perceive official information — guidance, instructions, and support — as effective and meeting their needs?',
      'To what extent do information and messaging mechanisms adapted to different community sectors exist?',
      'To what extent do information gaps remain, or is misinformation (fake news) being spread?',
      'To what extent is information accessible and available to all population segments, including vulnerable groups?',
      'To what extent does the guidance match the actual situation people face — is it actionable given real constraints (workers who cannot stop, shelters not accessible, no legal framework to comply), and does it cover edge cases (mass casualties, no nearby shelter, economic decisions under fire)?',
    ],
    behavioral_manifestations: [
      'Residents state they receive the information they need to function during the emergency',
      'Authority communication mechanisms are adapted to different resident groups (language, channel, format)',
      'Residents express trust in information received from the authority',
      'Population perceives national media information as relevant and addressing their needs',
      'Residents report information gaps, confusion, or spread of rumors/misinformation',
      'Guidance is reported as situation-matched and actionable — residents could follow it given real-world constraints',
      'Guidance is reported as mismatched, impractical, or failing to cover critical scenarios (workers with no legal protection to stop, no shelter access, mass-casualty situations)',
    ],
  },
  {
    id: 'lifesaving_behavior',
    name_he: 'התנהגות אפקטיבית להצלת חיים',
    name_en: 'Effective Life-Saving Behavior',
    description:
      'The ability to prepare community mechanisms in routine times and activate them during emergencies ' +
      'to ensure effective life-saving behavior. Includes embedding threat awareness, building knowledge ' +
      'and skills, formal and community enforcement of protective guidelines, and planning and activating ' +
      'personal, family, and community action plans. Also includes embedding a culture of personal and ' +
      'community preparedness.',
    key_elements: [
      'Threat perception — the population perceives the event as genuinely life-threatening',
      'Clarity of guidelines — instructions are clear and understood',
      'Population knowledge and skills — ability to act correctly at both individual and community levels',
      'Formal and community enforcement of protective guidelines',
      'Perception of leadership as a professional authority worthy of compliance',
    ],
    guiding_questions: [
      'To what extent does the population act according to life-saving guidelines?',
      'To what extent does the population perceive the event as life-threatening?',
      'To what extent does the population know and understand the published guidelines?',
      'To what extent does formal or community enforcement of protective guidelines take place?',
      'To what extent is leadership perceived as a professional authority that guides protective behavior?',
    ],
    behavioral_manifestations: [
      'Residents are observed or reported to actually follow Home Front Command (HFC) protective guidelines (sheltering, evacuating, etc.)',
      'Residents demonstrate knowledge and understanding of HFC guidelines',
      'Community teams or roles actively promote emergency preparedness among residents',
      'Residents or officials report non-compliance with protective guidelines',
      'Residents express or demonstrate perception of the situation as genuinely life-threatening',
    ],
  },
  {
    id: 'functional_continuity',
    name_he: 'רציפות תפקודית',
    name_en: 'Functional Continuity',
    description:
      'The ability of the community to continue functioning and providing essential personal and community ' +
      'services and needs according to the situation\'s characteristics. Includes supply of essential goods ' +
      'and services, operation of essential workplaces and educational institutions, and minimization of ' +
      'damage to daily routine. The aspiration is to restore or preserve continuity as much as possible.',
    principle:
      'In a disaster, three forms of continuity must be preserved or restored: ' +
      'functional continuity (roles and tasks), identity continuity (sense of self and role), ' +
      'and interpersonal continuity (relationships and social bonds). ' +
      'Maintaining continuity strengthens a sense of competence and reduces dependency. ' +
      'The guiding principle is: "help them help themselves." ' +
      'Examples: a citizen who continues working during an emergency; maintaining family roles after evacuation.',
    guiding_questions: [
      'To what extent was daily routine disrupted in the following areas: work, studies, commerce, leisure activities?',
      'To what extent are essential services and goods available to the population?',
      'To what extent are essential workplaces and educational institutions continuing to operate?',
      'To what extent are people able to maintain their functional, identity, and social roles under emergency conditions?',
    ],
    behavioral_manifestations: [
      'Residents succeed in managing daily life (reported continuation of work, commerce, or social roles)',
      'Schools and educational institutions are open and operating (or explicitly closed/disrupted)',
      'Residents report that sufficient resources are available to maintain routine functioning',
      'Essential services (healthcare, supply chains, municipal services) continue to operate',
      'Specific disruptions to daily life are reported (closures, evacuations, inability to work)',
    ],
  },
  {
    id: 'community_capital',
    name_he: 'הון ומשאבי קהילה',
    name_en: 'Community Capital and Resources',
    description:
      'The ability to maximize community resources — human, physical, and social networks — through ' +
      'coordination between community mechanisms, cross-sector cooperation, activation of anchor ' +
      'organizations (local authority, community organizations), and volunteer mobilization. ' +
      'Optimal use of the comparative advantages of each partner.',
    guiding_questions: [
      'To what extent do mechanisms exist for effective coordination and maximization of community resources (human, physical, network)?',
      'To what extent is there willingness among the population for active volunteer action for their community?',
      'To what extent are anchor organizations (local authority, community bodies) effectively activated and coordinating?',
      'To what extent is cross-sector cooperation taking place to address community needs?',
    ],
    behavioral_manifestations: [
      'Residents volunteer or express willingness to volunteer in formal or informal frameworks',
      'Authority or organizations are observed to activate and coordinate community resources',
      'Mechanisms exist and operate to coordinate volunteers and community organizations',
      'Cross-sector cooperation (e.g., municipality + NGOs + businesses) is reported or observed',
    ],
  },
  {
    id: 'leadership',
    name_he: 'מנהיגות',
    name_en: 'Leadership',
    description:
      'The perceived ability of formal and informal leadership — including religious figures, ' +
      'spiritual leaders, and community influencers — to lead the community, address its needs, ' +
      'and serve as a source of support and empowerment. Leadership can strengthen or weaken resilience. ' +
      'Key attributes include public trust, personal example, channeling public perceptions and behavior, ' +
      'and representing all segments of the community.',
    guiding_questions: [
      'To what extent is local leadership perceived as a source of support for the population?',
      'To what extent does leadership set a personal example for the public?',
      'To what extent does local leadership enjoy public trust and provide a sense of security in managing the event?',
      'To what extent does leadership represent and address the needs of all community segments, including marginalized groups?',
    ],
    behavioral_manifestations: [
      'Residents express that formal or informal leadership is a source of support and security',
      'Leadership actively encourages residents to follow HFC guidelines (statements, actions, public presence)',
      'Leadership is reported to function professionally and manage the situation competently',
      'Residents express distrust, criticism, or frustration with leadership',
    ],
  },
  {
    id: 'belonging_solidarity',
    name_he: 'שייכות וסולידריות',
    name_en: 'Belonging and Solidarity',
    description:
      'The ability to create a sense of belonging and mutual guarantee among community members. ' +
      'Includes fostering a sense of "shared fate," building and activating programs that strengthen ' +
      'residents\' sense of belonging, encouraging mutual aid, and providing responses to groups ' +
      'perceived as outside the community mainstream.',
    principle: '"We are all in the same boat" — a collective sense of shared destiny and mutual responsibility.',
    guiding_questions: [
      'To what extent does a sense of solidarity, shared fate, and mutual guarantee exist among the public?',
      'To what extent do phenomena of mutual aid at the community level exist?',
      'To what extent are there population groups perceived as "outside the camp" or being scapegoated or blamed?',
      'To what extent are programs in place to strengthen belonging and address marginalized or vulnerable groups?',
    ],
    behavioral_manifestations: [
      'Residents express a sense of solidarity or shared fate (in their own words)',
      'Concrete acts of mutual aid between residents are reported (helping neighbors, sharing resources, organizing support)',
      'Population groups are reported as scapegoated, blamed, or excluded due to the emergency (negative signal)',
      'Programs or events strengthening belonging are activated and attended',
    ],
  },
  {
    id: 'wellbeing_at_risk',
    name_he: 'דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון',
    name_en: 'Physical and Mental Wellbeing (At-Risk Populations)',
    description:
      'The ability of the community to identify and address the needs of vulnerable populations — ' +
      'in routine times and during emergencies. Includes mapping population vulnerability, establishing ' +
      'mechanisms for identifying needs and providing adapted responses: physical, emotional, and informational.',
    principle:
      'The chain is only as strong as its weakest link. ' +
      'Responses must be tailored to the specific characteristics of vulnerable and at-risk populations.',
    guiding_questions: [
      'To what extent is activity taking place to identify the needs of vulnerable populations (first, second, and third circles of vulnerability)?',
      'To what extent do sufficient and adapted responses exist for population needs — with emphasis on at-risk populations — at the authority level (physical, emotional, informational)?',
      'To what extent are mechanisms in place to locate, map, and continuously monitor at-risk individuals and groups?',
    ],
    behavioral_manifestations: [
      'Emotional support responses (psychological first aid, mental health services) are available and used by residents showing anxiety or trauma',
      'Specific responses for at-risk or special-needs populations are reported as active (elderly, disabled, evacuees, etc.)',
      'Residents in the second or third circle of vulnerability (indirectly affected) receive responses to their needs',
      'Reports of unmet mental health or physical wellbeing needs among residents',
    ],
  },
];

export const COMPONENT_MAP = Object.fromEntries(
  RESILIENCE_COMPONENTS.map((c) => [c.id, c]),
);
