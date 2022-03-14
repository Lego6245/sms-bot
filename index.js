require("dotenv").config()

const {Client, Intents, ClientPresence, InviteGuild} = require("discord.js")
const Airtable = require('airtable')

const client = 
  new Client({
    intents: [
      Intents.FLAGS.GUILDS, 
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.GUILD_MESSAGE_TYPING,
      Intents.FLAGS.GUILD_VOICE_STATES,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.GUILD_SCHEDULED_EVENTS
    ]
  })

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

let SC_VOICE = "https://www.twitch.tv/sunshinecommunity"// sunshine twitch
let BINGO_VOICE = "https://www.twitch.tv/bingothon" // bingothon twitch
let OFFLINE_VOICE = "TBD" // offline voice chat
let NAME_DB = 'Season 4 Matches' // name of the db

const PING_TIMER = 5 * 60 * 1000;

let created_matches = new Set()
let GUILD_INSTANCE = ""

const twitchLink = (restream_channel) => {
  if(restream_channel === "SunshineCommunity") {
    return SC_VOICE
  } else if(restream_channel === "Bingothon") {
    return BINGO_VOICE
  } 
  return OFFLINE_VOICE
}

const getAllMatches = async () => {
  const base = Airtable.base(process.env.AIRTABLE_BASE_ID)
  const matches = []
  await base(NAME_DB)
        .select({filterByFormula:
          'DATETIME_DIFF({Match Time (UTC)}, NOW(),"hours") >= 0',
        }).eachPage((records, fetchNextPage) => {
          try {
            records.forEach(record => {
              matches.push(record.fields)
            })
            fetchNextPage();
          } catch (e) {
            return;
          }
        })
  return matches
}

const createEvents = async (matches) => {

  for(let match of matches) {

    console.log(`> ${match["Match ID"]} <`);
    if (created_matches.has(match["Match ID"])){
      console.log("An event is already created for this match")
      continue
    }

    created_matches.add(match["Match ID"])

    console.log("Trying to create a new event");

    const starting_time = new Date(match["Match Time (UTC)"]);
    const end_time = new Date(starting_time.getTime() + 90 * 60000);

    const updated_event = await GUILD_INSTANCE
      .scheduledEvents
      .create({
        entityType: 3,
        privacyLevel: 2,              
        name: match["Match ID"],
        scheduledStartTime: starting_time, 
        scheduledEndTime: end_time, 
        entityMetadata: {location: twitchLink(match['Restream Channel'])},
        description: `${match["Match ID"]} ${match['Match Format'] ?? "Format TBD"} in ${match['Restream Channel'] ?? "Channel TBD"}`,
      });
  }
}

const updateEvents = async () => {
  const all_events = await GUILD_INSTANCE.scheduledEvents.fetch();
  const matches = await getAllMatches()

  let pair_match_event = new Map();

  for(let event of all_events) {
    const guild_event = event[1]
    pair_match_event.set(guild_event.name, guild_event);
  }

  for(let match of matches) {
    if (pair_match_event.has(match["Match ID"])) {
      console.log("Updating event")
      console.log(`> ${match["Match ID"]} <`);

      const starting_time = new Date(match["Match Time (UTC)"]);
      const end_time = new Date(starting_time.getTime() + 90 * 60000);

      const updated_event = await GUILD_INSTANCE
            .scheduledEvents
            .edit(pair_match_event.get(match["Match ID"]),
              {
              entityType: 3,
              scheduledStartTime: starting_time, 
              scheduledEndTime: end_time, 
              entityMetadata: {location: twitchLink(match['Restream Channel'])},
              description: `${match["Match ID"]} ${match['Match Format'] ?? "Format TBD"} in ${match['Restream Channel'] ?? "Channel TBD"}`,
            });
    }
  } 
}

let update_check = false;

const performUpdateLoop = async () => {
  const matches = await getAllMatches();

  if (update_check)
    updateEvents(matches);
  else
    createEvents(matches);

  update_check = !update_check;
}

setInterval( async () => {
  performUpdateLoop();
}, PING_TIMER)


client.on("ready",  async () => {
  
  const Guilds = client.guilds.cache.map( (guild) => {
    GUILD_INSTANCE = guild;
  });

  console.log("- SMS-BOT -");
  console.log(`Connected to Guild ID: ${GUILD_INSTANCE.id}`);

  const all_events = await GUILD_INSTANCE.scheduledEvents.fetch();

  for (const event of all_events)
    created_matches.add(event[1].name);

  performUpdateLoop();

});

client.login(process.env.BOT_LOGIN)