// 塔罗牌库：78 张（22 大阿卡纳 + 56 小阿卡纳）
// 中文 name/upright/reversed 为本项目释义；其余字段来自 Tarotoo RWS 数据集（MIT），作为英文参考。
// 元素 element 用于牌面色彩与动画主题：wands=火 cups=水 swords=风 pentacles=土 major=灵

export const TAROT_DECK = [
  {
    name: '愚者', en: 'The Fool', icon: '🃏', arcana: 'major', suit: 'major', num: 0,
    upright: '全新开始、自由与冒险的召唤', reversed: '鲁莽、犹豫或迷失方向',
    keywordsUp: ["new beginnings", "spontaneity", "innocence", "leap of faith", "free spirit"], keywordsRev: ["recklessness", "hesitation", "naivety", "poor judgment", "fear of change"],
    meaningUp: "New beginnings, spontaneity, innocence, leap of faith, free spirit", meaningRev: "Recklessness, hesitation, naivety, poor judgment, fear of change",
    love: "new romance, emotional openness, spontaneous connection, taking a chance on love", career: "new career path, taking a professional risk, entrepreneurial leap, learning through experience", mood: "Light, curious, playful", spiritual: "spiritual beginning, trust in the journey, openness to the unknown, following inner guidance",
    yesNo: '也许', yesNoRev: '否', element: 'Air', planet: 'Uranus', zodiac: 'Aquarius'
  },
  {
    name: '魔术师', en: 'The Magician', icon: '🪄', arcana: 'major', suit: 'major', num: 1,
    upright: '创造力与行动力，万事俱备', reversed: '才华错用、自我怀疑',
    keywordsUp: ["manifestation", "willpower", "resourcefulness", "skill", "focused action"], keywordsRev: ["manipulation", "untapped talent", "scattered energy", "trickery", "illusion"],
    meaningUp: "Manifestation, willpower, resourcefulness, skill, focused action", meaningRev: "Manipulation, untapped talent, scattered energy, trickery, illusion",
    love: "strong attraction, romantic initiative, clear intentions, creating the relationship you desire", career: "skillful execution, using available resources, career initiative, turning ideas into results", mood: "Confident, energized", spiritual: "focused intention, conscious manifestation, aligning will and action, recognizing personal power",
    yesNo: '是', yesNoRev: '否', element: 'Air', planet: 'Mercury', zodiac: 'Gemini'
  },
  {
    name: '女祭司', en: 'The High Priestess', icon: '🌙', arcana: 'major', suit: 'major', num: 2,
    upright: '直觉、潜意识的智慧', reversed: '忽视内心声音、秘密未明',
    keywordsUp: ["intuition", "inner wisdom", "mystery", "the subconscious", "stillness"], keywordsRev: ["ignored intuition", "secrets", "disconnection from self", "hidden agendas", "surface knowledge"],
    meaningUp: "Intuition, inner wisdom, mystery, the subconscious, stillness", meaningRev: "Ignored intuition, secrets, disconnection from self, hidden agendas, surface knowledge",
    love: "unspoken feelings, emotional intuition, hidden attraction, a private or mysterious connection", career: "trusting professional intuition, working behind the scenes, confidential matters, patient observation", mood: "Quiet, inward, softly mysterious", spiritual: "inner wisdom, sacred mystery, intuitive awareness, listening to the subconscious",
    yesNo: '也许', yesNoRev: '否', element: 'Water', planet: 'Moon', zodiac: 'Cancer'
  },
  {
    name: '皇后', en: 'The Empress', icon: '🌿', arcana: 'major', suit: 'major', num: 3,
    upright: '丰饶、滋养与温柔的力量', reversed: '依赖过度或创造力受阻',
    keywordsUp: ["abundance", "nurturing", "fertility", "creativity", "sensuality"], keywordsRev: ["creative block", "smothering", "self-neglect", "dependence", "stagnation"],
    meaningUp: "Abundance, nurturing, fertility, creativity, sensuality", meaningRev: "Creative block, smothering, self-neglect, dependence, stagnation",
    love: "nurturing love, affection, sensuality, emotional abundance", career: "creative growth, supportive workplace, productive abundance, nurturing a project", mood: "Warm, sensual, content", spiritual: "connection with nature, creative life force, receptive abundance, nurturing spiritual growth",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Venus', zodiac: 'Taurus'
  },
  {
    name: '皇帝', en: 'The Emperor', icon: '👑', arcana: 'major', suit: 'major', num: 4,
    upright: '秩序、权威与稳定', reversed: '控制欲强或缺乏自律',
    keywordsUp: ["structure", "authority", "stability", "leadership", "discipline"], keywordsRev: ["rigidity", "control issues", "domination", "lack of discipline", "abuse of power"],
    meaningUp: "Structure, authority, stability, leadership, discipline", meaningRev: "Rigidity, control issues, domination, lack of discipline, abuse of power",
    love: "commitment, stability, protection, a structured relationship", career: "leadership, structure, authority, long-term career stability", mood: "Steady, resolute, composed", spiritual: "spiritual discipline, inner authority, grounded leadership, creating stable foundations",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Mars', zodiac: 'Aries'
  },
  {
    name: '教皇', en: 'The Hierophant', icon: '📜', arcana: 'major', suit: 'major', num: 5,
    upright: '传统、信仰与导师指引', reversed: '墨守成规或反叛权威',
    keywordsUp: ["tradition", "guidance", "shared values", "institutions", "mentorship"], keywordsRev: ["rebellion", "questioning convention", "restriction", "dogma", "breaking rules"],
    meaningUp: "Tradition, guidance, shared values, institutions, mentorship", meaningRev: "Rebellion, questioning convention, restriction, dogma, breaking rules",
    love: "traditional commitment, shared values, marriage, spiritual partnership", career: "established institutions, mentorship, formal training, conventional career path", mood: "Reflective, respectful", spiritual: "spiritual tradition, sacred teachings, mentorship, shared beliefs and ritual",
    yesNo: '也许', yesNoRev: '也许', element: 'Earth', planet: 'Venus', zodiac: 'Taurus'
  },
  {
    name: '恋人', en: 'The Lovers', icon: '💞', arcana: 'major', suit: 'major', num: 6,
    upright: '爱、契合与重要抉择', reversed: '失衡、分歧或犹豫不决',
    keywordsUp: ["love", "union", "alignment", "meaningful choice", "harmony"], keywordsRev: ["disharmony", "misalignment", "avoidance of choice", "temptation", "imbalance"],
    meaningUp: "Love, union, alignment, meaningful choice, harmony", meaningRev: "Disharmony, misalignment, avoidance of choice, temptation, imbalance",
    love: "deep connection, mutual attraction, relationship choices, emotional alignment", career: "aligned career choice, productive partnership, values-based decision, important professional commitment", mood: "Tender, heart-open", spiritual: "alignment with core values, sacred union, conscious choice, integrating inner opposites",
    yesNo: '是', yesNoRev: '否', element: 'Air', planet: 'Mercury', zodiac: 'Gemini'
  },
  {
    name: '战车', en: 'The Chariot', icon: '🛡️', arcana: 'major', suit: 'major', num: 7,
    upright: '意志驱动、突破前进', reversed: '失控、方向分散',
    keywordsUp: ["determination", "victory", "willpower", "self-control", "momentum"], keywordsRev: ["lack of direction", "aggression", "obstacles", "scattered forces", "loss of control"],
    meaningUp: "Determination, victory, willpower, self-control, momentum", meaningRev: "Lack of direction, aggression, obstacles, scattered forces, loss of control",
    love: "pursuing love, relationship progress, shared direction, overcoming romantic obstacles", career: "ambition, focused progress, overcoming competition, taking control of your career", mood: "Driven, determined", spiritual: "spiritual determination, directing inner forces, disciplined progress, mastery through focus",
    yesNo: '是', yesNoRev: '否', element: 'Water', planet: 'Moon', zodiac: 'Cancer'
  },
  {
    name: '力量', en: 'Strength', icon: '🦁', arcana: 'major', suit: 'major', num: 8,
    upright: '柔韧的勇气与自我掌控', reversed: '自我怀疑、情绪失控',
    keywordsUp: ["courage", "inner strength", "patience", "compassion", "gentle power"], keywordsRev: ["self-doubt", "raw emotion", "impatience", "insecurity", "forcing"],
    meaningUp: "Courage, inner strength, patience, compassion, gentle power", meaningRev: "Self-doubt, raw emotion, impatience, insecurity, forcing",
    love: "patience in love, gentle devotion, emotional courage, compassionate support", career: "quiet leadership, professional confidence, patience under pressure, managing challenges with composure", mood: "Calm courage", spiritual: "inner courage, compassionate self-mastery, gentle resilience, transforming instinct with awareness",
    yesNo: '是', yesNoRev: '也许', element: 'Fire', planet: 'Sun', zodiac: 'Leo'
  },
  {
    name: '隐士', en: 'The Hermit', icon: '🏮', arcana: 'major', suit: 'major', num: 9,
    upright: '独处、内省与求索', reversed: '孤立或逃避现实',
    keywordsUp: ["introspection", "solitude", "inner guidance", "wisdom", "searching"], keywordsRev: ["isolation", "loneliness", "withdrawal", "lost direction", "avoidance"],
    meaningUp: "Introspection, solitude, inner guidance, wisdom, searching", meaningRev: "Isolation, loneliness, withdrawal, lost direction, avoidance",
    love: "time alone, romantic introspection, emotional distance, understanding personal needs", career: "independent work, career reflection, specialist expertise, seeking meaningful direction", mood: "Solitary, contemplative", spiritual: "solitude and reflection, inner searching, spiritual guidance, discovering personal truth",
    yesNo: '也许', yesNoRev: '否', element: 'Earth', planet: 'Mercury', zodiac: 'Virgo'
  },
  {
    name: '命运之轮', en: 'Wheel of Fortune', icon: '🎡', arcana: 'major', suit: 'major', num: 10,
    upright: '转机、命运流转', reversed: '波折、失控的变动',
    keywordsUp: ["change", "cycles", "destiny", "turning point", "luck"], keywordsRev: ["resistance to change", "bad luck", "repeating cycles", "setbacks", "clinging"],
    meaningUp: "Change, cycles, destiny, turning point, luck", meaningRev: "Resistance to change, bad luck, repeating cycles, setbacks, clinging",
    love: "change in love, unexpected encounter, relationship turning point, repeating romantic cycles", career: "changing opportunities, career turning point, unexpected progress, adapting to professional cycles", mood: "Anticipatory, changeable", spiritual: "cycles of growth, accepting change, karmic patterns, trusting life鈥檚 movement",
    yesNo: '也许', yesNoRev: '否', element: 'Fire', planet: 'Jupiter', zodiac: 'Sagittarius'
  },
  {
    name: '正义', en: 'Justice', icon: '⚖️', arcana: 'major', suit: 'major', num: 11,
    upright: '公平、因果与清醒判断', reversed: '偏颇、逃避责任',
    keywordsUp: ["fairness", "truth", "accountability", "cause and effect", "clarity"], keywordsRev: ["unfairness", "dishonesty", "avoiding accountability", "bias", "imbalance"],
    meaningUp: "Fairness, truth, accountability, cause and effect, clarity", meaningRev: "Unfairness, dishonesty, avoiding accountability, bias, imbalance",
    love: "honesty, relationship balance, accountability, fair decisions in love", career: "fair evaluation, contracts and legal matters, accountable decisions, merit-based outcome", mood: "Sober, clear-eyed", spiritual: "spiritual accountability, cause and effect, ethical alignment, balancing actions and consequences",
    yesNo: '也许', yesNoRev: '否', element: 'Air', planet: 'Venus', zodiac: 'Libra'
  },
  {
    name: '倒吊人', en: 'The Hanged Man', icon: '🙃', arcana: 'major', suit: 'major', num: 12,
    upright: '暂停、换视角看世界', reversed: '无谓牺牲或抗拒改变',
    keywordsUp: ["surrender", "new perspective", "pause", "letting go", "suspension"], keywordsRev: ["stalling", "resistance", "martyrdom", "indecision", "wasted sacrifice"],
    meaningUp: "Surrender, new perspective, pause, letting go, suspension", meaningRev: "Stalling, resistance, martyrdom, indecision, wasted sacrifice",
    love: "romantic pause, changing perspective, emotional surrender, waiting for clarity", career: "career pause, delayed progress, new perspective, reconsidering professional priorities", mood: "Suspended, strangely peaceful", spiritual: "surrender, altered perspective, spiritual pause, releasing attachment to control",
    yesNo: '也许', yesNoRev: '否', element: 'Water', planet: 'Neptune', zodiac: 'Pisces'
  },
  {
    name: '死神', en: 'Death', icon: '💀', arcana: 'major', suit: 'major', num: 13,
    upright: '结束与重生，放下方能前行', reversed: '抗拒结束、停滞不前',
    keywordsUp: ["endings", "transformation", "transition", "release", "renewal"], keywordsRev: ["resistance to endings", "stagnation", "fear of change", "holding on", "incomplete closure"],
    meaningUp: "Endings, transformation, transition, release, renewal", meaningRev: "Resistance to endings, stagnation, fear of change, holding on, incomplete closure",
    love: "relationship transformation, ending a romantic chapter, emotional release, a new beginning after change", career: "career transition, ending an outdated role, professional reinvention, making space for change", mood: "Heavy yet quietly relieved", spiritual: "spiritual transformation, release and renewal, ending an old identity, embracing necessary change",
    yesNo: '否', yesNoRev: '否', element: 'Water', planet: 'Mars', zodiac: 'Scorpio'
  },
  {
    name: '节制', en: 'Temperance', icon: '🫗', arcana: 'major', suit: 'major', num: 14,
    upright: '平衡、调和与耐心', reversed: '极端、失衡或急躁',
    keywordsUp: ["balance", "moderation", "patience", "blending", "healing"], keywordsRev: ["excess", "imbalance", "impatience", "friction", "overcorrection"],
    meaningUp: "Balance, moderation, patience, blending, healing", meaningRev: "Excess, imbalance, impatience, friction, overcorrection",
    love: "emotional harmony, patient love, healthy compromise, gradual relationship growth", career: "work-life balance, collaborative teamwork, steady progress, integrating different skills", mood: "Serene, even", spiritual: "inner harmony, spiritual integration, healing through balance, patient transformation",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Jupiter', zodiac: 'Sagittarius'
  },
  {
    name: '恶魔', en: 'The Devil', icon: '😈', arcana: 'major', suit: 'major', num: 15,
    upright: '束缚、欲望与执念', reversed: '挣脱枷锁、觉醒',
    keywordsUp: ["attachment", "temptation", "unhealthy patterns", "materialism", "feeling trapped"], keywordsRev: ["breaking free", "reclaiming power", "awareness", "release", "recovery"],
    meaningUp: "Attachment, temptation, unhealthy patterns, materialism, feeling trapped", meaningRev: "Breaking free, reclaiming power, awareness, release, recovery",
    love: "intense attraction, unhealthy attachment, temptation, controlling relationship patterns", career: "unhealthy attachment to work, material ambition, restrictive job, workplace power dynamics", mood: "Tense, restless", spiritual: "recognizing attachment, confronting the shadow, reclaiming personal freedom, breaking limiting patterns",
    yesNo: '否', yesNoRev: '是', element: 'Earth', planet: 'Saturn', zodiac: 'Capricorn'
  },
  {
    name: '高塔', en: 'The Tower', icon: '🗼', arcana: 'major', suit: 'major', num: 16,
    upright: '突发的崩塌与真相', reversed: '免于灾祸或拖延的危机',
    keywordsUp: ["sudden upheaval", "revelation", "collapse of the false", "disruption", "awakening"], keywordsRev: ["averted disaster", "fear of change", "delayed collapse", "resisting the inevitable", "internal upheaval"],
    meaningUp: "Sudden upheaval, revelation, collapse of the false, disruption, awakening", meaningRev: "Averted disaster, fear of change, delayed collapse, resisting the inevitable, internal upheaval",
    love: "sudden breakup, shocking revelation, relationship upheaval, rebuilding after conflict", career: "sudden career disruption, organizational upheaval, job loss or major change, rebuilding professionally", mood: "Shaken, electric", spiritual: "spiritual awakening through disruption, collapse of false beliefs, sudden revelation, rebuilding on truth",
    yesNo: '否', yesNoRev: '也许', element: 'Fire', planet: 'Mars', zodiac: 'Aries'
  },
  {
    name: '星星', en: 'The Star', icon: '⭐', arcana: 'major', suit: 'major', num: 17,
    upright: '希望、疗愈与指引', reversed: '信心动摇、迷惘',
    keywordsUp: ["hope", "renewal", "healing", "inspiration", "faith"], keywordsRev: ["discouragement", "lost faith", "disconnection", "self-doubt", "dimmed hope"],
    meaningUp: "Hope, renewal, healing, inspiration, faith", meaningRev: "Discouragement, lost faith, disconnection, self-doubt, dimmed hope",
    love: "hope in love, emotional healing, renewed trust, an inspiring connection", career: "renewed career hope, inspired work, visibility for your talents, promising long-term direction", mood: "Hopeful, soothed", spiritual: "renewed faith, spiritual healing, authentic purpose, guidance and inspiration",
    yesNo: '是', yesNoRev: '否', element: 'Air', planet: 'Saturn', zodiac: 'Aquarius'
  },
  {
    name: '月亮', en: 'The Moon', icon: '🌕', arcana: 'major', suit: 'major', num: 18,
    upright: '幻象、直觉与潜意识', reversed: '迷雾散去、看清真相',
    keywordsUp: ["illusion", "intuition", "uncertainty", "the subconscious", "dreams"], keywordsRev: ["clarity emerging", "released fear", "truth surfacing", "confusion lifting", "self-deception ending"],
    meaningUp: "Illusion, intuition, uncertainty, the subconscious, dreams", meaningRev: "Clarity emerging, released fear, truth surfacing, confusion lifting, self-deception ending",
    love: "romantic uncertainty, hidden emotions, mixed signals, trusting emotional intuition", career: "career uncertainty, unclear workplace dynamics, hidden information, cautious professional intuition", mood: "Dreamy, uneasy", spiritual: "subconscious exploration, intuitive sensitivity, spiritual uncertainty, moving through illusion",
    yesNo: '也许', yesNoRev: '是', element: 'Water', planet: 'Jupiter', zodiac: 'Pisces'
  },
  {
    name: '太阳', en: 'The Sun', icon: '☀️', arcana: 'major', suit: 'major', num: 19,
    upright: '喜悦、成功与光明', reversed: '短暂阴霾、过度乐观',
    keywordsUp: ["joy", "success", "vitality", "clarity", "confidence"], keywordsRev: ["dimmed joy", "temporary setbacks", "pessimism", "burnout", "delayed success"],
    meaningUp: "Joy, success, vitality, clarity, confidence", meaningRev: "Dimmed joy, temporary setbacks, pessimism, burnout, delayed success",
    love: "happiness in love, mutual warmth, joyful partnership, openness and affection", career: "career success, recognition, professional confidence, rewarding collaboration", mood: "Joyful, radiant", spiritual: "spiritual clarity, joyful awareness, vitality and truth, connection with the authentic self",
    yesNo: '是', yesNoRev: '也许', element: 'Fire', planet: 'Sun', zodiac: 'Leo'
  },
  {
    name: '审判', en: 'Judgement', icon: '📯', arcana: 'major', suit: 'major', num: 20,
    upright: '觉醒、复盘与召唤', reversed: '自我批判、错失契机',
    keywordsUp: ["awakening", "reckoning", "renewal", "calling", "self-evaluation"], keywordsRev: ["self-criticism", "ignoring the call", "stuck in the past", "harsh judgment", "avoidance"],
    meaningUp: "Awakening, reckoning, renewal, calling, self-evaluation", meaningRev: "Self-criticism, ignoring the call, stuck in the past, harsh judgment, avoidance",
    love: "relationship renewal, reconciliation, emotional awakening, an important romantic decision", career: "career calling, performance review, second chance, decisive professional awakening", mood: "Stirred, resolved", spiritual: "spiritual awakening, answering an inner calling, self-evaluation, release from the past",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Pluto', zodiac: 'Scorpio'
  },
  {
    name: '世界', en: 'The World', icon: '🌍', arcana: 'major', suit: 'major', num: 21,
    upright: '圆满、达成与整合', reversed: '未竟之事、收尾拖延',
    keywordsUp: ["completion", "fulfillment", "wholeness", "achievement", "integration"], keywordsRev: ["incompletion", "loose ends", "delayed closure", "shortcuts", "unfinished business"],
    meaningUp: "Completion, fulfillment, wholeness, achievement, integration", meaningRev: "Incompletion, loose ends, delayed closure, shortcuts, unfinished business",
    love: "lasting fulfillment, relationship completion, mature partnership, reaching a shared milestone", career: "career achievement, project completion, professional mastery, international opportunities", mood: "Fulfilled, celebratory", spiritual: "spiritual completion, wholeness, integration of lessons, connection with the greater whole",
    yesNo: '是', yesNoRev: '也许', element: 'Earth', planet: 'Saturn', zodiac: 'Capricorn'
  },
  {
    name: '权杖王牌', en: 'Ace of Wands', icon: '🔥', arcana: 'minor', suit: 'wands', num: 1,
    upright: '灵感迸发、新计划启程', reversed: '热情熄灭、拖延',
    keywordsUp: ["inspiration", "new opportunity", "creative spark", "enthusiasm", "potential"], keywordsRev: ["delays", "false start", "lack of motivation", "blocked creativity", "hesitation"],
    meaningUp: "Inspiration, new opportunity, creative spark, enthusiasm, potential", meaningRev: "Delays, false start, lack of motivation, blocked creativity, hesitation",
    love: "passionate beginning, strong chemistry, romantic excitement, renewed desire", career: "creative spark, new business venture, inspired career beginning, taking initiative", mood: "Excited, inspired", spiritual: "spiritual inspiration, awakening life force, creative purpose, acting on inner fire",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: '', zodiac: 'Aries, Leo, Sagittarius'
  },
  {
    name: '权杖二', en: 'Two of Wands', icon: '🌅', arcana: 'minor', suit: 'wands', num: 2,
    upright: '规划、远望与抉择', reversed: '犹豫、恐惧未知',
    keywordsUp: ["planning", "future vision", "decision", "expansion", "the world in hand"], keywordsRev: ["fear of the unknown", "playing it safe", "poor planning", "restlessness", "indecision"],
    meaningUp: "Planning, future vision, decision, expansion, the world in hand", meaningRev: "Fear of the unknown, playing it safe, poor planning, restlessness, indecision",
    love: "planning a romantic future, considering relationship options, shared ambitions, deciding what comes next", career: "career planning, future expansion, choosing between opportunities, ambitious professional vision", mood: "Restless anticipation", spiritual: "expanding spiritual vision, choosing a path, planning purposeful growth, looking beyond familiar limits",
    yesNo: '也许', yesNoRev: '否', element: 'Fire', planet: 'Mars', zodiac: 'Aries'
  },
  {
    name: '权杖三', en: 'Three of Wands', icon: '⛵', arcana: 'minor', suit: 'wands', num: 3,
    upright: '拓展、等待成果', reversed: '受阻、计划搁浅',
    keywordsUp: ["progress", "expansion", "foresight", "ships coming in", "momentum"], keywordsRev: ["delays", "obstacles to plans", "limited vision", "setbacks", "impatience"],
    meaningUp: "Progress, expansion, foresight, ships coming in, momentum", meaningRev: "Delays, obstacles to plans, limited vision, setbacks, impatience",
    love: "relationship expansion, waiting for love to develop, long-distance connection, looking toward the future together", career: "business expansion, international work, long-term growth, waiting for results", mood: "Optimistic, forward-looking", spiritual: "faith in unfolding progress, broadening awareness, spiritual expansion, trusting long-term growth",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Sun', zodiac: 'Aries'
  },
  {
    name: '权杖四', en: 'Four of Wands', icon: '🎉', arcana: 'minor', suit: 'wands', num: 4,
    upright: '安稳、庆祝与归属', reversed: '动荡、缺乏根基',
    keywordsUp: ["celebration", "homecoming", "milestone", "community", "stability"], keywordsRev: ["instability at home", "postponed celebration", "transition", "lack of support", "shaky foundations"],
    meaningUp: "Celebration, homecoming, milestone, community, stability", meaningRev: "Instability at home, postponed celebration, transition, lack of support, shaky foundations",
    love: "relationship celebration, engagement, marriage, creating a happy home", career: "workplace milestone, successful launch, team celebration, stable professional foundation", mood: "Celebratory, secure", spiritual: "sacred community, gratitude and celebration, spiritual stability, honoring a meaningful milestone",
    yesNo: '是', yesNoRev: '也许', element: 'Fire', planet: 'Venus', zodiac: 'Aries'
  },
  {
    name: '权杖五', en: 'Five of Wands', icon: '⚔️', arcana: 'minor', suit: 'wands', num: 5,
    upright: '竞争、混乱中的历练', reversed: '内耗、无谓争执',
    keywordsUp: ["conflict", "competition", "friction", "clashing egos", "scattered effort"], keywordsRev: ["avoiding conflict", "resolution", "inner conflict", "release of tension", "picking battles"],
    meaningUp: "Conflict, competition, friction, clashing egos, scattered effort", meaningRev: "Avoiding conflict, resolution, inner conflict, release of tension, picking battles",
    love: "romantic tension, disagreements, competition for attention, conflicting desires", career: "workplace competition, conflicting ideas, professional rivalry, productive challenge", mood: "Irritable, competitive", spiritual: "growth through challenge, testing beliefs, conflicting energies, learning through spiritual friction",
    yesNo: '否', yesNoRev: '也许', element: 'Fire', planet: 'Saturn', zodiac: 'Leo'
  },
  {
    name: '权杖六', en: 'Six of Wands', icon: '🏆', arcana: 'minor', suit: 'wands', num: 6,
    upright: '胜利、认可与声望', reversed: '落空的自负、延迟的荣誉',
    keywordsUp: ["victory", "recognition", "success", "confidence", "public acclaim"], keywordsRev: ["private victory", "fall from grace", "self-doubt", "lack of recognition", "ego inflation"],
    meaningUp: "Victory, recognition, success, confidence, public acclaim", meaningRev: "Private victory, fall from grace, self-doubt, lack of recognition, ego inflation",
    love: "romantic success, feeling admired, public recognition of a relationship, winning someone鈥檚 affection", career: "career recognition, promotion, public success, growing leadership credibility", mood: "Proud, uplifted", spiritual: "confidence in your path, recognition of growth, inspired leadership, sharing spiritual progress",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Jupiter', zodiac: 'Leo'
  },
  {
    name: '权杖七', en: 'Seven of Wands', icon: '🛡️', arcana: 'minor', suit: 'wands', num: 7,
    upright: '坚守、捍卫立场', reversed: '被压垮、放弃阵地',
    keywordsUp: ["defense", "standing your ground", "perseverance", "conviction", "holding advantage"], keywordsRev: ["overwhelm", "giving up ground", "exhaustion", "defensiveness", "yielding"],
    meaningUp: "Defense, standing your ground, perseverance, conviction, holding advantage", meaningRev: "Overwhelm, giving up ground, exhaustion, defensiveness, yielding",
    love: "defending a relationship, maintaining boundaries, fighting for love, resisting outside pressure", career: "defending your position, professional persistence, maintaining boundaries, standing your ground", mood: "Defensive but resolute", spiritual: "defending personal beliefs, spiritual conviction, energetic boundaries, remaining true to your path",
    yesNo: '也许', yesNoRev: '否', element: 'Fire', planet: 'Mars', zodiac: 'Leo'
  },
  {
    name: '权杖八', en: 'Eight of Wands', icon: '💨', arcana: 'minor', suit: 'wands', num: 8,
    upright: '迅速推进、消息传来', reversed: '迟滞、错失时机',
    keywordsUp: ["swift movement", "momentum", "news arriving", "alignment", "rapid progress"], keywordsRev: ["delays", "frustration", "scattered energy", "missed timing", "slowdown"],
    meaningUp: "Swift movement, momentum, news arriving, alignment, rapid progress", meaningRev: "Delays, frustration, scattered energy, missed timing, slowdown",
    love: "rapid romantic developments, passionate communication, unexpected messages, relationship momentum", career: "rapid career developments, fast communication, work-related travel, accelerated progress", mood: "Swift, eager", spiritual: "rapid spiritual movement, synchronicity, energetic alignment, receiving clear signs",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Mercury', zodiac: 'Sagittarius'
  },
  {
    name: '权杖九', en: 'Nine of Wands', icon: '🩹', arcana: 'minor', suit: 'wands', num: 9,
    upright: '警惕、接近终点', reversed: '疲惫、防御过度',
    keywordsUp: ["resilience", "last stand", "persistence", "guardedness", "nearly there"], keywordsRev: ["burnout", "paranoia", "giving up at the end", "rigid defenses", "battle fatigue"],
    meaningUp: "Resilience, last stand, persistence, guardedness, nearly there", meaningRev: "Burnout, paranoia, giving up at the end, rigid defenses, battle fatigue",
    love: "emotional guardedness, relationship resilience, cautious trust, protecting the heart", career: "professional resilience, cautious persistence, nearing completion, protecting previous gains", mood: "Weary but determined", spiritual: "spiritual resilience, protecting your energy, perseverance after trials, wisdom gained through experience",
    yesNo: '也许', yesNoRev: '否', element: 'Fire', planet: 'Moon', zodiac: 'Sagittarius'
  },
  {
    name: '权杖十', en: 'Ten of Wands', icon: '📦', arcana: 'minor', suit: 'wands', num: 10,
    upright: '负重前行、责任在肩', reversed: '卸下重担、懂得取舍',
    keywordsUp: ["burden", "overload", "responsibility", "carrying too much", "final effort"], keywordsRev: ["release", "delegation", "putting burdens down", "collapse", "learning to say no"],
    meaningUp: "Burden, overload, responsibility, carrying too much, final effort", meaningRev: "Release, delegation, putting burdens down, collapse, learning to say no",
    love: "relationship burdens, emotional pressure, carrying too much responsibility, love feeling demanding", career: "overwork, excessive responsibility, burnout risk, need to delegate", mood: "Burdened, overloaded", spiritual: "spiritual burden, carrying inherited beliefs, need for release, simplifying your path",
    yesNo: '否', yesNoRev: '也许', element: 'Fire', planet: 'Saturn', zodiac: 'Sagittarius'
  },
  {
    name: '权杖侍从', en: 'Page of Wands', icon: '🌱', arcana: 'minor', suit: 'wands', num: 11,
    upright: '好奇、热忱的探索', reversed: '三分钟热度',
    keywordsUp: ["enthusiasm", "exploration", "free spirit", "exciting news", "curiosity"], keywordsRev: ["scattered energy", "hasty starts", "boredom", "unreliable news", "restlessness"],
    meaningUp: "Enthusiasm, exploration, free spirit, exciting news, curiosity", meaningRev: "Scattered energy, hasty starts, boredom, unreliable news, restlessness",
    love: "flirtation, exciting messages, playful attraction, curiosity about a new romance", career: "career curiosity, exciting opportunity, learning through action, creative professional news", mood: "Curious, enthusiastic", spiritual: "spiritual curiosity, exploring new practices, enthusiastic discovery, a message of inspiration",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: '', zodiac: 'Aries, Leo, Sagittarius'
  },
  {
    name: '权杖骑士', en: 'Knight of Wands', icon: '🐎', arcana: 'minor', suit: 'wands', num: 12,
    upright: '勇敢、疾风般行动', reversed: '冲动、半途而废',
    keywordsUp: ["action", "adventure", "passion", "bold pursuit", "charisma"], keywordsRev: ["impulsiveness", "recklessness", "scattered passion", "delays in action", "hot temper"],
    meaningUp: "Action, adventure, passion, bold pursuit, charisma", meaningRev: "Impulsiveness, recklessness, scattered passion, delays in action, hot temper",
    love: "passionate pursuit, intense chemistry, impulsive romance, an exciting but inconsistent lover", career: "ambitious action, bold career change, entrepreneurial drive, impulsive professional decisions", mood: "Adventurous, impulsive", spiritual: "passionate spiritual pursuit, adventurous exploration, acting on inspiration, restless searching",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Jupiter', zodiac: 'Sagittarius'
  },
  {
    name: '权杖王后', en: 'Queen of Wands', icon: '🔆', arcana: 'minor', suit: 'wands', num: 13,
    upright: '自信、温暖而有魅力', reversed: '自我中心或缺乏安全感',
    keywordsUp: ["confidence", "warmth", "determination", "magnetism", "independence"], keywordsRev: ["insecurity", "jealousy", "demanding nature", "burnout", "dimmed confidence"],
    meaningUp: "Confidence, warmth, determination, magnetism, independence", meaningRev: "Insecurity, jealousy, demanding nature, burnout, dimmed confidence",
    love: "confidence in love, magnetic attraction, warmth and passion, independent partnership", career: "career confidence, creative leadership, professional charisma, independent success", mood: "Confident, magnetic", spiritual: "radiant spiritual confidence, intuitive creativity, embodied passion, inspiring others",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Sun', zodiac: 'Leo'
  },
  {
    name: '权杖国王', en: 'King of Wands', icon: '👑', arcana: 'minor', suit: 'wands', num: 14,
    upright: '远见、鼓舞他人的领袖', reversed: '专断、好大喜功',
    keywordsUp: ["visionary leadership", "boldness", "entrepreneurship", "mastery of fire", "inspiration"], keywordsRev: ["arrogance", "tyranny", "impulsive leadership", "unfulfilled vision", "domineering"],
    meaningUp: "Visionary leadership, boldness, entrepreneurship, mastery of fire, inspiration", meaningRev: "Arrogance, tyranny, impulsive leadership, unfulfilled vision, domineering",
    love: "bold romantic leadership, passionate commitment, protective affection, pursuing love with confidence", career: "visionary leadership, business growth, decisive action, inspiring others", mood: "Bold, visionary", spiritual: "spiritual leadership, purposeful vision, directing creative energy, courageous guidance",
    yesNo: '是', yesNoRev: '否', element: 'Fire', planet: 'Mars', zodiac: 'Aries'
  },
  {
    name: '圣杯王牌', en: 'Ace of Cups', icon: '💧', arcana: 'minor', suit: 'cups', num: 1,
    upright: '爱意涌动、情感新生', reversed: '情感封闭、错失温柔',
    keywordsUp: ["new love", "emotional beginning", "compassion", "overflowing heart", "spiritual opening"], keywordsRev: ["blocked emotions", "emptiness", "repressed feelings", "emotional loss", "self-love needed"],
    meaningUp: "New love, emotional beginning, compassion, overflowing heart, spiritual opening", meaningRev: "Blocked emotions, emptiness, repressed feelings, emotional loss, self-love needed",
    love: "new love, emotional opening, overflowing affection, deepening feelings", career: "fulfilling opportunity, creative inspiration, emotionally rewarding work, positive workplace beginning", mood: "Tender, open-hearted", spiritual: "spiritual opening, divine love, emotional renewal, deepening compassion",
    yesNo: '是', yesNoRev: '否', element: 'Water', planet: '', zodiac: 'Cancer, Scorpio, Pisces'
  },
  {
    name: '圣杯二', en: 'Two of Cups', icon: '🤝', arcana: 'minor', suit: 'cups', num: 2,
    upright: '联结、相知与默契', reversed: '疏离、不对等的关系',
    keywordsUp: ["partnership", "mutual attraction", "connection", "harmony", "union of equals"], keywordsRev: ["imbalance", "broken connection", "tension", "miscommunication", "self-partnership needed"],
    meaningUp: "Partnership, mutual attraction, connection, harmony, union of equals", meaningRev: "Imbalance, broken connection, tension, miscommunication, self-partnership needed",
    love: "mutual love, emotional partnership, shared attraction, balanced connection", career: "successful partnership, strong collaboration, professional agreement, shared career goals", mood: "Affectionate, harmonious", spiritual: "soulful connection, spiritual partnership, energetic harmony, meeting through shared values",
    yesNo: '是', yesNoRev: '否', element: 'Water', planet: 'Venus', zodiac: 'Cancer'
  },
  {
    name: '圣杯三', en: 'Three of Cups', icon: '🥂', arcana: 'minor', suit: 'cups', num: 3,
    upright: '欢聚、友谊与庆祝', reversed: '小圈子的排挤或过度社交',
    keywordsUp: ["celebration", "friendship", "community", "joy shared", "creative collaboration"], keywordsRev: ["overindulgence", "third-party interference", "isolation from friends", "gossip", "excess"],
    meaningUp: "Celebration, friendship, community, joy shared, creative collaboration", meaningRev: "Overindulgence, third-party interference, isolation from friends, gossip, excess",
    love: "dating and socializing, joyful reunion, celebration with a partner, friendship becoming romantic", career: "teamwork, professional networking, workplace celebration, supportive colleagues", mood: "Joyful, sociable", spiritual: "spiritual fellowship, shared joy, supportive community, gratitude expressed together",
    yesNo: '是', yesNoRev: '否', element: 'Water', planet: 'Mercury', zodiac: 'Cancer'
  },
  {
    name: '圣杯四', en: 'Four of Cups', icon: '🌫️', arcana: 'minor', suit: 'cups', num: 4,
    upright: '倦怠、对现状失去兴味', reversed: '重新审视、重新接纳',
    keywordsUp: ["apathy", "contemplation", "disconnection", "missed offer", "reevaluation"], keywordsRev: ["renewed interest", "accepting the offer", "emerging from withdrawal", "new motivation", "openness"],
    meaningUp: "Apathy, contemplation, disconnection, missed offer, reevaluation", meaningRev: "Renewed interest, accepting the offer, emerging from withdrawal, new motivation, openness",
    love: "emotional withdrawal, romantic dissatisfaction, overlooking an opportunity, feeling disconnected", career: "career dissatisfaction, workplace boredom, overlooked opportunity, need for renewed motivation", mood: "Apathetic, withdrawn", spiritual: "spiritual apathy, inward withdrawal, overlooked guidance, renewing emotional receptivity",
    yesNo: '否', yesNoRev: '是', element: 'Water', planet: 'Moon', zodiac: 'Cancer'
  },
  {
    name: '圣杯五', en: 'Five of Cups', icon: '💧', arcana: 'minor', suit: 'cups', num: 5,
    upright: '失落、盯着空杯叹息', reversed: '释怀、看见剩下的美好',
    keywordsUp: ["loss", "grief", "regret", "focusing on what's gone", "disappointment"], keywordsRev: ["acceptance", "moving on", "forgiveness", "seeing what remains", "healing"],
    meaningUp: "Loss, grief, regret, focusing on what's gone, disappointment", meaningRev: "Acceptance, moving on, forgiveness, seeing what remains, healing",
    love: "heartbreak, regret in love, grieving a relationship, focusing on emotional loss", career: "professional disappointment, missed opportunity, career regret, learning from setbacks", mood: "Sorrowful, regretful", spiritual: "spiritual lessons through grief, acceptance of loss, emotional release, noticing what remains",
    yesNo: '否', yesNoRev: '是', element: 'Water', planet: 'Mars', zodiac: 'Scorpio'
  },
  {
    name: '圣杯六', en: 'Six of Cups', icon: '🍬', arcana: 'minor', suit: 'cups', num: 6,
    upright: '怀旧、纯真与馈赠', reversed: '沉溺过去、不愿长大',
    keywordsUp: ["nostalgia", "childhood", "innocence", "reunion", "simple kindness"], keywordsRev: ["stuck in the past", "rose-tinted memory", "leaving home", "growing up", "releasing old ties"],
    meaningUp: "Nostalgia, childhood, innocence, reunion, simple kindness", meaningRev: "Stuck in the past, rose-tinted memory, leaving home, growing up, releasing old ties",
    love: "past love, romantic nostalgia, reunion with an ex, innocent affection", career: "returning to a former career, familiar workplace, mentoring others, nostalgia influencing career choices", mood: "Nostalgic, sweet", spiritual: "healing the inner child, ancestral memories, spiritual innocence, reconnecting with simple joy",
    yesNo: '是', yesNoRev: '也许', element: 'Water', planet: 'Sun', zodiac: 'Scorpio'
  },
  {
    name: '圣杯七', en: 'Seven of Cups', icon: '🌈', arcana: 'minor', suit: 'cups', num: 7,
    upright: '幻想、选择过多而迷惘', reversed: '落地、看清现实',
    keywordsUp: ["choices", "fantasy", "illusion", "wishful thinking", "options"], keywordsRev: ["clarity", "decision made", "cutting through illusion", "overwhelm ending", "realism"],
    meaningUp: "Choices, fantasy, illusion, wishful thinking, options", meaningRev: "Clarity, decision made, cutting through illusion, overwhelm ending, realism",
    love: "romantic options, fantasy and idealization, unclear intentions, difficulty choosing a partner", career: "many career options, unrealistic expectations, scattered focus, choosing a practical path", mood: "Dreamy, indecisive", spiritual: "spiritual discernment, separating intuition from fantasy, many possible paths, grounding imagination",
    yesNo: '也许', yesNoRev: '也许', element: 'Water', planet: 'Venus', zodiac: 'Scorpio'
  },
  {
    name: '圣杯八', en: 'Eight of Cups', icon: '🚶', arcana: 'minor', suit: 'cups', num: 8,
    upright: '离开、寻更深的满足', reversed: '勉强留下、心已远走',
    keywordsUp: ["walking away", "seeking deeper meaning", "leaving behind", "disillusionment", "quest"], keywordsRev: ["fear of leaving", "returning", "avoidance", "staying too long", "unfinished departure"],
    meaningUp: "Walking away, seeking deeper meaning, leaving behind, disillusionment, quest", meaningRev: "Fear of leaving, returning, avoidance, staying too long, unfinished departure",
    love: "walking away from a relationship, seeking deeper fulfillment, emotional detachment, leaving what no longer satisfies", career: "leaving an unfulfilling job, seeking meaningful work, career transition, moving beyond stagnation", mood: "Wistful, restless", spiritual: "leaving an empty path, seeking deeper meaning, spiritual pilgrimage, releasing emotional attachment",
    yesNo: '否', yesNoRev: '否', element: 'Water', planet: 'Saturn', zodiac: 'Pisces'
  },
  {
    name: '圣杯九', en: 'Nine of Cups', icon: '😊', arcana: 'minor', suit: 'cups', num: 9,
    upright: '愿望达成、心满意足', reversed: '虚荣、表面的满足',
    keywordsUp: ["wishes fulfilled", "contentment", "satisfaction", "pleasure", "gratitude"], keywordsRev: ["superficial happiness", "greed", "unfulfilled wishes", "smugness", "inner lack"],
    meaningUp: "Wishes fulfilled, contentment, satisfaction, pleasure, gratitude", meaningRev: "Superficial happiness, greed, unfulfilled wishes, smugness, inner lack",
    love: "romantic satisfaction, emotional pleasure, receiving desired affection, enjoying love", career: "career satisfaction, desired professional outcome, rewarding achievement, enjoying success", mood: "Content, satisfied", spiritual: "spiritual contentment, gratitude, emotional fulfillment, appreciating present blessings",
    yesNo: '是', yesNoRev: '否', element: 'Water', planet: 'Jupiter', zodiac: 'Pisces'
  },
  {
    name: '圣杯十', en: 'Ten of Cups', icon: '🌈', arcana: 'minor', suit: 'cups', num: 10,
    upright: '圆满、家庭与归属感', reversed: '不和、理想落感',
    keywordsUp: ["lasting happiness", "family harmony", "emotional fulfillment", "love realized", "belonging"], keywordsRev: ["family discord", "broken harmony", "unrealistic ideals", "disconnection at home", "strained bonds"],
    meaningUp: "Lasting happiness, family harmony, emotional fulfillment, love realized, belonging", meaningRev: "Family discord, broken harmony, unrealistic ideals, disconnection at home, strained bonds",
    love: "lasting happiness, emotional security, harmonious family life, fulfilled partnership", career: "harmonious workplace, meaningful career, supportive team, long-term professional fulfillment", mood: "Loving, fulfilled", spiritual: "spiritual harmony, shared emotional fulfillment, loving community, alignment of heart and home",
    yesNo: '是', yesNoRev: '否', element: 'Water', planet: 'Mars', zodiac: 'Pisces'
  },
  {
    name: '圣杯侍从', en: 'Page of Cups', icon: '🐟', arcana: 'minor', suit: 'cups', num: 11,
    upright: '温柔的创意与心动', reversed: '情绪化、幼稚',
    keywordsUp: ["emotional openness", "creative message", "intuition budding", "sensitivity", "sweet surprise"], keywordsRev: ["emotional immaturity", "moodiness", "blocked creativity", "escapism", "oversensitivity"],
    meaningUp: "Emotional openness, creative message, intuition budding, sensitivity, sweet surprise", meaningRev: "Emotional immaturity, moodiness, blocked creativity, escapism, oversensitivity",
    love: "sweet romantic message, innocent crush, emotional vulnerability, unexpected expression of affection", career: "creative study, encouraging career news, beginner opportunity, intuitive professional idea", mood: "Playful, sensitive", spiritual: "intuitive message, gentle spiritual awakening, emotional openness, creative sensitivity",
    yesNo: '是', yesNoRev: '也许', element: 'Water', planet: '', zodiac: 'Cancer, Scorpio, Pisces'
  },
  {
    name: '圣杯骑士', en: 'Knight of Cups', icon: '🕊️', arcana: 'minor', suit: 'cups', num: 12,
    upright: '浪漫、邀约与理想主义', reversed: '浮夸、言而无信',
    keywordsUp: ["romance", "charm", "invitation", "following the heart", "idealism"], keywordsRev: ["unrealistic promises", "moodiness", "disillusionment", "flattery", "heart over head gone wrong"],
    meaningUp: "Romance, charm, invitation, following the heart, idealism", meaningRev: "Unrealistic promises, moodiness, disillusionment, flattery, heart over head gone wrong",
    love: "romantic proposal, heartfelt pursuit, charm and affection, following the heart", career: "following a vocation, persuasive proposal, creative profession, idealistic career move", mood: "Romantic, idealistic", spiritual: "following the heart鈥檚 calling, devotional journey, spiritual idealism, offering compassion",
    yesNo: '是', yesNoRev: '也许', element: 'Water', planet: 'Jupiter', zodiac: 'Pisces'
  },
  {
    name: '圣杯王后', en: 'Queen of Cups', icon: '🫧', arcana: 'minor', suit: 'cups', num: 13,
    upright: '共情、温柔而通透', reversed: '情绪淹没、过度敏感',
    keywordsUp: ["compassion", "emotional depth", "intuition", "nurturing presence", "empathy"], keywordsRev: ["emotional overwhelm", "codependency", "martyrdom", "boundaries dissolved", "manipulation through feeling"],
    meaningUp: "Compassion, emotional depth, intuition, nurturing presence, empathy", meaningRev: "Emotional overwhelm, codependency, martyrdom, boundaries dissolved, manipulation through feeling",
    love: "deep emotional support, intuitive love, compassion, strong emotional connection", career: "empathetic leadership, caring profession, emotional intelligence, supportive workplace", mood: "Empathic, calm", spiritual: "deep intuition, compassionate presence, emotional wisdom, receptive spiritual awareness",
    yesNo: '是', yesNoRev: '也许', element: 'Water', planet: 'Moon', zodiac: 'Cancer'
  },
  {
    name: '圣杯国王', en: 'King of Cups', icon: '🌊', arcana: 'minor', suit: 'cups', num: 14,
    upright: '情绪稳定、包容的智者', reversed: '压抑情感、冷暴力',
    keywordsUp: ["emotional mastery", "calm authority", "diplomacy", "balance of heart and head", "wise counsel"], keywordsRev: ["repressed emotion", "coldness", "manipulation", "moodiness in power", "emotional volatility"],
    meaningUp: "Emotional mastery, calm authority, diplomacy, balance of heart and head, wise counsel", meaningRev: "Repressed emotion, coldness, manipulation, moodiness in power, emotional volatility",
    love: "emotionally mature love, steady affection, balanced feelings, compassionate partnership", career: "diplomatic leadership, calm management, emotional maturity, balancing people and results", mood: "Steady, gracious", spiritual: "emotional mastery, compassionate leadership, balanced spirituality, calm inner authority",
    yesNo: '是', yesNoRev: '也许', element: 'Water', planet: 'Mars', zodiac: 'Scorpio'
  },
  {
    name: '宝剑王牌', en: 'Ace of Swords', icon: '⚡', arcana: 'minor', suit: 'swords', num: 1,
    upright: '清明、真相与突破', reversed: '混乱、误用的锋利',
    keywordsUp: ["clarity", "breakthrough", "truth", "new idea", "mental sharpness"], keywordsRev: ["confusion", "clouded judgment", "misused intellect", "harsh words", "false clarity"],
    meaningUp: "Clarity, breakthrough, truth, new idea, mental sharpness", meaningRev: "Confusion, clouded judgment, misused intellect, harsh words, false clarity",
    love: "honest communication, relationship clarity, revealing the truth, a decisive romantic conversation", career: "breakthrough idea, decisive communication, intellectual clarity, new professional strategy", mood: "Sharp, alert", spiritual: "spiritual breakthrough, clarity of truth, awakened perception, cutting through illusion",
    yesNo: '是', yesNoRev: '否', element: 'Air', planet: '', zodiac: 'Gemini, Libra, Aquarius'
  },
  {
    name: '宝剑二', en: 'Two of Swords', icon: '🙈', arcana: 'minor', suit: 'swords', num: 2,
    upright: '纠结、不愿面对', reversed: '逃避无门、被迫抉择',
    keywordsUp: ["stalemate", "difficult choice", "avoidance", "blocked feelings", "truce"], keywordsRev: ["decision forced", "information revealed", "stalemate breaking", "anxiety", "release of denial"],
    meaningUp: "Stalemate, difficult choice, avoidance, blocked feelings, truce", meaningRev: "Decision forced, information revealed, stalemate breaking, anxiety, release of denial",
    love: "romantic indecision, emotional stalemate, avoiding a decision, blocked communication", career: "career indecision, stalled negotiation, avoiding a professional choice, limited information", mood: "Torn, guarded", spiritual: "blocked intuition, spiritual indecision, inner conflict, finding stillness before choosing",
    yesNo: '也许', yesNoRev: '也许', element: 'Air', planet: 'Moon', zodiac: 'Libra'
  },
  {
    name: '宝剑三', en: 'Three of Swords', icon: '💔', arcana: 'minor', suit: 'swords', num: 3,
    upright: '心碎、分离的痛', reversed: '疗愈开始、释怀',
    keywordsUp: ["heartbreak", "painful truth", "grief", "sorrow", "separation"], keywordsRev: ["healing heartbreak", "forgiveness", "releasing pain", "recovery", "old wounds resurfacing"],
    meaningUp: "Heartbreak, painful truth, grief, sorrow, separation", meaningRev: "Healing heartbreak, forgiveness, releasing pain, recovery, old wounds resurfacing",
    love: "heartbreak, separation, painful truth, emotional betrayal", career: "professional disappointment, workplace conflict, job rejection, difficult feedback", mood: "Hurt, raw", spiritual: "truth revealed through pain, healing spiritual wounds, releasing sorrow, growth through acceptance",
    yesNo: '否', yesNoRev: '也许', element: 'Air', planet: 'Saturn', zodiac: 'Libra'
  },
  {
    name: '宝剑四', en: 'Four of Swords', icon: '🛌', arcana: 'minor', suit: 'swords', num: 4,
    upright: '休憩、养精蓄锐', reversed: '无法安睡、焦躁',
    keywordsUp: ["rest", "recovery", "retreat", "stillness", "recharging"], keywordsRev: ["burnout", "restlessness", "forced rest", "returning to action", "exhaustion ignored"],
    meaningUp: "Rest, recovery, retreat, stillness, recharging", meaningRev: "Burnout, restlessness, forced rest, returning to action, exhaustion ignored",
    love: "taking space in a relationship, emotional recovery, temporary separation, time to reflect", career: "career break, recovery from burnout, strategic pause, preparing your next move", mood: "Quiet, tired", spiritual: "meditation and retreat, spiritual rest, mental renewal, quiet integration",
    yesNo: '也许', yesNoRev: '也许', element: 'Air', planet: 'Jupiter', zodiac: 'Libra'
  },
  {
    name: '宝剑五', en: 'Five of Swords', icon: '🌬️', arcana: 'minor', suit: 'swords', num: 5,
    upright: '得不偿失的争执', reversed: '和解、放下输赢',
    keywordsUp: ["hollow victory", "conflict", "winning at all costs", "discord", "self-interest"], keywordsRev: ["reconciliation", "making amends", "releasing resentment", "lingering grudges", "lesson learned"],
    meaningUp: "Hollow victory, conflict, winning at all costs, discord, self-interest", meaningRev: "Reconciliation, making amends, releasing resentment, lingering grudges, lesson learned",
    love: "relationship conflict, hurtful communication, selfish behavior, winning at the cost of intimacy", career: "workplace conflict, unethical competition, damaged professional trust, hollow victory", mood: "Bitter, conflicted", spiritual: "examining ego conflict, consequences of harmful choices, spiritual humility, choosing peace over victory",
    yesNo: '否', yesNoRev: '也许', element: 'Air', planet: 'Venus', zodiac: 'Aquarius'
  },
  {
    name: '宝剑六', en: 'Six of Swords', icon: '🚣', arcana: 'minor', suit: 'swords', num: 6,
    upright: '过渡、带着伤离去', reversed: '困在原地、难以抽身',
    keywordsUp: ["transition", "moving on", "calmer waters", "passage", "gradual healing"], keywordsRev: ["resisting transition", "unfinished business", "rough crossing", "returning to trouble", "stuck baggage"],
    meaningUp: "Transition, moving on, calmer waters, passage, gradual healing", meaningRev: "Resisting transition, unfinished business, rough crossing, returning to trouble, stuck baggage",
    love: "moving on from conflict, emotional transition, healing together, leaving relationship difficulties behind", career: "moving to a better role, gradual career recovery, relocation for work, leaving difficulties behind", mood: "Subdued but relieved", spiritual: "spiritual transition, moving toward clarity, gradual healing, leaving troubled thoughts behind",
    yesNo: '是', yesNoRev: '否', element: 'Air', planet: 'Mercury', zodiac: 'Aquarius'
  },
  {
    name: '宝剑七', en: 'Seven of Swords', icon: '🤫', arcana: 'minor', suit: 'swords', num: 7,
    upright: '机变、走捷径', reversed: '被看穿、自欺',
    keywordsUp: ["deception", "strategy", "acting alone", "getting away with it", "cunning"], keywordsRev: ["confession", "conscience", "exposure", "coming clean", "self-deception revealed"],
    meaningUp: "Deception, strategy, acting alone, getting away with it, cunning", meaningRev: "Confession, conscience, exposure, coming clean, self-deception revealed",
    love: "secrecy, dishonesty in love, avoiding commitment, hidden motives", career: "strategic planning, office politics, working independently, questionable professional tactics", mood: "Wary, calculating", spiritual: "self-deception, hidden motives, spiritual avoidance, need for honesty and integrity",
    yesNo: '否', yesNoRev: '也许', element: 'Air', planet: 'Moon', zodiac: 'Aquarius'
  },
  {
    name: '宝剑八', en: 'Eight of Swords', icon: '🕸️', arcana: 'minor', suit: 'swords', num: 8,
    upright: '自我设限、看似被困', reversed: '破局、看清出路',
    keywordsUp: ["feeling trapped", "self-restriction", "victim mindset", "mental prison", "paralysis"], keywordsRev: ["liberation", "new perspective", "self-empowerment", "blindfold removed", "taking responsibility"],
    meaningUp: "Feeling trapped, self-restriction, victim mindset, mental prison, paralysis", meaningRev: "Liberation, new perspective, self-empowerment, blindfold removed, taking responsibility",
    love: "feeling trapped in a relationship, fear of leaving, limiting beliefs about love, emotional powerlessness", career: "feeling trapped at work, professional self-doubt, limited options, need for a new perspective", mood: "Anxious, stuck", spiritual: "self-imposed spiritual limits, restrictive beliefs, fear-based thinking, recognizing inner freedom",
    yesNo: '否', yesNoRev: '是', element: 'Air', planet: 'Jupiter', zodiac: 'Gemini'
  },
  {
    name: '宝剑九', en: 'Nine of Swords', icon: '😟', arcana: 'minor', suit: 'swords', num: 9,
    upright: '焦虑、深夜的忧思', reversed: '释然、不再内耗',
    keywordsUp: ["anxiety", "sleepless nights", "worry", "dread", "mental anguish"], keywordsRev: ["easing anxiety", "facing fears", "seeking help", "perspective returning", "recovery from despair"],
    meaningUp: "Anxiety, sleepless nights, worry, dread, mental anguish", meaningRev: "Easing anxiety, facing fears, seeking help, perspective returning, recovery from despair",
    love: "relationship anxiety, fear of rejection, guilt or regret, overthinking love", career: "job anxiety, fear of failure, work-related stress, overthinking career problems", mood: "Distressed, sleepless", spiritual: "spiritual anxiety, confronting fear, shadow thoughts, seeking peace through awareness",
    yesNo: '否', yesNoRev: '也许', element: 'Air', planet: 'Mars', zodiac: 'Gemini'
  },
  {
    name: '宝剑十', en: 'Ten of Swords', icon: '🌑', arcana: 'minor', suit: 'swords', num: 10,
    upright: '终结、触底后的清零', reversed: '缓过劲来、避免最坏',
    keywordsUp: ["painful ending", "rock bottom", "betrayal", "collapse", "the worst is over"], keywordsRev: ["recovery", "rising again", "surviving the ending", "old wounds closing", "refusing the final lesson"],
    meaningUp: "Painful ending, rock bottom, betrayal, collapse, the worst is over", meaningRev: "Recovery, rising again, surviving the ending, old wounds closing, refusing the final lesson",
    love: "painful ending, betrayal, relationship collapse, accepting that a romantic chapter is over", career: "job ending, failed project, professional betrayal, final career closure", mood: "Defeated, drained", spiritual: "ending a painful cycle, surrender after crisis, spiritual closure, beginning again after collapse",
    yesNo: '否', yesNoRev: '也许', element: 'Air', planet: 'Sun', zodiac: 'Gemini'
  },
  {
    name: '宝剑侍从', en: 'Page of Swords', icon: '🗡️', arcana: 'minor', suit: 'swords', num: 11,
    upright: '敏锐、求知的探询', reversed: '多嘴、冲动发言',
    keywordsUp: ["curiosity", "vigilance", "new ideas", "mental energy", "truth-seeking"], keywordsRev: ["gossip", "hasty words", "scattered thinking", "spying", "all talk"],
    meaningUp: "Curiosity, vigilance, new ideas, mental energy, truth-seeking", meaningRev: "Gossip, hasty words, scattered thinking, spying, all talk",
    love: "curious communication, watching from a distance, cautious interest, questioning a partner鈥檚 intentions", career: "professional research, sharp communication, new learning, monitoring opportunities", mood: "Inquisitive, alert", spiritual: "questioning beliefs, spiritual study, alert observation, seeking truth with curiosity",
    yesNo: '也许', yesNoRev: '否', element: 'Air', planet: '', zodiac: 'Gemini, Libra, Aquarius'
  },
  {
    name: '宝剑骑士', en: 'Knight of Swords', icon: '🌀', arcana: 'minor', suit: 'swords', num: 12,
    upright: '果断、疾速直击要害', reversed: '鲁莽、不顾后果',
    keywordsUp: ["decisive action", "ambition", "directness", "charging ahead", "intellectual drive"], keywordsRev: ["recklessness", "aggression", "rushing past details", "burnout sprint", "verbal attacks"],
    meaningUp: "Decisive action, ambition, directness, charging ahead, intellectual drive", meaningRev: "Recklessness, aggression, rushing past details, burnout sprint, verbal attacks",
    love: "direct romantic pursuit, intense conversations, rushing into a relationship, conflict through impulsive words", career: "fast career decisions, forceful ambition, intense debate, rushing into action", mood: "Intense, hasty", spiritual: "intense pursuit of truth, forceful conviction, mental urgency, balancing action with reflection",
    yesNo: '也许', yesNoRev: '否', element: 'Air', planet: 'Mercury', zodiac: 'Gemini'
  },
  {
    name: '宝剑王后', en: 'Queen of Swords', icon: '❄️', arcana: 'minor', suit: 'swords', num: 13,
    upright: '理性、清醒而独立', reversed: '苛刻、冷峻伤人',
    keywordsUp: ["clear judgment", "independence", "honest communication", "boundaries", "experienced wisdom"], keywordsRev: ["coldness", "bitterness", "harsh criticism", "isolation", "cynicism"],
    meaningUp: "Clear judgment, independence, honest communication, boundaries, experienced wisdom", meaningRev: "Coldness, bitterness, harsh criticism, isolation, cynicism",
    love: "clear boundaries, emotional independence, honest expectations, discerning relationship choices", career: "objective judgment, clear professional boundaries, independent expertise, direct communication", mood: "Clear, composed", spiritual: "spiritual discernment, honest self-reflection, clear energetic boundaries, wisdom through experience",
    yesNo: '也许', yesNoRev: '也许', element: 'Air', planet: 'Venus', zodiac: 'Libra'
  },
  {
    name: '宝剑国王', en: 'King of Swords', icon: '🧠', arcana: 'minor', suit: 'swords', num: 14,
    upright: '公正、智识的权威', reversed: '专制、巧言令色',
    keywordsUp: ["intellectual authority", "truth", "impartial judgment", "strategy", "ethical clarity"], keywordsRev: ["abuse of intellect", "cold ruthlessness", "manipulation", "rigid logic", "unjust judgment"],
    meaningUp: "Intellectual authority, truth, impartial judgment, strategy, ethical clarity", meaningRev: "Abuse of intellect, cold ruthlessness, manipulation, rigid logic, unjust judgment",
    love: "rational approach to love, serious communication, emotional restraint, fair and thoughtful partnership", career: "strategic leadership, authority through knowledge, ethical decisions, analytical mastery", mood: "Rational, authoritative", spiritual: "higher reasoning, ethical spiritual authority, disciplined thought, commitment to truth",
    yesNo: '也许', yesNoRev: '也许', element: 'Air', planet: 'Saturn', zodiac: 'Aquarius'
  },
  {
    name: '星币王牌', en: 'Ace of Pentacles', icon: '🪙', arcana: 'minor', suit: 'pentacles', num: 1,
    upright: '机会、踏实的新起点', reversed: '错失机遇、根基不稳',
    keywordsUp: ["new opportunity", "prosperity", "manifestation", "solid start", "material gift"], keywordsRev: ["missed opportunity", "shaky foundation", "scarcity thinking", "delayed reward", "poor investment"],
    meaningUp: "New opportunity, prosperity, manifestation, solid start, material gift", meaningRev: "Missed opportunity, shaky foundation, scarcity thinking, delayed reward, poor investment",
    love: "stable new relationship, practical commitment, building a secure future, dependable romantic opportunity", career: "new job opportunity, financial potential, practical career beginning, building professional security", mood: "Hopeful, grounded", spiritual: "grounded spiritual beginning, sacred opportunity, bringing insight into practice, connection with the physical world",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: '', zodiac: 'Taurus, Virgo, Capricorn'
  },
  {
    name: '星币二', en: 'Two of Pentacles', icon: '⚖️', arcana: 'minor', suit: 'pentacles', num: 2,
    upright: '灵活平衡、游刃有余', reversed: '顾此失彼、失衡',
    keywordsUp: ["juggling priorities", "adaptability", "balance in motion", "flexibility", "managing change"], keywordsRev: ["overcommitment", "dropped balls", "disorganization", "financial strain", "overwhelm"],
    meaningUp: "Juggling priorities, adaptability, balance in motion, flexibility, managing change", meaningRev: "Overcommitment, dropped balls, disorganization, financial strain, overwhelm",
    love: "balancing love and responsibilities, changing relationship priorities, adapting as a couple, romantic uncertainty", career: "balancing priorities, multiple jobs or projects, flexible workload, adapting to professional change", mood: "Busy, adaptable", spiritual: "balancing spiritual and practical life, adapting to change, energetic rhythm, staying centered amid movement",
    yesNo: '也许', yesNoRev: '否', element: 'Earth', planet: 'Jupiter', zodiac: 'Capricorn'
  },
  {
    name: '星币三', en: 'Three of Pentacles', icon: '🧱', arcana: 'minor', suit: 'pentacles', num: 3,
    upright: '协作、扎实的进展', reversed: '配合失调、敷衍',
    keywordsUp: ["teamwork", "craftsmanship", "skill recognized", "collaboration", "building together"], keywordsRev: ["poor teamwork", "mediocrity", "lack of recognition", "misaligned goals", "working alone"],
    meaningUp: "Teamwork, craftsmanship, skill recognized, collaboration, building together", meaningRev: "Poor teamwork, mediocrity, lack of recognition, misaligned goals, working alone",
    love: "teamwork in love, building a relationship together, mutual effort, learning how to support one another", career: "skilled teamwork, craftsmanship, professional collaboration, recognition for quality", mood: "Cooperative, engaged", spiritual: "spiritual learning through collaboration, shared practice, building something meaningful, honoring diverse gifts",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Mars', zodiac: 'Capricorn'
  },
  {
    name: '星币四', en: 'Four of Pentacles', icon: '🔒', arcana: 'minor', suit: 'pentacles', num: 4,
    upright: '守护、稳健持守', reversed: '吝啬、紧抓不放',
    keywordsUp: ["security", "holding on", "control", "saving", "possessiveness"], keywordsRev: ["letting go", "generosity", "loosening control", "financial release", "spending"],
    meaningUp: "Security, holding on, control, saving, possessiveness", meaningRev: "Letting go, generosity, loosening control, financial release, spending",
    love: "possessiveness, fear of vulnerability, holding tightly to a relationship, emotional control", career: "protecting your position, financial caution, resistance to career change, controlling resources", mood: "Cautious, guarded", spiritual: "attachment to security, blocked energy, fear of letting go, learning spiritual generosity",
    yesNo: '也许', yesNoRev: '也许', element: 'Earth', planet: 'Sun', zodiac: 'Capricorn'
  },
  {
    name: '星币五', en: 'Five of Pentacles', icon: '❄️', arcana: 'minor', suit: 'pentacles', num: 5,
    upright: '匮乏、寒夜中的艰难', reversed: '转机、走出低谷',
    keywordsUp: ["hardship", "scarcity", "feeling left out in the cold", "financial loss", "isolation"], keywordsRev: ["recovery", "help accepted", "hardship ending", "finding shelter", "renewed hope"],
    meaningUp: "Hardship, scarcity, feeling left out in the cold, financial loss, isolation", meaningRev: "Recovery, help accepted, hardship ending, finding shelter, renewed hope",
    love: "feeling rejected, loneliness in love, relationship hardship, supporting each other through difficulty", career: "unemployment or financial strain, workplace exclusion, difficult career period, seeking support", mood: "Discouraged, cold", spiritual: "spiritual isolation, crisis of faith, seeking support, finding meaning during hardship",
    yesNo: '否', yesNoRev: '是', element: 'Earth', planet: 'Mercury', zodiac: 'Taurus'
  },
  {
    name: '星币六', en: 'Six of Pentacles', icon: '🤲', arcana: 'minor', suit: 'pentacles', num: 6,
    upright: '给予、互惠与平衡', reversed: '施舍心态、不对等',
    keywordsUp: ["generosity", "giving and receiving", "support", "fairness", "charity"], keywordsRev: ["strings attached", "power imbalance", "one-sided giving", "debt", "self-neglect in giving"],
    meaningUp: "Generosity, giving and receiving, support, fairness, charity", meaningRev: "Strings attached, power imbalance, one-sided giving, debt, self-neglect in giving",
    love: "equal give and take, generosity in love, mutual support, balanced emotional effort", career: "fair compensation, professional mentoring, workplace support, balanced exchange", mood: "Generous, balanced", spiritual: "spiritual generosity, balanced giving and receiving, compassionate service, responsible use of resources",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Moon', zodiac: 'Taurus'
  },
  {
    name: '星币七', en: 'Seven of Pentacles', icon: '🌱', arcana: 'minor', suit: 'pentacles', num: 7,
    upright: '耕耘、等待回报', reversed: '焦躁、未见成效',
    keywordsUp: ["patience", "assessment", "long-term view", "slow growth", "waiting for harvest"], keywordsRev: ["impatience", "wasted effort", "poor returns", "giving up early", "misdirected work"],
    meaningUp: "Patience, assessment, long-term view, slow growth, waiting for harvest", meaningRev: "Impatience, wasted effort, poor returns, giving up early, misdirected work",
    love: "patience in a relationship, evaluating romantic progress, long-term investment, waiting for love to grow", career: "long-term career investment, reviewing progress, patient growth, waiting for results", mood: "Patient, evaluative", spiritual: "patient spiritual growth, reflecting on progress, trusting gradual development, tending long-term intentions",
    yesNo: '也许', yesNoRev: '否', element: 'Earth', planet: 'Saturn', zodiac: 'Taurus'
  },
  {
    name: '星币八', en: 'Eight of Pentacles', icon: '🔨', arcana: 'minor', suit: 'pentacles', num: 8,
    upright: '钻研、精益求精', reversed: '敷衍、低质量重复',
    keywordsUp: ["diligence", "skill-building", "craftsmanship", "dedication", "mastery through repetition"], keywordsRev: ["perfectionism", "tedium", "cut corners", "misplaced effort", "burnout from grind"],
    meaningUp: "Diligence, skill-building, craftsmanship, dedication, mastery through repetition", meaningRev: "Perfectionism, tedium, cut corners, misplaced effort, burnout from grind",
    love: "working on a relationship, consistent effort, improving communication, dedication to a partner", career: "skill development, disciplined work, apprenticeship, mastering a profession", mood: "Diligent, absorbed", spiritual: "dedicated spiritual practice, learning through repetition, disciplined growth, refining your craft",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Sun', zodiac: 'Virgo'
  },
  {
    name: '星币九', en: 'Nine of Pentacles', icon: '🍇', arcana: 'minor', suit: 'pentacles', num: 9,
    upright: '独立、丰盈的成果', reversed: '依赖、表面的富足',
    keywordsUp: ["self-sufficiency", "earned luxury", "independence", "refinement", "enjoying success"], keywordsRev: ["overdependence", "hollow success", "overwork without enjoyment", "financial insecurity", "self-worth tied to wealth"],
    meaningUp: "Self-sufficiency, earned luxury, independence, refinement, enjoying success", meaningRev: "Overdependence, hollow success, overwork without enjoyment, financial insecurity, self-worth tied to wealth",
    love: "independence in love, enjoying single life, healthy self-worth, a relationship that respects personal freedom", career: "independent success, financial self-sufficiency, refined expertise, enjoying earned rewards", mood: "Self-assured, serene", spiritual: "spiritual self-reliance, gratitude for abundance, embodied confidence, enjoying the fruits of growth",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Venus', zodiac: 'Virgo'
  },
  {
    name: '星币十', en: 'Ten of Pentacles', icon: '🏡', arcana: 'minor', suit: 'pentacles', num: 10,
    upright: '长久、家族与安稳', reversed: '散财、根基动摇',
    keywordsUp: ["legacy", "lasting wealth", "family security", "inheritance", "long-term foundations"], keywordsRev: ["family disputes over resources", "unstable foundations", "short-term thinking", "lost inheritance", "wealth without belonging"],
    meaningUp: "Legacy, lasting wealth, family security, inheritance, long-term foundations", meaningRev: "Family disputes over resources, unstable foundations, short-term thinking, lost inheritance, wealth without belonging",
    love: "long-term commitment, family stability, shared financial security, building a lasting legacy together", career: "lasting career stability, family business, wealth building, established professional legacy", mood: "Secure, proud", spiritual: "ancestral wisdom, lasting spiritual foundations, shared traditions, legacy and belonging",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Mercury', zodiac: 'Virgo'
  },
  {
    name: '星币侍从', en: 'Page of Pentacles', icon: '🌰', arcana: 'minor', suit: 'pentacles', num: 11,
    upright: '好学、务实的起点', reversed: '拖延、眼高手低',
    keywordsUp: ["studiousness", "new practical skill", "opportunity to learn", "grounded ambition", "diligent beginnings"], keywordsRev: ["procrastination", "lack of progress", "daydreaming without doing", "short-lived focus", "missed lessons"],
    meaningUp: "Studiousness, new practical skill, opportunity to learn, grounded ambition, diligent beginnings", meaningRev: "Procrastination, lack of progress, daydreaming without doing, short-lived focus, missed lessons",
    love: "sincere romantic interest, slowly developing relationship, practical offer of commitment, dependable new connection", career: "career training, entry-level opportunity, practical study, promising financial news", mood: "Studious, motivated", spiritual: "beginner鈥檚 spiritual study, practical learning, grounding a new intention, steady curiosity",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: '', zodiac: 'Taurus, Virgo, Capricorn'
  },
  {
    name: '星币骑士', en: 'Knight of Pentacles', icon: '🐂', arcana: 'minor', suit: 'pentacles', num: 12,
    upright: '稳健、一步一脚印', reversed: '迟钝、错失节奏',
    keywordsUp: ["reliability", "methodical progress", "hard work", "patience", "commitment to routine"], keywordsRev: ["stagnation", "boredom", "stubbornness", "workaholism", "stuck in a rut"],
    meaningUp: "Reliability, methodical progress, hard work, patience, commitment to routine", meaningRev: "Stagnation, boredom, stubbornness, workaholism, stuck in a rut",
    love: "loyal partner, slow and steady romance, reliable commitment, building trust over time", career: "reliable progress, consistent work, long-term commitment, methodical career growth", mood: "Methodical, steady", spiritual: "consistent spiritual practice, devotion through routine, patient progress, grounded commitment",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Saturn', zodiac: 'Capricorn'
  },
  {
    name: '星币王后', en: 'Queen of Pentacles', icon: '🌻', arcana: 'minor', suit: 'pentacles', num: 13,
    upright: '务实、温暖而丰足', reversed: '过度操劳、忽略自己',
    keywordsUp: ["nurturing practicality", "resourcefulness", "warmth and security", "working provider", "down-to-earth care"], keywordsRev: ["self-neglect", "work-home imbalance", "smothering through providing", "financial codependence", "depleted caregiver"],
    meaningUp: "Nurturing practicality, resourcefulness, warmth and security, working provider, down-to-earth care", meaningRev: "Self-neglect, work-home imbalance, smothering through providing, financial codependence, depleted caregiver",
    love: "nurturing partnership, practical affection, emotional and material security, creating a comfortable home", career: "practical leadership, resource management, work-life balance, creating a secure workplace", mood: "Nurturing, practical", spiritual: "earth-centered spirituality, nurturing presence, practical wisdom, creating sacred comfort",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Mercury', zodiac: 'Virgo'
  },
  {
    name: '星币国王', en: 'King of Pentacles', icon: '🏔️', arcana: 'minor', suit: 'pentacles', num: 14,
    upright: '可靠、富足的掌舵者', reversed: '贪婪、守财',
    keywordsUp: ["material mastery", "abundance", "steady leadership", "business acumen", "reliable provider"], keywordsRev: ["greed", "materialism", "rigid control of resources", "status obsession", "corruption of comfort"],
    meaningUp: "Material mastery, abundance, steady leadership, business acumen, reliable provider", meaningRev: "Greed, materialism, rigid control of resources, status obsession, corruption of comfort",
    love: "dependable commitment, protective partnership, long-term stability, providing security in love", career: "business success, financial leadership, dependable authority, long-term prosperity", mood: "Assured, generous", spiritual: "spiritual stewardship, grounded mastery, wise use of abundance, stable and generous leadership",
    yesNo: '是', yesNoRev: '否', element: 'Earth', planet: 'Venus', zodiac: 'Taurus'
  },
]

// 三张时间牌阵的槽位标签
export const TAROT_POSITIONS = ['过去', '现在', '未来']

// 凯尔特十字十张大牌阵：经典的十字+权杖结构，覆盖当下/阻碍/根源/未来/期许/潜流/
// 自处/环境/隐忧/终局。每个槽位带一句提示，帮助理解该位置在牌阵里的含义。
export const CELTIC_POSITIONS = [
  { name: '现状', hint: '你正身处的当下处境' },
  { name: '挑战', hint: '横亘眼前的阻碍' },
  { name: '根源', hint: '形塑现状的过去根基' },
  { name: '近因', hint: '近来仍起作用的影响' },
  { name: '期许', hint: '你心之所向的可能' },
  { name: '潜流', hint: '潜意识里的内在驱动' },
  { name: '自处', hint: '你应对此事的态度' },
  { name: '环境', hint: '外部的人与境遇' },
  { name: '隐忧', hint: '心底的希望与恐惧' },
  { name: '终局', hint: '事情最终的走向' },
]

// 元素 → 点缀色（天体色系，呼应星空神秘感）
export const ELEMENT_THEME = {
  wands: { label: '火 · 行动', color: '#e0915a' },
  cups: { label: '水 · 情感', color: '#6fa8d6' },
  swords: { label: '风 · 思维', color: '#cdd6e8' },
  pentacles: { label: '土 · 物质', color: '#8fbf9a' },
  major: { label: '灵 · 命运', color: '#b89be0' },
}