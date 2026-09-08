import type { RawHero } from "./types";

/**
 * The eighteenth and nineteenth-century revivals, and the preachers who
 * carried them. Whitefield and Edwards belong to the same moment as Wesley;
 * Edwards is filed with the Puritans because that is where his theology sits.
 */
export const awakening: RawHero[] = [
  {
    id: "john-wesley",
    name: "John Wesley",
    group: "awakening",
    wikipedia: "John Wesley",
    timePeriod: "1703-1791",
    birthYear: "1703",
    deathYear: "1791",
    place: "England",
    description: "An English cleric, theologian, and evangelist who founded the Methodist movement.",
    contribution: "Traveled over 250,000 miles on horseback, preached over 40,000 sermons, and helped spark a revival in England that emphasized personal holiness and social justice.",
    biography:
      "John Wesley was an Oxford fellow and an ordained clergyman who spent years trying to be good enough for God and knew he was failing. He led a group at Oxford so regimented in prayer, fasting and prison visiting that other students mocked them as Methodists. He sailed to Georgia as a missionary and came home considering the trip a failure, writing that he had gone to convert the Indians but who would convert him.\n\nWhat changed him was a group of Moravians. During a storm on the Atlantic crossing, while the English passengers panicked, the Moravians sang. Wesley asked whether they had been afraid and was told they were not. Back in London, at a meeting in Aldersgate Street in May 1738, he heard Luther's preface to Romans read aloud and felt his heart, in his phrase, strangely warmed -- trusting Christ for salvation rather than his own effort.\n\nWhat followed was fifty years of relentless motion. Barred from most pulpits, he took to preaching in fields, which he found undignified and did anyway. He is estimated to have ridden a quarter of a million miles on horseback and preached forty thousand sermons, often before dawn so working people could hear before their shift.\n\nHe organised converts into small groups that met weekly to ask each other hard questions, which is why Methodism outlasted him where other revivals faded. He founded schools and dispensaries, wrote a book of home remedies for the poor, and campaigned against the slave trade; his last letter was to William Wilberforce, urging him not to give up.",
    complications:
      "He and George Whitefield, close friends and fellow evangelists, split badly over predestination and preached against each other in print. They reconciled, and Whitefield asked Wesley to preach his funeral sermon, but the division ran through the movement for generations. Wesley's marriage was also unhappy by every account including his own.",
    famousQuote: "I look upon all the world as my parish.",
    bibleVerse: {"text":"The Spirit himself bears witness with our spirit that we are children of God.","reference":"Romans 8:16"},
    keyEvents: [
      { year: "1729", description: "Leads the Oxford \"Holy Club\", nicknamed Methodists" },
      { year: "1735", description: "Sails to Georgia as a missionary; returns considering it a failure" },
      { year: "1738", description: "At Aldersgate Street, feels his heart \"strangely warmed\"" },
      { year: "1739", description: "Begins preaching in the open air" },
      { year: "1784", description: "Ordains preachers for America, effectively founding a separate church" },
      { year: "1791", description: "Writes to Wilberforce against the slave trade days before his death" }
    ],
    tags: ["revival", "methodism", "field preaching", "england", "small groups", "abolition", "aldersgate"],
    sources: [],
  },
  {
    id: "charles-spurgeon",
    name: "Charles Spurgeon",
    group: "awakening",
    wikipedia: "Charles Spurgeon",
    timePeriod: "1834-1892",
    birthYear: "1834",
    deathYear: "1892",
    place: "London, England",
    description: "English Baptist preacher known as the 'Prince of Preachers' who was a powerful orator and prolific author.",
    contribution: "Built the Metropolitan Tabernacle which seated 5,000 people, founded a pastors' college, an orphanage, and published numerous sermons and books that continue to influence Christians today.",
    biography:
      "Spurgeon was converted at fifteen, in a tiny Primitive Methodist chapel he ducked into during a snowstorm because he could not reach the church he intended. The regular preacher had not arrived. A layman read out \"Look unto me, and be ye saved, all the ends of the earth\", ran out of material after a few minutes, and then pointed at the boy under the gallery and told him to look. Spurgeon said he looked, and the cloud lifted.\n\nHe was preaching within a year, pastoring a village chapel at seventeen, and called to London at nineteen. Crowds outgrew the building so fast that the congregation hired music halls while the Metropolitan Tabernacle was built to hold five thousand. He filled it twice every Sunday for thirty years without amplification.\n\nHis sermons were taken down in shorthand, printed weekly, and sold across the world; the collected set runs to sixty-three volumes and is the largest body of work by any Christian author in English. He also founded a pastors' college, an orphanage, and a book fund that sent free theology to poor ministers.\n\nHe suffered badly. Gout crippled him for months at a time, and he had recurrent depression that he wrote about with unusual frankness for a Victorian preacher -- telling his students that a minister who has never been in the depths will be no use to people who are.\n\nIn 1887 he broke with the Baptist Union over what he judged a drift from the faith, and was censured for it. The controversy exhausted him and he died five years later at fifty-seven.",
    complications:
      "The Down-Grade Controversy that ended his career is still argued about: whether he was defending the gospel against real theological collapse, or refusing to name names while making accusations he would not substantiate. Both readings have serious defenders.",
    famousQuote: "I looked at Him, and He looked at me, and we were one forever.",
    bibleVerse: {"text":"Look to me and be saved, all the ends of the earth!","reference":"Isaiah 45:22"},
    keyEvents: [
      { year: "1850", description: "Converted at fifteen after sheltering from a snowstorm in a chapel" },
      { year: "1854", description: "Called to New Park Street Chapel in London at nineteen" },
      { year: "1856", description: "A false fire alarm at the Surrey Gardens Music Hall kills seven; he collapses under it" },
      { year: "1861", description: "The Metropolitan Tabernacle opens, seating five thousand" },
      { year: "1867", description: "Founds the Stockwell Orphanage" },
      { year: "1887", description: "Withdraws from the Baptist Union in the Down-Grade Controversy" }
    ],
    tags: ["preacher", "london", "baptist", "orphanage", "depression", "sermons", "victorian"],
    sources: [],
  },
];
