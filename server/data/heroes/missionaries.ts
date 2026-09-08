import type { RawHero } from "./types";

/**
 * The modern missionary movement, which begins with a Northamptonshire
 * cobbler being told to sit down and stop asking awkward questions.
 */
export const missionaries: RawHero[] = [
  {
    id: "william-carey",
    name: "William Carey",
    group: "missionaries",
    wikipedia: "William Carey (missionary)",
    timePeriod: "1761 - 1834",
    birthYear: "1761",
    deathYear: "1834",
    place: "Serampore, India",
    description:
      "A village cobbler who taught himself six languages over his workbench and started the modern missionary movement almost single-handed.",
    contribution:
      "Argued that the Great Commission still binds the church, went to India himself, and translated Scripture into dozens of Indian languages.",
    biography:
      "Carey mended shoes for a living and hung a homemade map of the world above his bench, marking what he could learn about each country. He taught himself Latin, Greek, Hebrew, Dutch and French while working.\n\nAt a ministers' meeting he proposed discussing whether the command to make disciples of all nations still applied. An older minister is said to have told him to sit down — that if God intended to convert the heathen, he would do it without Carey's help. Carey wrote a pamphlet instead, An Enquiry into the Obligations of Christians to Use Means for the Conversion of the Heathens, laying out the world's population, its religions, and the church's excuses. A missionary society was formed the following year, and Carey sailed.\n\nIndia went badly for a long time. The East India Company obstructed missionaries, so he settled in Danish-held Serampore. His first convert came after seven years. His son died; his wife Dorothy, who had never wanted to go, suffered a mental collapse from which she did not recover, and he cared for her for years while she was at times violent toward him.\n\nHe was a natural linguist and put that to work: he and his colleagues translated the Bible in whole or part into more than thirty languages, produced grammars and dictionaries, and founded a college. He also campaigned for years against sati, the burning of widows, which was outlawed in 1829 — and Carey, hearing on a Sunday morning, skipped his sermon to translate the decree so it could take effect that day.",
    complications:
      "The Serampore mission's early translations were rushed and some were poor; Carey said so himself and spent decades revising. His treatment of Dorothy is hard to read about, and biographers disagree about how much he could have done differently.",
    famousQuote: "Expect great things from God; attempt great things for God.",
    bibleVerse: {
      text: "Enlarge the place of your tent... lengthen your cords and strengthen your stakes.",
      reference: "Isaiah 54:2",
    },
    keyEvents: [
      { year: "1792", description: "Publishes An Enquiry, arguing the Great Commission still binds the church" },
      { year: "1793", description: "Sails for India" },
      { year: "1800", description: "Settles at Serampore; sees his first Indian convert" },
      { year: "1801", description: "Publishes the Bengali New Testament" },
      { year: "1818", description: "Founds Serampore College" },
      { year: "1829", description: "Sati is outlawed after his long campaign; he translates the decree the same day" },
    ],
    tags: ["india", "bible translation", "linguist", "cobbler", "serampore", "sati", "missions"],
    sources: [
      { title: "An Enquiry into the Obligations of Christians", author: "William Carey", type: "book" },
      { title: "Faithful Witness: The Life and Mission of William Carey", author: "Timothy George", type: "book" },
    ],
  },
  {
    id: "adoniram-judson",
    name: "Adoniram Judson",
    group: "missionaries",
    wikipedia: "Adoniram Judson",
    timePeriod: "1788 - 1850",
    birthYear: "1788",
    deathYear: "1850",
    place: "Burma",
    description:
      "America's first foreign missionary, who spent nearly two years in a Burmese death prison and still finished his Bible translation.",
    contribution:
      "The Burmese Bible, still in use, and a dictionary that outlasted him — plus the beginning of American foreign missions.",
    biography:
      "Judson was a brilliant student who lost his faith at college under the influence of a clever friend, and got it back after that friend died in a room next to his at an inn. He read for the ministry, and when he and a handful of students petitioned to be sent abroad, American churches had no machinery to send them. They built one.\n\nHe married Ann Hasseltine and sailed in 1812. During the voyage both of them studied the question of baptism, changed their minds, and arrived as Baptists — cutting themselves off from the society that had sent them.\n\nThey settled in Burma. It took six years to see a single convert. Judson worked at the language relentlessly, producing a Burmese grammar and eventually the whole Bible.\n\nWhen war broke out between Britain and Burma in 1824, Judson was arrested as a suspected spy and held for seventeen months in conditions designed to kill — leg irons, a death prison, and a forced march that left his feet ruined. Ann bribed guards, brought food, petitioned officials, and hid the manuscript of his translation inside a hard pillow that the guards thought worthless. She died within a year of his release; so did their daughter.\n\nHe remarried twice and was widowed again. He finished the Burmese Bible in 1834 and the dictionary shortly before he died at sea. Burma's Christian population today is largely traceable to that work.",
    famousQuote: "The future is as bright as the promises of God.",
    bibleVerse: {
      text: "In the world you will have tribulation. But take heart; I have overcome the world.",
      reference: "John 16:33",
    },
    keyEvents: [
      { year: "1812", description: "Sails as one of America's first foreign missionaries" },
      { year: "1819", description: "Baptises his first Burmese convert after six years" },
      { year: "1824", description: "Imprisoned for seventeen months as a suspected spy" },
      { year: "1826", description: "Ann Judson dies shortly after his release" },
      { year: "1834", description: "Completes the Burmese Bible" },
      {
        year: "1849",
        description: "Completes the English-Burmese half of his dictionary",
        dateNote: "He finished the English-Burmese portion in 1849; the Burmese-English half was completed after his death by a colleague. The article does not give the year.",
      },
    ],
    tags: ["burma", "myanmar", "bible translation", "prison", "america", "baptist", "missions"],
    sources: [
      { title: "To the Golden Shore: The Life of Adoniram Judson", author: "Courtney Anderson", type: "book" },
    ],
  },
  {
    id: "hudson-taylor",
    name: "Hudson Taylor",
    group: "missionaries",
    wikipedia: "Hudson Taylor",
    timePeriod: "1832 - 1905",
    birthYear: "1832",
    deathYear: "1905",
    place: "China",
    description:
      "An Englishman who wore Chinese clothes and grew a queue, scandalising other missionaries, and opened the interior of China.",
    contribution:
      "Founded the China Inland Mission, which recruited working people and women, took no salary guarantees, and went where no one else would.",
    biography:
      "Taylor trained as a doctor and sailed for China at twenty-one with almost no support. What he found on arrival was that European missionaries lived in the treaty ports in European dress and rarely went inland.\n\nHe adopted Chinese clothing and hairstyle — which appalled his colleagues, who thought it undignified — because it let him travel and be heard. It became the mission's practice.\n\nIll health forced him home in 1860, and for five years he was tormented by the number of Chinese provinces with no missionary at all. On a beach at Brighton in 1865, unable to bear it, he wrote in his Bible that he was asking God for twenty-four willing workers. The China Inland Mission began that day.\n\nIt was organised on unusual principles. It accepted people without university education, sent single women inland, was directed from China rather than London, and asked no one for money — supporters were told the mission would make its needs known to God and not to them. Taylor called it faith missions, and many others copied it.\n\nHe buried his first wife Maria and four of their children. During the Boxer Rebellion in 1900 the mission lost fifty-eight missionaries and twenty-one children, more than any other society; Taylor, by then old and ill, refused compensation from the Chinese government, saying it would not honour the dead and would harm the gospel.\n\nBy his death the mission had over eight hundred workers.",
    famousQuote: "God's work done in God's way will never lack God's supply.",
    bibleVerse: {
      text: "Have faith in God.",
      reference: "Mark 11:22",
    },
    keyEvents: [
      { year: "1853", description: "Sails for China at twenty-one" },
      { year: "1855", description: "Adopts Chinese dress to travel inland, to his colleagues' disapproval" },
      { year: "1865", description: "Founds the China Inland Mission on Brighton beach" },
      { year: "1870", description: "His wife Maria dies; four of their children die in childhood" },
      { year: "1900", description: "The Boxer Rebellion kills 58 CIM missionaries; he refuses compensation" },
    ],
    tags: ["china", "faith missions", "medicine", "boxer rebellion", "cultural adaptation", "missions"],
    sources: [
      { title: "Hudson Taylor's Spiritual Secret", author: "Howard and Geraldine Taylor", type: "book" },
    ],
  },
  {
    id: "mary-slessor",
    name: "Mary Slessor",
    group: "missionaries",
    wikipedia: "Mary Slessor",
    timePeriod: "1848 - 1915",
    birthYear: "1848",
    deathYear: "1915",
    place: "Calabar, Nigeria",
    description:
      "A Dundee mill girl who went to Nigeria alone, lived in the villages rather than the compound, and rescued hundreds of abandoned twins.",
    contribution:
      "Ended the killing of twins in the regions where she worked, and became the first woman appointed a magistrate in the British Empire.",
    biography:
      "Slessor started work in a Dundee jute mill at eleven, doing half days at the factory and half at school. Her father was an alcoholic and the family was poor. She read constantly, propping books on the loom.\n\nShe went to Calabar in 1876 at twenty-eight. Unlike most missionaries she refused to live in the European compound, moving instead into villages, eating local food, learning Efik until she dreamed in it, and going barefoot. She was frequently ill with malaria and kept going back.\n\nThe practice that defined her work was the killing of twins. In the culture she encountered, a twin birth was believed to mean that one child had been fathered by an evil spirit; both infants were usually killed and the mother driven out. Slessor took the babies. She raised many herself and placed others, and over years of arguing, sheltering and simply refusing to leave, the practice ended in the areas where she worked.\n\nShe also walked into conflicts between villages as a mediator, sometimes for days, and was trusted by both sides often enough that the British colonial administration made her a vice-consul in 1892 — the first woman to hold judicial office in the Empire. She held court under a tree.\n\nShe never married. She wrote home that she was not brave, only that she had learned it was safer to obey than to worry.",
    famousQuote: "Christ never was in a hurry. There was no rushing forward, no anticipating, no fretting over what might be.",
    bibleVerse: {
      text: "Religion that is pure and undefiled before God is this: to visit orphans and widows in their affliction.",
      reference: "James 1:27",
    },
    keyEvents: [
      { year: "1859", description: "Starts work in a Dundee jute mill at eleven" },
      { year: "1876", description: "Sails for Calabar at twenty-eight" },
      { year: "1888", description: "Moves inland to Okoyong, living in the villages" },
      { year: "1892", description: "Appointed vice-consul, the first woman magistrate in the Empire" },
      { year: "1915", description: "Dies in Nigeria after nearly forty years there" },
    ],
    tags: ["nigeria", "calabar", "twins", "women", "scotland", "magistrate", "missions"],
    sources: [
      { title: "Mary Slessor of Calabar", author: "W. P. Livingstone", type: "book" },
    ],
  },
  {
    id: "george-mueller",
    name: "George Müller",
    group: "missionaries",
    wikipedia: "George Müller",
    timePeriod: "1805 - 1898",
    birthYear: "1805",
    deathYear: "1898",
    place: "Bristol, England",
    description: "A former thief and swindler who housed ten thousand orphans and never once asked anyone for money.",
    contribution: "Built five orphan houses in Bristol on the principle of telling God his needs and no one else, and kept accounts to prove it.",
    biography:
      "Müller was a spectacularly bad young man by his own account -- a thief, a drunk, and a forger of documents, jailed at sixteen while his father believed he was studying for the ministry. He was converted at twenty at a small prayer meeting in a private house, and the change held.\n\nHe came to England intending to be a missionary to Jews, ended up pastoring in Bristol, and refused a salary, asking the congregation to remove the pew rents that made the rich more welcome than the poor.\n\nThe orphan work began in 1836 with thirty girls in a rented house. It grew to five large houses on Ashley Down holding two thousand children at a time, and over sixty years cared for more than ten thousand.\n\nThe part that made him famous was the method. He never made an appeal, never took a collection for the orphans, and never told anyone but God what was needed. He kept meticulous accounts and published them annually, which was the point: he wanted a public, auditable demonstration that God answers prayer.\n\nThe stories that survive are specific. On one morning the children sat at empty tables and he gave thanks for breakfast; a baker knocked, unable to sleep and convinced he should bake bread for them, and a milkman s cart broke down outside and he gave away the milk rather than lose it.\n\nHe began preaching abroad at seventy and travelled some two hundred thousand miles before he stopped.",
    famousQuote: "The beginning of anxiety is the end of faith, and the beginning of true faith is the end of anxiety.",
    bibleVerse: {"text":"Father of the fatherless and protector of widows is God in his holy habitation.","reference":"Psalm 68:5"},
    keyEvents: [
      { year: "1825", description: "Converted at twenty at a prayer meeting in Halle" },
      { year: "1830", description: "Refuses a salary and abolishes pew rents at his Bristol chapel" },
      { year: "1836", description: "Opens the first orphan house with thirty girls" },
      { year: "1849", description: "The first of the large houses opens on Ashley Down" },
      { year: "1875", description: "Begins seventeen years of preaching tours at seventy" },
    ],
    tags: ["orphans","bristol","prayer","faith","germany","accounts","children"],
    sources: [],
  },
  {
    id: "amy-carmichael",
    name: "Amy Carmichael",
    group: "missionaries",
    wikipedia: "Amy Carmichael",
    timePeriod: "1867 - 1951",
    birthYear: "1867",
    deathYear: "1951",
    place: "Dohnavur, India",
    description: "She went to India for one year, stayed fifty-five without a furlough, and rescued children sold into temple prostitution.",
    contribution: "Founded the Dohnavur Fellowship, which took in children in danger, and wrote thirty-five books, many from her bed.",
    biography:
      "Carmichael was Irish, prone to illness, and had been told as a child that praying for blue eyes would work; it did not, and she wrote later that she understood why when she needed brown eyes to pass unnoticed in India.\n\nShe went first to Japan, was invalided home, and then to south India in 1895. She never came back. Fifty-five years without a furlough was unusual even then.\n\nHer work found her rather than the reverse. In 1901 a seven-year-old girl named Preena escaped from a Hindu temple where she had been given as a child servant, a practice that in many cases meant prostitution, and found her way to Carmichael. Rescuing such children became the work of her life, and it was dangerous and legally precarious -- she was accused of kidnapping, and worked at the edge of what the authorities would tolerate.\n\nDohnavur grew into a compound housing hundreds. She dressed in Indian clothes, dyed her skin with coffee to go into the temple areas at night, and refused to let the children be called converts or be photographed for fundraising.\n\nIn 1931 she fell into a pit, broke her leg and was largely bedridden for the remaining twenty years, which is when most of the books were written. She asked for no gravestone; the children put a birdbath over her with the single word Amma, mother.",
    famousQuote: "You can give without loving, but you cannot love without giving.",
    bibleVerse: {"text":"Rescue those who are being taken away to death.","reference":"Proverbs 24:11"},
    keyEvents: [
      { year: "1895", description: "Arrives in south India" },
      { year: "1901", description: "Preena escapes a temple and comes to her; the rescue work begins" },
      { year: "1926", description: "Formally founds the Dohnavur Fellowship" },
      {
        year: "1931",
        description: "A fall leaves her largely bedridden for twenty years",
        dateNote: "From the Dohnavur accounts of her accident; her article does not date it.",
      },
      { year: "1951", description: "Dies at Dohnavur after fifty-five years without a furlough" },
    ],
    tags: ["india","children","dohnavur","temple","ireland","rescue","suffering"],
    sources: [],
  },
  {
    id: "eric-liddell",
    name: "Eric Liddell",
    group: "missionaries",
    wikipedia: "Eric Liddell",
    timePeriod: "1902 - 1945",
    birthYear: "1902",
    deathYear: "1945",
    place: "Scotland and China",
    description: "An Olympic champion who refused to run on a Sunday, then gave up athletics entirely for China and died in an internment camp.",
    contribution: "Won the 400 metres at the 1924 Olympics in a world record, and spent the rest of his life teaching in China.",
    biography:
      "Liddell was born in China to missionary parents and sent to school in Britain. He was the fastest man in Scotland and a rugby international, and by 1924 was expected to win the Olympic 100 metres.\n\nWhen the heats were scheduled for a Sunday he withdrew, months in advance, and trained instead for the 400 -- not his event. He won it in 47.6 seconds, a world record. The story is well known from the film Chariots of Fire, which compresses the timeline; he knew about the schedule long before he reached Paris.\n\nWhat the film leaves out is everything after. Within a year he returned to China as a missionary teacher, and taught science and sport at an Anglo-Chinese college in Tianjin for two decades.\n\nWhen the Japanese occupation made things dangerous he sent his pregnant wife and daughters to Canada and stayed. In 1943 he was interned at Weihsien camp with some fifteen hundred others.\n\nSurvivors remembered him as the man who organised games for the teenagers, taught, carried coal for the elderly, and refereed on Sundays after concluding that the children fighting was worse than the principle. He died of an undiagnosed brain tumour in February 1945, five months before liberation. His last recorded words were about surrender.",
    famousQuote: "I believe God made me for a purpose, but he also made me fast. And when I run I feel his pleasure.",
    bibleVerse: {"text":"Those who honour me I will honour.","reference":"1 Samuel 2:30"},
    keyEvents: [
      { year: "1924", description: "Withdraws from the Olympic 100m rather than run on a Sunday" },
      { year: "1924", description: "Wins the 400m in a world record 47.6 seconds" },
      { year: "1925", description: "Returns to China as a missionary teacher" },
      { year: "1943", description: "Interned by the Japanese at Weihsien camp" },
      { year: "1945", description: "Dies of a brain tumour five months before liberation" },
    ],
    tags: ["olympics","athletics","china","sabbath","internment","scotland","teacher"],
    sources: [],
  },
  {
    id: "jim-elliot",
    name: "Jim Elliot",
    group: "missionaries",
    wikipedia: "Jim Elliot",
    timePeriod: "1927 - 1956",
    birthYear: "1927",
    deathYear: "1956",
    place: "Ecuador",
    description: "Killed at twenty-eight on a sandbar in Ecuador by the people he had come to reach.",
    contribution: "One of five men killed in Operation Auca, whose deaths and the aftermath reshaped a generation of missionary thinking.",
    biography:
      "Elliot was a wrestler and a Greek student at Wheaton, and by his early twenties had decided on the Amazon. His journals from that period are full of a young man arguing himself into total commitment, and they contain the line he is remembered for, written at twenty-two: he is no fool who gives what he cannot keep to gain what he cannot lose.\n\nHe married Elisabeth Howard in Ecuador in 1953, after five years of hesitation on his side that she wrote about frankly.\n\nIn 1955 he and four others -- Nate Saint, Ed McCully, Peter Fleming and Roger Youderian -- began dropping gifts by plane to the Waorani, a people with a homicide rate so high that a majority of adult deaths were killings, and who had speared oil company workers.\n\nIn January 1956 they landed on a sandbar on the Curaray river. There was a first friendly contact. Days later, on 8 January, all five were speared to death. They carried firearms and did not use them, having agreed beforehand that they would not kill people who were not ready to die.\n\nWhat followed is the reason the story is told. Elisabeth Elliot and Rachel Saint, Nate s sister, went to live among the Waorani. Several of the killers became Christians. One of them later baptised Nate Saint s children.",
    famousQuote: "He is no fool who gives what he cannot keep to gain what he cannot lose.",
    bibleVerse: {"text":"Unless a grain of wheat falls into the earth and dies, it remains alone.","reference":"John 12:24"},
    keyEvents: [
      {
        year: "1949",
        description: "Writes the journal line he is remembered for, aged twenty-two",
        dateNote: "Dated from his own journal entry of 28 October 1949, published by Elisabeth Elliot.",
      },
      { year: "1952", description: "Arrives in Ecuador" },
      { year: "1953", description: "Marries Elisabeth Howard" },
      { year: "1955", description: "Operation Auca begins with gift drops to the Waorani" },
      { year: "1956", description: "Speared to death with four others on 8 January" },
    ],
    tags: ["ecuador","waorani","martyr","missions","journals","amazon"],
    sources: [],
  },
  {
    id: "elisabeth-elliot",
    name: "Elisabeth Elliot",
    group: "missionaries",
    wikipedia: "Elisabeth Elliot",
    timePeriod: "1926 - 2015",
    birthYear: "1926",
    deathYear: "2015",
    place: "Ecuador and the United States",
    description: "Widowed at twenty-nine when her husband was killed, she went to live among the people who killed him.",
    contribution: "Wrote Through Gates of Splendor and thirty other books, and taught two generations about obedience when God does not explain.",
    biography:
      "Elisabeth Howard went to Ecuador as a linguist, translating for a jungle people whose language had never been written. She lost that work twice: once when the man helping her was murdered, and once when her only copy of the translation materials was stolen. She wrote about both without resolving them.\n\nShe married Jim Elliot in 1953 and was widowed in January 1956, with a ten-month-old daughter.\n\nWhat she did next is the part that resists easy telling. Two years later, with Valerie on her hip, she went to live among the Waorani -- the people who had speared her husband -- alongside Rachel Saint. She stayed two years, learned the language, and later refused to describe it as heroic or as forgiveness in any dramatic sense. It was, she said, obedience.\n\nThrough Gates of Splendor told the story of the five men and became one of the most widely read missionary books of the century. Her later writing turned to suffering and to the plain question of what to do when God does not explain himself, which she answered the same way every time: do the next thing.\n\nShe was widowed a second time when her second husband died of cancer. She hosted a radio programme for thirteen years, and spent her last decade with dementia.",
    complications: "Her teaching on womanhood and submission made her a lasting figure in complementarian circles and a contested one elsewhere, and that argument long outlived her.",
    famousQuote: "Do the next thing.",
    bibleVerse: {"text":"The LORD gave, and the LORD has taken away; blessed be the name of the LORD.","reference":"Job 1:21"},
    keyEvents: [
      {
        year: "1952",
        description: "Goes to Ecuador as a linguist",
        dateNote: "She travelled out the same year as Jim Elliot; her article gives no year for the move.",
      },
      { year: "1953", description: "Marries Jim Elliot" },
      { year: "1956", description: "Widowed when Jim is killed; their daughter is ten months old" },
      { year: "1957", description: "Publishes Through Gates of Splendor" },
      { year: "1958", description: "Goes to live among the Waorani with her young daughter" },
    ],
    tags: ["ecuador","waorani","widow","suffering","writing","forgiveness","obedience"],
    sources: [],
  },
];
