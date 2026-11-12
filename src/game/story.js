// Velocity Rush — original story set in the fictional city of Harbor City.
// All characters, crews and places are fictional.

export const CHARACTERS = {
  player: { id: 'player', name: 'You', role: 'Newcomer driver, callsign "Ghostline"', color: '#f2efe9' },
  mara: { id: 'mara', name: 'Mara Quill', role: 'Mechanic & mentor, runs the Lantern Garage', color: '#f5b83d' },
  dex: { id: 'dex', name: 'Dex Okafor', role: 'Radio voice, info broker of the night scene', color: '#c9d2d9' },
  vale: { id: 'vale', name: 'Juno Vale', role: 'Boss of the Tidewater Saints (Act I)', color: '#8fb3c9' },
  kade: { id: 'kade', name: 'Kade "Gridlock" Moreno', role: 'Boss of the Circuit Choir (Act II)', color: '#d9a066' },
  sable: { id: 'sable', name: 'Sable Ishikawa', role: 'Boss of the Dust Ravens (Act III)', color: '#c98a5a' },
  harrow: { id: 'harrow', name: 'Commissioner Elias Harrow', role: 'Head of the Harbor Interceptor Unit', color: '#d9412e' },
  lio: { id: 'lio', name: 'Lio Quill', role: 'Mara\'s brother, the legend who vanished', color: '#e6e0d4' }
};

/**
 * STORY: 4 acts. Each act: { id, title, subtitle, boss, chapter, intro:[lines], outro:[lines] }
 * Each line: { speaker: characterId, text }
 * Event-specific dialogue lives in EVENT_DIALOGUE keyed by event id: { pre:[lines], post:[lines] }
 */
export const STORY = {
  title: 'Velocity Rush: Harbor City',
  prologue: [
    { speaker: 'dex', text: 'Harbor City, 2:14 a.m. The cranes are asleep, the harbor lights are low, and the streets belong to whoever is fastest.' },
    { speaker: 'dex', text: 'Four crews run this city. Every one of them owes their crown to a man nobody has seen in three years: Lio Quill.' },
    { speaker: 'mara', text: 'You\'re the kid who outran the Saints on the ring road last night? Pull in. My garage, my rules.' },
    { speaker: 'mara', text: 'I fix your car, you race for the Lantern. Win enough and the crews will have to talk to you. That\'s all I want — a conversation.' },
    { speaker: 'player', text: 'What kind of conversation?' },
    { speaker: 'mara', text: 'The kind where someone finally tells me what happened to my brother.' }
  ],
  acts: [
    {
      id: 1, chapter: 1, title: 'Act I — Low Tide', subtitle: 'The Harbor Loop', boss: 'vale',
      intro: [
        { speaker: 'dex', text: 'The Tidewater Saints own the docks. Juno Vale runs them like a church — prayers optional, tithes not.' },
        { speaker: 'vale', text: 'A Lantern car on my loop? Mara must be desperate. Fine. Earn a seat at my table.' },
        { speaker: 'mara', text: 'Ignore her sermons. Learn the loop, learn the braking points, and keep your nose clean.' }
      ],
      outro: [
        { speaker: 'vale', text: 'You drive like the tide coming in. Quiet, then everywhere at once.' },
        { speaker: 'vale', text: 'Lio raced me here once. Before he left, he gave something to Kade downtown. Ask the Choir what they\'re singing about.' },
        { speaker: 'mara', text: 'Something? He never gave anyone anything. Let\'s go find out.' }
      ]
    },
    {
      id: 2, chapter: 2, title: 'Act II — Signal Noise', subtitle: 'The Downtown Grid', boss: 'kade',
      intro: [
        { speaker: 'dex', text: 'Downtown is the Circuit Choir\'s stage. They know every light cycle by heart, and Kade Moreno times his runs to the second.' },
        { speaker: 'kade', text: 'Ghostline. Cute name. Down here we race the grid, not each other. Try to keep the tempo.' },
        { speaker: 'mara', text: 'The Grid punishes greed. Short-shift out of the corners and let the straights do the work.' }
      ],
      outro: [
        { speaker: 'kade', text: 'Alright, you hit every note. Here — Lio left this transmitter with me. It pings one place: the canyon.' },
        { speaker: 'kade', text: 'Careful. The Ravens don\'t like visitors, and Harrow\'s Interceptors have been circling ever since Lio vanished.' },
        { speaker: 'dex', text: 'Cops on a three-year-old cold case? That\'s not a coincidence, that\'s a stakeout.' }
      ]
    },
    {
      id: 3, chapter: 3, title: 'Act III — Dust & Static', subtitle: 'Canyon Run & Industrial Zone', boss: 'sable',
      intro: [
        { speaker: 'dex', text: 'Past the city limits, the Dust Ravens drift the canyon switchbacks and run contraband through the old foundry.' },
        { speaker: 'sable', text: 'Lantern blood. Mara\'s brother had the same look before he made his deal.' },
        { speaker: 'player', text: 'What deal?' },
        { speaker: 'sable', text: 'Beat me and I\'ll tell you. Lose and you go home with sand in your teeth.' }
      ],
      outro: [
        { speaker: 'sable', text: 'Lio didn\'t vanish. He made a deal with Harrow: the crews\' routes in exchange for a clean record.' },
        { speaker: 'mara', text: 'No. Lio would never sell us out.' },
        { speaker: 'sable', text: 'He didn\'t. He fed Harrow fake routes for a year — then Harrow figured it out. Lio ran. He\'s been racing under another name ever since.' },
        { speaker: 'dex', text: 'Another name... Ghostline. Mara — who gave you that callsign?' }
      ]
    },
    {
      id: 4, chapter: 4, title: 'Act IV — Skyline', subtitle: 'The Skyline Sprint', boss: 'harrow',
      intro: [
        { speaker: 'mara', text: 'I did. The night you showed up I found Lio\'s old radio tag under your dash. The car you bought used to be his.' },
        { speaker: 'lio', text: '(radio static) ...if you\'re hearing this, the car found someone fast enough. Mara, I\'m sorry. Harrow is the real boss of Harbor City.' },
        { speaker: 'harrow', text: 'Every crew in this city ran on my schedule. Lio broke it. Now you have. Tonight the Skyline closes — with you on it.' },
        { speaker: 'dex', text: 'All four crews are listening. Saints, Choir, Ravens. They\'re rolling out with you.' }
      ],
      outro: [
        { speaker: 'dex', text: 'Interceptor unit grounded. Harrow\'s files are on every screen in the harbor. The schedule is broken.' },
        { speaker: 'lio', text: 'Mara. I\'m at the north pier. I\'m done running.' },
        { speaker: 'mara', text: '...Ghostline. Thank you. The Lantern stays lit. Always a bay here for you.' },
        { speaker: 'vale', text: 'The streets are open again. Same time tomorrow night?' }
      ]
    }
  ],
  // The twist, summarized for docs & UI codex
  twist: 'The callsign "Ghostline" and the player\'s first car both belonged to Lio Quill, who secretly fed false crew routes to Commissioner Harrow — the hidden power controlling all four crews — before going into hiding.'
};

// Pre/post event dialogue keyed by event id (see events.js)
export const EVENT_DIALOGUE = {
  'a1-harbor-intro': {
    pre: [{ speaker: 'mara', text: 'Easy first run. Three laps of the Harbor Loop. Finish on the podium and the Saints will notice.' }],
    post: [{ speaker: 'dex', text: 'Word travels fast on the docks. Somebody new is making the Saints sweat.' }]
  },
  'a1-dock-sprint': {
    pre: [{ speaker: 'vale', text: 'Point to point. No second chances, no second laps.' }],
    post: [{ speaker: 'vale', text: 'Hm. You didn\'t lift once. Reckless or brave — I\'ll decide later.' }]
  },
  'a1-crane-drift': {
    pre: [{ speaker: 'mara', text: 'Drift points pay the rent. Chain your slides, don\'t touch the walls.' }],
    post: [{ speaker: 'mara', text: 'Tires are cooked, wallet isn\'t. Good trade.' }]
  },
  'a1-tide-trial': {
    pre: [{ speaker: 'dex', text: 'Just you and the clock. Beat the Saints\' lap record.' }],
    post: [{ speaker: 'dex', text: 'New record on the board. Vale is going to hate that.' }]
  },
  'a1-boss-vale': {
    pre: [{ speaker: 'vale', text: 'Five laps. My loop, my rules. Kneel at the finish or don\'t come back.' }],
    post: [{ speaker: 'vale', text: 'Nobody has beaten me here since Lio. Go downtown, Ghostline.' }]
  },
  'a2-grid-circuit': {
    pre: [{ speaker: 'kade', text: 'The grid has rhythm. Find it.' }],
    post: [{ speaker: 'kade', text: 'You were off-beat in sector two, but you got there.' }]
  },
  'a2-signal-knockout': {
    pre: [{ speaker: 'dex', text: 'Knockout rules: last car at each line goes home. Stay out of the back.' }],
    post: [{ speaker: 'dex', text: 'Last one standing. The Choir is humming your name.' }]
  },
  'a2-first-heat': {
    pre: [{ speaker: 'dex', text: 'Interceptors spotted downtown. Lose them before they box you in.' }],
    post: [{ speaker: 'mara', text: 'Harrow\'s people don\'t usually bother with street racers. Why now?' }]
  },
  'a2-overpass-drift': {
    pre: [{ speaker: 'kade', text: 'The overpass bends are a love song for drifters. Sing.' }],
    post: [{ speaker: 'kade', text: 'Tyre smoke under the streetlights. Beautiful.' }]
  },
  'a2-boss-kade': {
    pre: [{ speaker: 'kade', text: 'Final movement. Keep up or get conducted into a wall.' }],
    post: [{ speaker: 'kade', text: 'Take the transmitter. Lio would have wanted it in fast hands.' }]
  },
  'a3-canyon-sprint': {
    pre: [{ speaker: 'sable', text: 'The canyon eats the timid. Don\'t be timid.' }],
    post: [{ speaker: 'sable', text: 'Still in one piece. Interesting.' }]
  },
  'a3-switchback-drift': {
    pre: [{ speaker: 'sable', text: 'Ravens score in smoke. Show me twenty thousand.' }],
    post: [{ speaker: 'mara', text: 'Even Sable clapped. Quietly. Once.' }]
  },
  'a3-foundry-knockout': {
    pre: [{ speaker: 'dex', text: 'The old foundry. Tight lanes, hard walls, one car out every lap.' }],
    post: [{ speaker: 'dex', text: 'The Ravens are running out of reasons not to talk.' }]
  },
  'a3-foundry-escape': {
    pre: [{ speaker: 'dex', text: 'Harrow\'s raiding the foundry! Get out with the Ravens\' ledger!' }],
    post: [{ speaker: 'sable', text: 'You saved the ledger. Fine. You\'ve earned the truth.' }]
  },
  'a3-boss-sable': {
    pre: [{ speaker: 'sable', text: 'Canyon, top to bottom, then back. If you win, I talk.' }],
    post: [{ speaker: 'sable', text: 'Lio made a deal with Harrow. And then he broke it.' }]
  },
  'a4-skyline-trial': {
    pre: [{ speaker: 'mara', text: 'Learn the Skyline before Harrow closes it. One clean lap.' }],
    post: [{ speaker: 'mara', text: 'That\'s Lio\'s line. You drive it like he did.' }]
  },
  'a4-crew-summit': {
    pre: [{ speaker: 'vale', text: 'All crews, one grid. Winner leads the convoy tonight.' }],
    post: [{ speaker: 'kade', text: 'Ghostline leads. Nobody argues.' }]
  },
  'a4-interceptor-gauntlet': {
    pre: [{ speaker: 'harrow', text: 'Every unit, every street. Bring them in.' }],
    post: [{ speaker: 'dex', text: 'Two hundred officers, zero arrests. Harrow is losing it.' }]
  },
  'a4-boss-harrow': {
    pre: [
      { speaker: 'harrow', text: 'One last race, Ghostline. If you lose, the crews are mine forever.' },
      { speaker: 'lio', text: '(radio) Stay on the inside at the tower hairpin. He always leaves it open.' }
    ],
    post: [{ speaker: 'harrow', text: '...The schedule was perfect. Until you.' }]
  }
};

export function getAct(chapter) {
  return STORY.acts.find(a => a.chapter === chapter) || null;
}

export function getEventDialogue(eventId) {
  return EVENT_DIALOGUE[eventId] || { pre: [], post: [] };
}
