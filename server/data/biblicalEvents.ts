/**
 * Factual anchors for the biblical events the Historical & Biblical form offers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The form sends a SLUG -- "noah", "davidGoliath" -- and the brief used to emit
 * that slug verbatim: "Draw on this biblical event: noah." A 20B local model
 * handed the token "noah" with no account attached does what it is asked and
 * invents something plausible. Blake generated several Noah stories and they
 * were "way off". They were not off because the model is small; they were off
 * because nothing in the prompt said what happens in the account.
 *
 * The 17 options are a KNOWN, FIXED list, so the account can be supplied rather
 * than recalled. That turns generation from a memory test into a retelling,
 * which is a far easier task for any model and a much cheaper one for a local
 * model in particular.
 *
 * SCRIPTURE
 * ---------
 * `keyVerse.text` is VERBATIM, fetched from bible-api.com rather than written
 * from memory -- scripture in a children's app must not be approximated, and a
 * model (including this one) recalling a verse produces something that reads
 * right and is subtly wrong.
 *
 * The translation is the World English Bible, which is PUBLIC DOMAIN. The NIV
 * (Biblica) and ESV (Crossway) are both copyrighted; each permits limited
 * quotation but requires a specific attribution notice this app does not carry,
 * and the ESV's API returns 403 without a Crossway key. WEB needs neither.
 *
 * One WEB quirk to know about: it renders the divine name as "Yahweh" where
 * most English Bibles print "the LORD". It is left verbatim rather than
 * silently edited -- quoted scripture that has been quietly altered is worse
 * than an unfamiliar rendering. If a licensed translation is obtained later,
 * `keyVerse` is a data field and swaps in without touching a prompt.
 *
 * CAUTIONS
 * --------
 * `cautions` are the specific errors these accounts actually attract -- the
 * Magi at the manger, Noah gathering the animals himself, Paul falling off a
 * horse. They are stated as prohibitions because a positive summary does not
 * displace an error the model already holds.
 */

export type BiblicalEvent = {
  /** Human label. The slug must never reach a prompt. */
  label: string;
  /** Where the account is, for the model and for the reader. */
  passage: string;
  /** What happens, in order, with real names. ~150-200 words. */
  anchor: string;
  /** Verbatim scripture. See the note on translation above. */
  keyVerse: { reference: string; text: string };
  /** Errors this account specifically attracts. */
  cautions: string[];
};

export const BIBLICAL_EVENTS: Record<string, BiblicalEvent> = {
  creation: {
    label: "Creation",
    passage: "Genesis 1-2",
    anchor:
      "God creates the heavens and the earth. Day one: light, separated from darkness. Day two: an expanse -- the sky -- separating the waters. Day three: dry land and seas, then plants and trees bearing seed. Day four: the sun, the moon and the stars, to mark seasons and days. Day five: creatures of the sea and birds of the air. Day six: land animals, and then humankind, male and female, made in God's own image and given care over the rest. God sees that it is very good. On the seventh day God rests and blesses that day. Genesis 2 tells it again from close up: God forms the man from the dust of the ground and breathes life into him, plants a garden in Eden with a river running through it, puts the man there to work it and keep it, brings the animals to him to be named, and makes the woman from his side so he is not alone.",
    keyVerse: {
      reference: "Genesis 1:1",
      text: "In the beginning, God created the heavens and the earth.",
    },
    cautions: [
      "Keep the six days in their order. Humankind comes on day six, last, not first.",
      "The serpent, the fruit and the fall are Genesis 3 -- a different account. Do not fold them in.",
      "Adam and Eve are not named in Genesis 1. The man and the woman are simply that.",
      "The animals are not characters here. They are brought to the man to be named.",
    ],
  },

  noah: {
    label: "Noah's Ark",
    passage: "Genesis 6:9 - 9:17",
    anchor:
      "The earth is filled with violence, and God resolves to make an end of it -- but Noah, a righteous man, finds favour. God tells him to build an ark of gopher wood: three decks, rooms inside, a door in its side, covered with pitch inside and out. GOD brings the animals to Noah, two of every kind and seven pairs of every clean kind, and Noah takes his wife, his three sons Shem, Ham and Japheth, and their wives -- eight people in all. The rain falls forty days and forty nights and the waters cover the earth for a hundred and fifty days. The ark comes to rest on the mountains of Ararat. Noah sends out a raven, then a dove; the dove returns with nothing, then a week later with a fresh olive leaf in her beak, and the third time does not return at all. They come out onto dry ground. Noah builds an altar. God promises never again to destroy the earth by flood, and sets the rainbow in the clouds as the sign of that covenant.",
    keyVerse: {
      reference: "Genesis 9:13",
      text: "I set my rainbow in the cloud, and it will be a sign of a covenant between me and the earth.",
    },
    cautions: [
      "Noah is a grown man of six hundred years, not a child and not a jolly zookeeper.",
      "GOD gathers the animals to the ark. Noah does not go out collecting them.",
      "The DOVE brings the olive leaf, not the raven, and only on its second flight.",
      "There are eight people aboard, and they have names. Do not leave the family anonymous.",
      "The rainbow comes AFTER the flood, as the sign of a promise. It is not in the sky during the rain.",
      "No animals are left behind for a joke, and no animal speaks.",
      "Scripture does not name Noah's wife or his sons' wives, and does not give the sons' ages. Call them \"Noah's wife\" and so on. Do not invent names or ages for them.",
    ],
  },

  abraham: {
    label: "Abraham's Journey",
    passage: "Genesis 12; 15; 17; 21; 22",
    anchor:
      "God tells Abram, then seventy-five and living in Haran, to leave his country and his father's house for a land God will show him, promising to make him a great nation. He goes, taking Sarai his wife and Lot his nephew, and comes into Canaan. When their herdsmen quarrel, Abram lets Lot choose first and Lot takes the well-watered Jordan plain. God brings Abram outside at night and tells him to count the stars -- so shall his offspring be -- and Abram believes God, and it is credited to him as righteousness. God renames them Abraham and Sarah and promises a son through Sarah, who laughs, being ninety. Isaac is born when Abraham is a hundred; his name means laughter. Later God tests Abraham, telling him to take Isaac to a mountain in Moriah. Abraham goes; Isaac carries the wood and asks where the lamb is; and as Abraham raises the knife the angel of the LORD calls from heaven and stops him. Abraham sees a ram caught by its horns in a thicket and offers it instead.",
    keyVerse: {
      reference: "Genesis 12:2",
      text: "I will make of you a great nation. I will bless you and make your name great. You will be a blessing.",
    },
    cautions: [
      "He is Abram and Sarai until God renames them in Genesis 17. Get the order right if you use both.",
      "Isaac is NOT sacrificed. The angel stops Abraham and a ram is provided.",
      "Ishmael, Hagar's son, is born before Isaac. Do not present Isaac as the only son from the start.",
      "The promise is of land and descendants. It is not a promise of an easy journey.",
    ],
  },

  joseph: {
    label: "Joseph in Egypt",
    passage: "Genesis 37; 39-45; 50",
    anchor:
      "Jacob loves Joseph more than his other sons and gives him a richly ornamented coat. Joseph dreams of his brothers' sheaves bowing to his, and of the sun, moon and eleven stars bowing down, and tells them -- and they hate him for it. When he comes to them in the fields they strip off the coat and throw him into a dry cistern; Reuben means to rescue him and Judah proposes selling him, and traders take him down to Egypt, where Potiphar buys him. Falsely accused by Potiphar's wife, he is put in prison, and there he interprets the dreams of Pharaoh's cupbearer and baker. Two years later he is brought out to interpret Pharaoh's dreams: seven fat cows and seven thin, seven good heads of grain and seven withered -- seven years of plenty, then seven of famine. Pharaoh puts him over all Egypt. His brothers come to buy grain and do not recognise him. He tests them, hides his silver cup in Benjamin's sack, and finally weeps aloud and tells them who he is, and that what they meant for evil, God meant for good.",
    keyVerse: {
      reference: "Genesis 50:20",
      text: "As for you, you meant evil against me, but God meant it for good, to bring to pass, as it is today, to save many people alive.",
    },
    cautions: [
      "Joseph is seventeen when he is sold and about thirty before Pharaoh. He is not a small child.",
      "His brothers sell him. They do not merely play a trick that gets out of hand.",
      "Reuben and Judah each act to keep him alive -- the brothers are not one undifferentiated mob.",
      "The reunion is not instant forgiveness on arrival. He tests them first, and weeps.",
    ],
  },

  moses: {
    label: "Moses and the Exodus",
    passage: "Exodus 1-15",
    anchor:
      "Pharaoh orders every Hebrew baby boy thrown into the Nile. Moses' mother hides him three months, then sets him in a papyrus basket among the reeds; his sister Miriam watches, and when Pharaoh's daughter draws him out Miriam fetches his own mother to nurse him. Grown, Moses kills an Egyptian beating a Hebrew and flees to Midian, where he marries Zipporah and keeps the flocks of Jethro. God speaks to him from a bush that burns without being consumed, gives his name -- I AM -- and sends him back with his brother Aaron to tell Pharaoh to let the people go. Pharaoh refuses through ten plagues: blood, frogs, gnats, flies, livestock, boils, hail, locusts, darkness, and the death of the firstborn. Israel keeps the Passover, marking the doorposts with the blood of a lamb, and that night they leave. Pharaoh pursues them to the sea. Moses stretches out his hand, a strong east wind drives the water back all night, and Israel crosses on dry ground; the waters return over the Egyptians behind them.",
    keyVerse: {
      reference: "Exodus 14:21",
      text: "Moses stretched out his hand over the sea, and Yahweh caused the sea to go back by a strong east wind all night, and made the sea dry land, and the waters were divided.",
    },
    cautions: [
      "Moses is eighty at the Exodus. The basket in the Nile and the parting of the sea are separated by a lifetime.",
      "Keep the ten plagues in order if you name them, and do not invent an eleventh.",
      "God parts the sea. Moses stretches out his hand -- the power is not his own.",
      "The Ten Commandments come later, at Sinai, after the crossing. Do not move them earlier.",
      "Miriam and Aaron are named participants, not background figures.",
    ],
  },

  joshua: {
    label: "Joshua and the Battle of Jericho",
    passage: "Joshua 2; 6",
    anchor:
      "After Moses dies, Joshua leads Israel across the Jordan into Canaan. Jericho is shut up tight against them, its gates barred. Two spies sent ahead are hidden by Rahab on her roof under stalks of flax; she asks that her household be spared, and they tell her to tie a scarlet cord in her window. God gives Joshua the plan, and it is not a plan of assault: the fighting men, with seven priests carrying seven trumpets of rams' horns ahead of the ark of the covenant, are to march around the city once a day for six days, in silence, no word out of anyone's mouth. On the seventh day they march around seven times, and at the seventh circuit the priests sound a long blast, Joshua tells the people to shout, and they shout a great shout. The wall falls down flat, and they go up into the city, every man straight ahead of him. Rahab and everyone in her house are brought out safely.",
    keyVerse: {
      reference: "Joshua 6:20",
      text: "So the people shouted and the priests blew the trumpets. When the people heard the sound of the trumpet, the people shouted with a great shout, and the wall fell down flat, so that the people went up into the city, every man straight in front of him, and they took the city.",
    },
    cautions: [
      "Six days of SILENT marching. Nobody shouts until the seventh day, and that restraint is the point.",
      "Seven priests, seven rams'-horn trumpets, seven circuits on the seventh day. The number matters.",
      "The ark of the covenant is carried in the procession -- it is not a purely military parade.",
      "Rahab's rescue is part of the account, not an optional extra.",
      "God brings the wall down. Do not make it the noise itself, or Israel's strength.",
    ],
  },

  davidGoliath: {
    label: "David and Goliath",
    passage: "1 Samuel 17",
    anchor:
      "The Philistines and Israel camp on opposite hills with the Valley of Elah between them. Goliath of Gath, a champion over nine feet tall in a bronze helmet and coat of scale armour, with a spear whose shaft is like a weaver's beam, comes out morning and evening for forty days to challenge any Israelite to fight him. Jesse sends his youngest son David with bread and cheese for his three eldest brothers, Eliab, Abinadab and Shammah. David hears the challenge and asks who this man is to defy the armies of the living God, and volunteers. Saul says he is only a boy; David answers that he has killed a lion and a bear that came after his father's sheep. Saul dresses him in his own armour and David takes it off -- he cannot walk in it. He goes down with his staff, chooses five smooth stones from the brook, and comes with his sling. Goliath despises him. David says he comes in the name of the LORD of Armies. The stone sinks into Goliath's forehead and he falls face down, and the Philistines run.",
    keyVerse: {
      reference: "1 Samuel 17:45",
      text: "Then David said to the Philistine, “You come to me with a sword, with a spear, and with a javelin; but I come to you in the name of Yahweh of Armies, the God of the armies of Israel, whom you have defied.",
    },
    cautions: [
      "David is a shepherd boy running an errand, not a soldier and not yet king.",
      "He refuses Saul's armour. That refusal is part of the story, not a detail to cut.",
      "Five smooth stones, one sling, from the brook in the valley.",
      "It is not a story about a small clever boy outwitting a big slow one. David says plainly whose name he comes in.",
    ],
  },

  daniel: {
    label: "Daniel in the Lions' Den",
    passage: "Daniel 6",
    anchor:
      "Under Darius the Mede, Daniel is one of three administrators set over a hundred and twenty satraps, and he does his work so well that the king plans to put him over the whole kingdom. The other officials, jealous, can find no fault in him at all, and conclude that the only charge they will ever get is about the law of his God. They flatter the king into signing a decree -- irrevocable, under the law of the Medes and Persians -- that for thirty days anyone who prays to any god or man except the king be thrown into the den of lions. Daniel goes home, opens the upstairs windows that face Jerusalem, and kneels and prays three times a day, as he has always done. They catch him at it and bring the charge. The king is distressed and works until sunset to save him, but cannot undo his own law, and Daniel is thrown in; a stone is laid over the mouth of the den and sealed. The king fasts all night and cannot sleep. At first light he calls out, and Daniel answers: God sent his angel and shut the lions' mouths.",
    keyVerse: {
      reference: "Daniel 6:22",
      text: "My God has sent his angel, and has shut the lions’ mouths, and they have not hurt me; because as before him innocence was found in me; and also before you, O king, I have done no harm.”",
    },
    cautions: [
      "Daniel is an old man here, decades after being carried off to Babylon as a youth.",
      "King Darius is Daniel's FRIEND, trapped by his own decree, and grieves all night. He is not the villain.",
      "The villains are the jealous officials who could find nothing else to accuse him of.",
      "The fiery furnace is a different story -- Shadrach, Meshach and Abednego, Daniel 3. Do not merge them.",
      "Daniel does not pray in secret or change his habits. He prays exactly as he always had, at open windows.",
    ],
  },

  jonah: {
    label: "Jonah and the Great Fish",
    passage: "Jonah 1-4",
    anchor:
      "God tells Jonah to go to Nineveh, a great and wicked city, and preach against it. Jonah goes the opposite way, down to Joppa, and pays his fare onto a ship bound for Tarshish. God sends a violent storm; the sailors throw the cargo overboard and each cries to his own god while Jonah sleeps below. They cast lots and the lot falls on Jonah, who tells them to throw him into the sea -- and when they finally do, the sea grows calm. God appoints a great fish to swallow him, and he is in it three days and three nights, and prays from inside it. The fish spits him out onto dry land. He goes to Nineveh and cries that in forty days it will be overthrown, and the whole city believes God, from the king on his throne down, and fasts, and God relents. This makes Jonah furious. He sits down east of the city to sulk; God grows a plant to shade him and then sends a worm to wither it; and the book ends with God asking Jonah whether he should not have pity on a city of a hundred and twenty thousand people who do not know their right hand from their left.",
    keyVerse: {
      reference: "Jonah 2:10",
      text: "Then Yahweh spoke to the fish, and it vomited out Jonah on the dry land.",
    },
    cautions: [
      "The text says a great fish. It does not say a whale.",
      "The sailors do not throw Jonah overboard out of cruelty -- they try hard to row back to land first, and Jonah tells them to do it.",
      "Nineveh REPENTS and is spared. That is the point of the book.",
      "The book ends with Jonah angry and God asking him a question. Do not invent a cheerful repentant Jonah at the end -- his sulk is the mirror the story holds up.",
    ],
  },

  nativity: {
    label: "The Nativity of Jesus",
    passage: "Luke 1-2; Matthew 1-2",
    anchor:
      "The angel Gabriel comes to Mary in Nazareth and tells her she will bear a son and call him Jesus. Joseph, told in a dream not to be afraid to take her as his wife, does so. A census ordered by Caesar Augustus sends them to Bethlehem, Joseph's ancestral town. There is no room for them in the guest room, so when the child is born Mary wraps him in cloths and lays him in a manger. That night an angel appears to shepherds keeping watch over their flocks nearby, and a great company of the heavenly host appears with him praising God; the shepherds hurry off and find Mary and Joseph and the baby, and afterwards tell everyone what they were told. He is presented at the temple, where old Simeon takes him in his arms and Anna the prophetess gives thanks. Later, Magi from the east follow a star to Jerusalem and then to Bethlehem, and coming into the HOUSE they bow down and give gold, frankincense and myrrh. Warned in a dream, they go home another way, and Joseph takes his family to Egypt to escape Herod.",
    keyVerse: {
      reference: "Luke 2:11",
      text: "For there is born to you today, in David’s city, a Savior, who is Christ the Lord.",
    },
    cautions: [
      "The Magi arrive LATER, at a house, not at the manger. The shepherds and the Magi are two separate visits.",
      "Scripture never numbers the Magi and never calls them kings. Three gifts are named; the number of visitors is not.",
      "There is no innkeeper character in the text, no little drummer boy, and no animals gathered around adoringly.",
      "The angels announce and praise God. The text does not describe them singing.",
      "Bethlehem matters because it is Joseph's ancestral town and the census sends them there.",
    ],
  },

  miracles: {
    label: "Jesus' Miracles",
    passage: "Mark 4:35-41 and parallels",
    anchor:
      "Choose ONE recorded miracle and tell that one properly rather than gesturing at miracles in general. At a wedding in Cana the wine runs out and Jesus turns six stone water jars into wine, the best kept till last (John 2). Four friends dig through a roof to lower a paralysed man to him, and he forgives the man's sins and tells him to pick up his mat and walk (Mark 2). Crossing the Sea of Galilee a squall nearly swamps the boat while Jesus sleeps on a cushion in the stern; the disciples wake him and he rebukes the wind and says to the sea, Peace, be still (Mark 4). Five thousand are fed from five loaves and two fish a boy brings, and twelve baskets of scraps are gathered afterwards (all four Gospels). He walks on the water, and Peter walks a few steps and sinks (Matthew 14). Blind Bartimaeus shouts for him outside Jericho and will not be quieted (Mark 10). He raises Jairus' daughter, the widow's son at Nain, and Lazarus after four days in the tomb (Mark 5; Luke 7; John 11).",
    keyVerse: {
      reference: "Mark 4:39",
      text: "He awoke, and rebuked the wind, and said to the sea, “Peace! Be still!” The wind ceased, and there was a great calm.",
    },
    cautions: [
      "Do not invent a miracle and attribute it to Jesus. Pick one that is recorded and keep its named people and place.",
      "Jesus never performs a miracle as a spectacle to impress, and never to punish anyone.",
      "The miracles are for particular people in particular trouble. Keep the person in view, not just the wonder.",
    ],
  },

  parables: {
    label: "Jesus' Parables",
    passage: "Luke 15:11-32 and others",
    anchor:
      "A parable is a short invented story Jesus told to make one thing land -- so a retelling may reset the scene, but it must keep the parable's own point. The prodigal son: a younger son asks for his inheritance early, wastes it in a distant country, ends up feeding pigs and hungry enough to envy them, comes to his senses and starts home rehearsing an apology -- and while he is still a long way off his father sees him, RUNS to him, throws his arms around him, and calls for the best robe, a ring, sandals and a feast. The older brother stands outside, angry, and the father goes out to him too. Others to draw on: the good Samaritan, where a priest and a Levite pass by on the other side and the despised Samaritan stops (Luke 10); the lost sheep and the lost coin (Luke 15); the sower and the four soils (Mark 4); the mustard seed; the unforgiving servant (Matthew 18); the talents (Matthew 25); the wise and foolish builders (Matthew 7).",
    keyVerse: {
      reference: "Luke 15:20",
      text: "“He arose, and came to his father. But while he was still far off, his father saw him, and was moved with compassion, and ran, and fell on his neck, and kissed him.",
    },
    cautions: [
      "Keep the parable's own point. Do not bolt on a different moral because it suits the theme better.",
      "In the good Samaritan it is the priest and the Levite who pass by, and the Samaritan -- the outsider -- who helps.",
      "The father RUNS. That is the hinge of the prodigal son and it is usually the first thing dropped.",
      "The older brother's anger is not resolved in the text. Do not tidy it away.",
    ],
  },

  crucifixion: {
    label: "The Crucifixion",
    passage: "Luke 22-23; Matthew 26-27; John 18-19",
    anchor:
      "After the last supper and prayer in Gethsemane, Judas brings soldiers and betrays Jesus with a kiss. He is tried before the high priest and then before Pilate, who says he finds no basis for a charge, but gives way to the crowd and releases Barabbas instead. Soldiers mock him and press a crown of thorns onto his head. On the way to Golgotha, Simon of Cyrene is made to carry the cross. He is crucified between two criminals, and when one of them asks to be remembered, Jesus tells him that today he will be with him in paradise. The sign above him reads that he is the King of the Jews. He asks his Father to forgive them, because they do not know what they are doing. He sees his mother standing there with the disciple he loved, and gives them to each other. Darkness comes over the land, and the curtain of the temple tears in two from top to bottom. Joseph of Arimathea asks for the body and lays it in a new tomb cut from rock, and a stone is rolled across the entrance.",
    keyVerse: {
      reference: "Luke 23:34",
      text: "Jesus said, “Father, forgive them, for they don’t know what they are doing.” Dividing his garments among them, they cast lots.",
    },
    cautions: [
      "This is the hardest of these to write for children. Tell it truthfully and do not dwell on the physical suffering -- the nails, the blood and the scourging do not need describing.",
      "Pilate is reluctant and says he finds no guilt. The crowd and the leaders press for it.",
      "Jesus is not a helpless victim overpowered. He goes willingly and says so.",
      "Never end here. The resurrection is three days away and the story is not finished without it -- say so before you close.",
      "Do not blame a people. The account names particular leaders, a Roman governor and a crowd.",
    ],
  },

  resurrection: {
    label: "The Resurrection",
    passage: "Matthew 28; Mark 16; Luke 24; John 20-21",
    anchor:
      "Very early on the first day of the week, while it is still dark, women come to the tomb with spices, wondering who will roll the stone away for them. There is an earthquake; an angel of the Lord comes down and rolls back the stone and sits on it, and the guards shake and become like dead men. The tomb is empty, and the angel says he is not here, for he has risen, just as he said -- come and see the place where he lay -- and go and tell his disciples. Mary Magdalene stands outside the tomb crying and takes him for the gardener until he says her name, Mary. Peter and John run to the tomb; John gets there first and Peter goes in, and they find the linen wrappings lying there and the cloth from his head folded up by itself. That same day two disciples walking to Emmaus talk with him for miles without knowing him, and recognise him when he breaks the bread. He stands among the disciples and shows them his hands and his side; Thomas, absent the first time, says he will not believe until he touches, and a week later Jesus offers him exactly that, and Thomas answers, My Lord and my God.",
    keyVerse: {
      reference: "Matthew 28:6",
      text: "He is not here, for he has risen, just like he said. Come, see the place where the Lord was lying.",
    },
    cautions: [
      "The stone is rolled away so that witnesses can see IN. It is not moved to let Jesus out.",
      "The women, and Mary Magdalene in particular, are the first witnesses. Do not hand that to Peter.",
      "Thomas is not left a sceptic. He makes the clearest confession in the Gospel.",
      "The risen Jesus is not a ghost -- he shows his hands, and eats with them.",
    ],
  },

  pentecost: {
    label: "The Day of Pentecost",
    passage: "Acts 2",
    anchor:
      "The believers, about a hundred and twenty of them, are all together in one place in Jerusalem for the feast of Pentecost. Suddenly a sound like a rushing violent wind fills the whole house, and what look like tongues of fire separate and come to rest on each of them, and they are all filled with the Holy Spirit and begin to speak in other languages as the Spirit gives them utterance. The city is full of pilgrims from every nation under heaven -- Parthians, Medes, Elamites, people from Mesopotamia, Egypt, Rome, Crete and Arabia -- and each of them hears these Galileans speaking his own language, and they are astonished and perplexed. Some sneer that the believers have had too much new wine. Peter stands up with the eleven and answers: it is only nine in the morning; this is what the prophet Joel spoke of. He preaches Jesus, crucified and raised, and the hearers are cut to the heart and ask what they should do. Peter tells them to repent and be baptised, and about three thousand are added that day.",
    keyVerse: {
      reference: "Acts 2:4",
      text: "They were all filled with the Holy Spirit, and began to speak with other languages, as the Spirit gave them the ability to speak.",
    },
    cautions: [
      "The fire does not burn anyone. It is what the tongues LOOK like.",
      "The languages are real human languages, recognised by the visitors who hear them.",
      "PETER preaches, with the eleven. Paul is not there and is not yet a believer.",
      "The crowd's mockery -- that they are drunk -- is in the text, and Peter answers it directly.",
    ],
  },

  paul: {
    label: "Paul's Missionary Journeys",
    passage: "Acts 9; 13-28",
    anchor:
      "Saul of Tarsus, a Pharisee, stands by approving as Stephen is stoned, and goes house to house dragging believers off to prison. On the road to Damascus a light from heaven flashes around him; he falls to the ground and hears a voice: Saul, Saul, why do you persecute me? He is blind for three days until Ananias, sent against his own better judgement, lays hands on him -- and he is baptised and starts preaching in the synagogues that Jesus is the Son of God. Barnabas vouches for him when the disciples are still afraid of him. From the church at Antioch the Holy Spirit sets apart Barnabas and Saul, and they sail for Cyprus and then travel through Asia Minor; at Lystra Paul is stoned and dragged out of the city and left for dead. On the second journey, with Silas, a vision of a man of Macedonia takes them into Europe: Lydia the cloth-dealer believes at Philippi, and an earthquake opens the prison there; at Athens he speaks in the Areopagus about the altar to an unknown god. Arrested in Jerusalem, he appeals to Caesar, is shipwrecked at Malta, and reaches Rome under guard, still preaching.",
    keyVerse: {
      reference: "Acts 13:2",
      text: "As they served the Lord and fasted, the Holy Spirit said, “Separate Barnabas and Saul for me, for the work to which I have called them.”",
    },
    cautions: [
      "There is no horse. Acts never mentions one -- he falls to the ground on the road.",
      "Saul and Paul are the same man and both names are used after his conversion. It is not a renaming at the moment of belief.",
      "He is not one of the twelve apostles and never met Jesus before the Damascus road.",
      "The blindness lasts three days and is ended by Ananias, who is frightened of him and goes anyway.",
    ],
  },
};

/**
 * Look up an event by the slug the form sends. Returns undefined for "none",
 * the empty string, and anything unrecognised -- the caller then falls back to
 * ordinary story generation rather than to a half-anchored prompt.
 */
export function getBiblicalEvent(slug: string | undefined): BiblicalEvent | undefined {
  if (!slug) return undefined;
  const key = slug.trim();
  if (!key || key.toLowerCase() === "none") return undefined;
  return BIBLICAL_EVENTS[key];
}
