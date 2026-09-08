import type { RawHero } from "./types";

/**
 * The Puritans: English and colonial pastors of the seventeenth and
 * eighteenth centuries, most of whom lost their livings in 1662 for refusing
 * to conform, and several of whom wrote their best work afterwards.
 */
export const puritans: RawHero[] = [
  {
    id: "jonathan-edwards",
    name: "Jonathan Edwards",
    group: "puritans",
    wikipedia: "Jonathan Edwards (theologian)",
    timePeriod: "1703 - 1758",
    birthYear: "1703",
    deathYear: "1758",
    place: "Northampton, Massachusetts",
    description:
      "A New England pastor usually remembered for one terrifying sermon, who actually spent his life writing about beauty and delight.",
    contribution:
      "The most original theologian America has produced, and the chief interpreter of the Great Awakening — including its counterfeits.",
    biography:
      "Edwards entered Yale at thirteen and was a serious naturalist before he was a theologian; one of his early pieces of writing is a careful description of how a spider flies. That attentiveness never left him. His mature theology is built on the claim that God is supremely beautiful, and that the difference conversion makes is a new capacity to see it — what he called a sense of the heart, as different from knowing about God as tasting honey is from being told it is sweet.\n\nHe succeeded his grandfather at Northampton and in 1734 saw an unexpected revival begin there, then a far larger one across the colonies in the 1740s. Edwards became its most careful observer, and much of what he wrote was aimed at his own side: crowds and tears and collapsing are not evidence of anything in particular, he argued; the test of a genuine work of God is a changed life over time. Religious Affections is that argument at book length, and it is as hard on enthusiasm as it is on coldness.\n\n\"Sinners in the Hands of an Angry God\" was preached at Enfield in 1741. It is one sermon out of more than a thousand, and reading it alone gives an impression of him that his own congregation would not have recognised.\n\nThey dismissed him in 1750 over who could receive communion. He went to the frontier settlement of Stockbridge as a missionary to the Mahican and Mohawk, and wrote his most demanding books there. He was made president of the college that became Princeton in 1758, took a smallpox inoculation, and died of it within weeks.",
    complications:
      "Edwards owned enslaved people throughout his adult life, and defended the practice when a fellow minister was criticised for it — while his own son became an abolitionist. It is the plainest contradiction in his life and it should not be skipped.",
    famousQuote:
      "Resolved, to live with all my might while I do live.",
    bibleVerse: {
      text: "Whom have I in heaven but you? And there is nothing on earth that I desire besides you.",
      reference: "Psalm 73:25",
    },
    keyEvents: [
      { year: "1727", description: "Joins his grandfather Solomon Stoddard as pastor at Northampton" },
      { year: "1734", description: "A revival begins in Northampton" },
      { year: "1741", description: "Preaches \"Sinners in the Hands of an Angry God\" at Enfield" },
      { year: "1746", description: "Publishes A Treatise Concerning Religious Affections" },
      { year: "1750", description: "Dismissed by his Northampton congregation" },
      { year: "1751", description: "Becomes a missionary at Stockbridge" },
      { year: "1754", description: "Publishes Freedom of the Will" },
      { year: "1758", description: "Made president of the College of New Jersey; dies weeks later" },
    ],
    tags: ["theologian", "great awakening", "new england", "revival", "philosophy", "missionary", "colonial america"],
    sources: [
      { title: "A Treatise Concerning Religious Affections", author: "Jonathan Edwards", type: "book" },
      { title: "Jonathan Edwards: A Life", author: "George M. Marsden", type: "book" },
    ],
  },
  {
    id: "david-brainerd",
    name: "David Brainerd",
    group: "puritans",
    wikipedia: "David Brainerd",
    timePeriod: "1718 - 1747",
    birthYear: "1718",
    deathYear: "1747",
    place: "New Jersey and Pennsylvania",
    description:
      "A missionary to Native Americans who died at twenty-nine, and whose diary has sent more people to the mission field than almost any other book.",
    contribution:
      "His journal, published by Jonathan Edwards, shaped the modern missionary movement — William Carey, Henry Martyn and Jim Elliot all read it.",
    biography:
      "Brainerd was orphaned young, converted at twenty-one, and expelled from Yale for saying of a tutor that he had no more grace than a chair. The remark was overheard and reported; he apologised; the college refused to reinstate him. He was never allowed to graduate, which barred him from a settled pastorate in Connecticut, and the injustice of it stayed with him.\n\nSo he went to the frontier instead. For four years he rode between Native settlements in New York, Pennsylvania and New Jersey — sleeping outdoors, often lost, frequently ill, and for long stretches convinced he was accomplishing nothing at all. The diary he kept is unsparing about it. He records depression that would today be named as such, and a loneliness he could not shake.\n\nThen at Crossweeksung in New Jersey in 1745, without anything he could point to as a cause, a large number of Delaware people came to faith in a matter of weeks. He was as surprised as anyone.\n\nHe was already dying of tuberculosis. He rode until he could not, and spent his last months in Jonathan Edwards's house in Northampton, nursed by Edwards's daughter Jerusha — who caught the disease and died four months after him, aged seventeen.\n\nEdwards edited the diary and published it. He was uneasy about parts of it, and said so: he thought Brainerd had confused melancholy with spirituality, and warned readers against imitating that. The book became one of the most influential in the history of missions anyway.",
    famousQuote:
      "I cared not where or how I lived, or what hardships I went through, so that I could but gain souls for Christ.",
    bibleVerse: {
      text: "Unless a grain of wheat falls into the earth and dies, it remains alone; but if it dies, it bears much fruit.",
      reference: "John 12:24",
    },
    keyEvents: [
      { year: "1739", description: "Converted at twenty-one" },
      { year: "1742", description: "Expelled from Yale for a remark about a tutor" },
      { year: "1743", description: "Begins missionary work among Native Americans" },
      { year: "1745", description: "An unexpected awakening at Crossweeksung, New Jersey" },
      { year: "1747", description: "Dies of tuberculosis at Jonathan Edwards's house, aged 29" },
      { year: "1749", description: "Edwards publishes his diary as An Account of the Life of David Brainerd" },
    ],
    tags: ["missionary", "native americans", "diary", "depression", "tuberculosis", "colonial america"],
    sources: [
      { title: "The Life and Diary of David Brainerd", author: "Jonathan Edwards", type: "book" },
      { title: "David Brainerd: A Flame for God", author: "Vance Christie", type: "book" },
    ],
  },
  {
    id: "samuel-rutherford",
    name: "Samuel Rutherford",
    group: "puritans",
    wikipedia: "Samuel Rutherford",
    timePeriod: "c. 1600 - 1661",
    birthYear: "c. 1600",
    deathYear: "1661",
    place: "Anwoth, Scotland",
    description:
      "A Scottish pastor whose letters from exile became one of the most loved devotional books in the language — and whose politics nearly got him hanged.",
    contribution:
      "Wrote Lex, Rex, which argued that a king is under the law and not above it, and the Letters, written to his scattered congregation while he was forbidden to preach.",
    biography:
      "Rutherford was minister at Anwoth in Galloway, a country parish he served with an intensity that became proverbial — people said he was always praying, always visiting, always writing. In 1636 he was tried for nonconformity, forbidden to preach anywhere in Scotland, and confined to Aberdeen.\n\nHe could not preach, so he wrote letters. Hundreds of them, to parishioners, to noblewomen, to fellow ministers, to people in trouble. They are extraordinary: tender, extravagant, saturated in the Song of Songs, and shot through with a homesickness for Christ that readers have found either overwhelming or embarrassing ever since. They were collected after his death and have never been out of print.\n\nThe Covenanting revolution released him. He served in the Westminster Assembly in London for four years, helping to produce the Confession and Catechisms that shaped English-speaking Presbyterianism, and became Principal of St Mary's College at St Andrews.\n\nIn 1644 he published Lex, Rex — \"The Law and the King\" — arguing that royal power is granted conditionally by the people and forfeited by tyranny. It was a genuinely dangerous book. When the monarchy was restored in 1660 the book was burned by the public hangman, Rutherford was stripped of his offices, and he was summoned to Edinburgh to face a charge of treason.\n\nHe was already dying, and his reply became famous: he had a summons from a higher court, and would answer that one first. He died before the trial.",
    famousQuote:
      "I have got a summons already before a superior Judge and judicatory, and I behove to answer my first summons; and ere your day come, I will be where few kings and great folks come.",
    bibleVerse: {
      text: "Whom have I in heaven but you? There is no one on earth that I desire besides you.",
      reference: "Psalm 73:25",
    },
    keyEvents: [
      { year: "1627", description: "Becomes minister at Anwoth in Galloway" },
      { year: "1636", description: "Tried, banned from preaching, and exiled to Aberdeen" },
      { year: "1636-1638", description: "Writes the Letters from exile" },
      { year: "1643-1647", description: "Serves in the Westminster Assembly in London" },
      { year: "1644", description: "Publishes Lex, Rex against absolute monarchy" },
      { year: "1661", description: "Lex, Rex burned; summoned for treason; dies before trial" },
    ],
    tags: ["scotland", "letters", "westminster assembly", "covenanter", "exile", "politics", "pastor"],
    sources: [
      { title: "The Letters of Samuel Rutherford", author: "Samuel Rutherford", type: "book" },
      { title: "Lex, Rex", author: "Samuel Rutherford", type: "book" },
    ],
  },
  {
    id: "richard-baxter",
    name: "Richard Baxter",
    group: "puritans",
    wikipedia: "Richard Baxter",
    timePeriod: "1615 - 1691",
    birthYear: "1615",
    deathYear: "1691",
    place: "Kidderminster, England",
    description:
      "A country pastor who transformed a whole town by visiting every family in it, and wrote the book that taught generations of ministers how.",
    contribution:
      "The Reformed Pastor and The Saints' Everlasting Rest, and a model of pastoral ministry built on catechising households one at a time.",
    biography:
      "Baxter had almost no formal education, poor health for his entire adult life, and a conviction that he was dying that lasted about fifty years. He arrived at Kidderminster in 1641 to find a town he described as ignorant and rude, and set about it with a plan: he and his assistant would work through every family in the parish, about eight hundred of them, spending an hour with each, every year.\n\nIt worked to a degree that astonished him. He wrote later that on Sundays you could walk the streets and hear families singing psalms in their houses.\n\nOut of that came The Reformed Pastor, which is less a book about preaching than a book about knowing people. His argument was that a minister who preaches to hundreds but cannot name their children has not really taught anybody, and he pressed it on his fellow clergy with a bluntness that made him unpopular.\n\nHe was a chaplain in the parliamentary army, then spent the 1650s trying to reconcile Christians who had spent a decade killing each other. He was offered a bishopric at the Restoration and refused it, hoping for a settlement broad enough to include Presbyterians. When the Act of Uniformity came in 1662 he was ejected with roughly two thousand others.\n\nHe wrote for the rest of his life — well over a hundred books — and in 1685, aged seventy, was tried before Judge Jeffreys for supposed sedition in a commentary on the New Testament, and imprisoned for eighteen months.",
    complications:
      "His lifelong effort to find middle ground made almost everyone suspicious of him, and his views on the atonement were considered a serious departure by many of his fellow Puritans — a dispute that has followed his reputation ever since.",
    famousQuote: "In necessary things, unity; in doubtful things, liberty; in all things, charity.",
    bibleVerse: {
      text: "Pay careful attention to yourselves and to all the flock, in which the Holy Spirit has made you overseers.",
      reference: "Acts 20:28",
    },
    keyEvents: [
      { year: "1641", description: "Becomes minister at Kidderminster" },
      { year: "1650", description: "Publishes The Saints' Everlasting Rest" },
      { year: "1656", description: "Publishes The Reformed Pastor" },
      { year: "1662", description: "Ejected under the Act of Uniformity with some 2,000 other ministers" },
      { year: "1685", description: "Tried before Judge Jeffreys and imprisoned for eighteen months" },
    ],
    tags: ["pastor", "kidderminster", "catechising", "ejected", "nonconformist", "prison", "england"],
    sources: [
      { title: "The Reformed Pastor", author: "Richard Baxter", type: "book" },
      { title: "The Saints' Everlasting Rest", author: "Richard Baxter", type: "book" },
    ],
  },
  {
    id: "john-owen",
    name: "John Owen",
    group: "puritans",
    wikipedia: "John Owen (theologian)",
    timePeriod: "1616 - 1683",
    birthYear: "1616",
    deathYear: "1683",
    place: "Oxford and London",
    description:
      "The most formidable theologian the Puritans produced, who ran Oxford under Cromwell and then lost everything at the Restoration.",
    contribution:
      "Wrote the definitive Puritan works on the death of Christ, indwelling sin and communion with God — dense, careful books still read three and a half centuries later.",
    biography:
      "Owen went up to Oxford at twelve and took his master's degree at nineteen. He was a scholar before he was anything else, and it shows: his books are famously hard going, packed with distinctions, and worth the effort.\n\nHis own assurance came slowly. He spent years in spiritual darkness and was finally settled, by his account, under a sermon preached by a man whose name he never learned, on the text \"Why are ye fearful, O ye of little faith?\"\n\nHe preached before Parliament the day after Charles I was executed, became Cromwell's chaplain, went with him to Ireland and Scotland, and was made Dean of Christ Church and then Vice-Chancellor of Oxford — running the university through the 1650s while writing steadily.\n\nThe Restoration ended all of it. He lost his positions, was barred from teaching and preaching publicly, and spent his last twenty years leading a small congregation in London and writing. Some of his greatest work comes from those years, including his enormous commentary on Hebrews.\n\nThree of his books have outlived the rest. The Death of Death in the Death of Christ argues that the cross actually accomplished salvation rather than merely making it possible. On the Mortification of Sin is a small, uncomfortable book whose most quoted line is \"Be killing sin or it will be killing you.\" Communion with God describes the Christian's relationship with Father, Son and Spirit distinctly, and is the warmest thing he wrote.",
    famousQuote: "Be killing sin or it will be killing you.",
    bibleVerse: {
      text: "If by the Spirit you put to death the deeds of the body, you will live.",
      reference: "Romans 8:13",
    },
    keyEvents: [
      { year: "1647", description: "Publishes The Death of Death in the Death of Christ" },
      { year: "1649", description: "Preaches before Parliament the day after the king's execution" },
      { year: "1651", description: "Made Dean of Christ Church, Oxford" },
      { year: "1652", description: "Becomes Vice-Chancellor of Oxford University" },
      { year: "1656", description: "Publishes Of the Mortification of Sin in Believers" },
      { year: "1660", description: "Loses his offices at the Restoration" },
    ],
    tags: ["theologian", "oxford", "cromwell", "sin", "atonement", "nonconformist", "england"],
    sources: [
      { title: "Of the Mortification of Sin in Believers", author: "John Owen", type: "book" },
      { title: "Communion with God", author: "John Owen", type: "book" },
      { title: "John Owen on the Christian Life", author: "Sinclair B. Ferguson", type: "book" },
    ],
  },
  {
    id: "john-bunyan",
    name: "John Bunyan",
    group: "puritans",
    wikipedia: "John Bunyan",
    timePeriod: "1628 - 1688",
    birthYear: "1628",
    deathYear: "1688",
    place: "Bedford, England",
    description:
      "A tinker with almost no schooling who wrote, in prison, the most widely read book in English after the Bible.",
    contribution:
      "The Pilgrim's Progress, and Grace Abounding to the Chief of Sinners — an unusually honest account of a mind in torment.",
    biography:
      "Bunyan was a brazier, mending pots, and the son of one. He served in the parliamentary army as a teenager and came home to a marriage, poverty, and several years of ferocious spiritual anxiety that he later described in Grace Abounding: convinced he had committed the unforgivable sin, tormented by phrases that came into his head, unable to settle. What eventually quieted him was not an argument but a sentence of Scripture that, he said, would not leave him.\n\nHe began preaching in the Bedford congregation and was very good at it, which was the problem. Preaching without a licence was illegal after the Restoration. In 1660 he was arrested and told he could go home if he promised to stop. He would not promise. He spent twelve years in Bedford gaol.\n\nHis wife Elizabeth petitioned the judges, pregnant and unsuccessful; the family survived on the laces he made in his cell. He had a Bible and Foxe's Book of Martyrs, and he wrote.\n\nThe Pilgrim's Progress appeared in 1678, after a second, shorter imprisonment. It is an allegory of a man named Christian walking from the City of Destruction to the Celestial City, and it works because the dangers are recognisable: the Slough of Despond, Vanity Fair, Giant Despair and Doubting Castle. Ordinary people read it, which the literary world found puzzling for about a century and then stopped finding puzzling.\n\nHe died at sixty, having ridden through rain to reconcile a father and son.",
    famousQuote:
      "I was dreaming a dream, and behold, I saw a man clothed with rags, standing in a certain place, with his face from his own house, a book in his hand, and a great burden upon his back.",
    bibleVerse: {
      text: "Strive to enter through the narrow door.",
      reference: "Luke 13:24",
    },
    keyEvents: [
      { year: "1644", description: "Serves in the parliamentary army as a teenager" },
      { year: "1655", description: "Begins preaching in the Bedford congregation" },
      { year: "1660", description: "Arrested for preaching without a licence; refuses to promise to stop" },
      { year: "1666", description: "Publishes Grace Abounding to the Chief of Sinners" },
      { year: "1672", description: "Released after twelve years in Bedford gaol" },
      { year: "1678", description: "Publishes The Pilgrim's Progress" },
    ],
    tags: ["prison", "allegory", "bedford", "preacher", "pilgrims progress", "nonconformist", "england"],
    sources: [
      { title: "The Pilgrim's Progress", author: "John Bunyan", type: "book" },
      { title: "Grace Abounding to the Chief of Sinners", author: "John Bunyan", type: "book" },
    ],
  },
  {
    id: "john-flavel",
    name: "John Flavel",
    group: "puritans",
    wikipedia: "John Flavel",
    timePeriod: "c. 1627 - 1691",
    birthYear: "c. 1627",
    deathYear: "1691",
    place: "Dartmouth, England",
    description:
      "A seaside pastor who kept preaching to his people illegally for nearly thirty years after the law took his pulpit away.",
    contribution:
      "The Mystery of Providence and Keeping the Heart — practical books about trusting God when the pattern of your life makes no sense yet.",
    biography:
      "Flavel spent his ministry at Dartmouth, a Devon port town full of sailors, and it marks his writing everywhere: he uses ships, tides, storms and cargo the way other preachers use farming, and he wrote a whole book of spiritual reflections drawn from navigation for seamen to read at sea.\n\nHe was ejected in 1662 along with the rest, and simply did not stop. He preached in woods and private houses; he is said to have met his congregation on a rock in the estuary that was legally in neither parish, exploiting the exact wording of the Five Mile Act. When plague and then persecution scattered the town, he kept finding them.\n\nHis best-known book, The Mystery of Providence, works from a single verse in Psalm 57 — \"God who performs all things for me\" — and argues something more demanding than it first sounds: that God's dealings with a person make a pattern, that the pattern is usually only visible looking backwards, and that a Christian therefore has a duty to remember. He tells his readers to keep a record of what God has done, because they will need it later when they cannot see.\n\nHis own life gave him the material. He was widowed three times. He was hunted for years. His books, written for tired and frightened people, are the least abstract things the Puritans produced.",
    famousQuote:
      "The providence of God is like Hebrew words — it can be read only backwards.",
    bibleVerse: {
      text: "I cry out to God Most High, to God who fulfills his purpose for me.",
      reference: "Psalm 57:2",
    },
    keyEvents: [
      { year: "1656", description: "Becomes a minister at Dartmouth" },
      { year: "1662", description: "Ejected under the Act of Uniformity" },
      { year: "1665", description: "Continues preaching illegally after the Five Mile Act" },
      { year: "1678", description: "Publishes The Mystery of Providence" },
      { year: "1687", description: "Allowed to preach openly again under the Declaration of Indulgence" },
    ],
    tags: ["pastor", "providence", "dartmouth", "sailors", "ejected", "persecution", "england"],
    sources: [
      { title: "The Mystery of Providence", author: "John Flavel", type: "book" },
      { title: "Keeping the Heart", author: "John Flavel", type: "book" },
    ],
  },
  {
    id: "cotton-mather",
    name: "Cotton Mather",
    group: "puritans",
    wikipedia: "Cotton Mather",
    timePeriod: "1663 - 1728",
    birthYear: "1663",
    deathYear: "1728",
    place: "Boston, Massachusetts",
    description:
      "New England's most famous minister, who risked his life to bring smallpox inoculation to Boston — and whose writing helped fuel the Salem witch trials.",
    contribution:
      "Magnalia Christi Americana, a vast history of New England, and a campaign for inoculation that saved many lives against furious opposition.",
    biography:
      "Mather was born into the closest thing colonial New England had to a dynasty: his father Increase was president of Harvard, his grandfathers were both eminent ministers. He entered Harvard at eleven, published more than four hundred works, and was elected to the Royal Society for his scientific writing.\n\nHe is remembered for two things that sit very badly together.\n\nIn 1721 a smallpox epidemic reached Boston. Mather had read of inoculation in the Royal Society's papers and heard of it directly from Onesimus, an enslaved African man in his household who described the practice from West Africa. Mather campaigned for it against near-universal opposition from the town's physicians. He was denounced from pulpits and in print, and somebody threw a lit grenade through his window with a note attached. The results vindicated him: the inoculated died at a small fraction of the rate of the rest.\n\nAnd in 1692, during the Salem witch trials, he did serious harm. He did not sit as a judge, and he warned against relying on spectral evidence — testimony that a spirit in the accused's likeness had appeared to a victim. But his warnings were hedged, he lent his authority to the proceedings, and afterwards he wrote a defence of the court's conduct. Twenty people were executed.\n\nHis father Increase spoke more clearly against the trials than he did.",
    complications:
      "He also held enslaved people, including Onesimus, whose knowledge he used to make his case for inoculation. His role at Salem was not that of a judge, but it was not innocent either, and he never fully retracted his defence of the court.",
    famousQuote: "The word of God is the standard by which all opinions are to be tried.",
    bibleVerse: {
      text: "Buy the truth, and do not sell it; buy wisdom, instruction, and understanding.",
      reference: "Proverbs 23:23",
    },
    keyEvents: [
      { year: "1685", description: "Ordained at the Old North Church in Boston" },
      { year: "1692", description: "The Salem witch trials; he cautions against spectral evidence but supports the court" },
      { year: "1702", description: "Publishes Magnalia Christi Americana" },
      { year: "1713", description: "Elected a Fellow of the Royal Society" },
      { year: "1721", description: "Campaigns for smallpox inoculation during the Boston epidemic" },
    ],
    tags: ["new england", "boston", "salem", "science", "inoculation", "history", "colonial america"],
    sources: [
      { title: "Magnalia Christi Americana", author: "Cotton Mather", type: "book" },
      { title: "The Life and Times of Cotton Mather", author: "Kenneth Silverman", type: "book" },
    ],
  },
];
