// worker.js (Cloudflare Worker for Facebook Messenger Bot - TESTING VERSION, UNSAFE FOR PRODUCTION)
const activeSessions = new Map();
const PH_OFFSET = 8 * 60 * 60 * 1000;

// Emoji mapping for stock items
const EMOJI_MAP = {
  // Seeds
  Carrot: "🥕",
  Strawberry: "🍓",
  Watermelon: "🍉",
  Tomato: "🍅",
  Blueberry: "🫐",
  Orange Tulip: "🌷",
  // Gear
  Trowel: "🛠️",
  Harvest Tool: "🪓",
  Watering Can: "🚿",
  Recall Wrench: "🔧",
  Favorite Tool: "🔨",
  Basic Sprinkler: "💧",
  // Eggs
  Common Egg: "🥚",
  Uncommon Egg: "🥚",
  Location: "📍",
  // Cosmetics
  Common Gnome Crate: "🧙",
  Rake: "🧹",
  Sign Crate: "🪧",
  Mini TV: "📺",
  Medium Stone Table: "🪨",
  Orange Umbrella: "☂️",
  Red Well: "🕳️",
  Wood Fence: "🪵",
  Axe Stump: "🌳",
  // Honeyevent
  Flower Seed Pack: "🌸",
  Honey Torch: "🔥",
  Bee Crate: "🐝",
  Honey Comb: "🍯",
  // Event
  ItemFrame: "🖼️"
};

function pad(n) {
  return n < 10 ? "0" + n : n;
}

function getPHTime() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + PH_OFFSET);
}

function getCountdown(target) {
  const now = getPHTime();
  const msLeft = target - now;
  if (msLeft <= 0) return "00h 00m 00s";
  const h = Math.floor(msLeft / 3.6e6);
  const m = Math.floor((msLeft % 3.6e6) / 6e4);
  const s = Math.floor((msLeft % 6e4) / 1000);
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function getNextRestocks() {
  const now = getPHTime();
  const timers = {};
  const nextEgg = new Date(now);
  nextEgg.setMinutes(now.getMinutes() < 30 ? 30 : 0);
  if (now.getMinutes() >= 30) nextEgg.setHours(now.getHours() + 1);
  nextEgg.setSeconds(0, 0);
  timers.egg = getCountdown(nextEgg);
  const next5 = new Date(now);
  const nextM = Math.ceil((now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0)) / 5) * 5;
  next5.setMinutes(nextM === 60 ? 0 : nextM, 0, 0);
  if (nextM === 60) next5.setHours(now.getHours() + 1);
  timers.gear = timers.seed = getCountdown(next5);
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  timers.honey = timers.event = getCountdown(nextHour);
  const next7 = new Date(now);
  const totalHours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const next7h = Math.ceil(totalHours / 7) * 7;
  next7.setHours(next7h, 0, 0, 0);
  timers.cosmetics = getCountdown(next7);
  return timers;
}

function formatValue(val) {
  if (val >= 1_000_000) return `x${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `x${(val / 1_000).toFixed(1)}K`;
  return `x${val}`;
}

function parseStockItem(item) {
  const match = item.match(/^(.+?)\s*\*\*x(\d+)\*\*$/);
  if (!match) return { name: item, value: 0 };
  return { name: match[1].trim(), value: parseInt(match[2], 10) };
}

function objectToArray(obj) {
  return Object.entries(obj)
    .filter(([_, value]) => parseInt(value, 10) > 0)
    .map(([name, value]) => ({
      name,
      value: parseInt(value, 10),
      emoji: EMOJI_MAP[name] || ""
    }));
}

function formatList(arr) {
  if (!arr?.length) return "None.";
  return arr
    .filter(item => item.value > 0)
    .map(item => {
      const parsed = typeof item === 'string' ? parseStockItem(item) : item;
      return `- ${parsed.emoji ? parsed.emoji + " " : ""}${parsed.name}: ${formatValue(parsed.value)}`;
    })
    .join("\n");
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad(m)}m ${pad(s)}s`;
}

function splitMessageIntoChunks(message, chunkSize) {
  const chunks = [];
  let chunk = '';
  const words = message.split(' ');
  for (const word of words) {
    if ((chunk + word).length > chunkSize) {
      chunks.push(chunk.trim());
      chunk = '';
    }
    chunk += `${word} `;
  }
  if (chunk) chunks.push(chunk.trim());
  return chunks;
}

async function sendResponseInChunks(senderId, text, config) {
  const maxMessageLength = 2000;
  if (text.length > maxMessageLength) {
    const messages = splitMessageIntoChunks(text, maxMessageLength);
    for (const message of messages) {
      await sendFacebookMessage(senderId, message, config);
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay to avoid rate limits
    }
  } else {
    await sendFacebookMessage(senderId, text, config);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const config = {
      fbVerifyToken: "YOUR_TEST_FB_VERIFY_TOKEN",
      fbPageAccessToken: "EAAIFkeOI638BO7Vpco3xJIDdU05tbNisZA8VluTskDKlaKOJvFEZC7IAXlln64D6LosvZCmEUVK08s3pmjwlfxgSnoiYls3nFIH6ZC92nRYZCrMzefIk8zSJGWDYAL3BILQnQKsdqX2s01yhx3EyjSOBlZACnMeKnjQka6hBajXFnWAK2Y17cAGva96ZAmm0dK1xQZDZD",
      deepseekApiKey: "899f1189-a2f7-4703-9cdf-25303b0a4c1a",
      deepseekEndpoint: "https://kaiz-apis.gleeze.com/api/deepseek-v3"
    };

    // Facebook Webhook Verification
    if (url.pathname === '/webhook' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === config.fbVerifyToken) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Verification failed', { status: 403 });
    }

    // Facebook Message Handling
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (body.object !== 'page') {
          return new Response('Invalid object', { status: 400 });
        }
        for (const entry of body.entry) {
          for (const event of entry.messaging) {
            if (event.message) {
              await processMessage(event, config);
            }
          }
        }
        return new Response('EVENT_RECEIVED', { status: 200 });
      } catch (error) {
        console.error('Error handling message:', error);
        return new Response('ERROR_PROCESSING', { status: 500 });
      }
    }

    // Status Page
    if (url.pathname === '/') {
      return new Response(
        'Facebook Bot Worker is running\n\n' +
        'Endpoints:\n' +
        '- GET /webhook - Facebook verification\n' +
        '- POST /webhook - Message handling\n\n' +
        'Commands:\n' +
        '- gagstock: Track Grow A Garden stock (old API)\n' +
        '- gagstock check: Check current stock and weather (old API)\n' +
        '- stock: Track Grow A Garden stock (new API)\n' +
        '- stock check: Check current stock and weather (new API)\n' +
        '- commands: Show available commands',
        { status: 200 }
      );
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function processMessage(event, config) {
  const senderId = event.sender.id;
  const messageText = event.message.text?.toLowerCase().trim();
  if (!messageText) return;

  const args = messageText.split(/\s+/);
  const command = args[0];
  const subCommand = args[1]?.toLowerCase();

  if (command === 'gagstock') {
    if (subCommand === 'check') {
      try {
        const [stockRes, weatherRes] = await Promise.all([
          fetch("https://growagardenstock.com/api/stock?type=gear-seeds").then(async res => {
            if (!res.ok) throw new Error(`Stock API error: ${res.status}`);
            return res.json();
          }),
          fetch("https://growagardenstock.com/api/stock/weather").then(async res => {
            if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
            return res.json();
          })
        ]);

        const stockData = {
          gearStock: stockRes.gear || [],
          seedsStock: stockRes.seeds || [],
          eggStock: stockRes.egg || [],
          honeyStock: stockRes.honey || [],
          cosmeticsStock: stockRes.cosmetics || []
        };

        const weather = {
          icon: weatherRes.icon || "🌦️",
          currentWeather: weatherRes.currentWeather || "Unknown",
          weatherType: weatherRes.weatherType || "Unknown",
          description: weatherRes.description || "No description available.",
          effectDescription: weatherRes.effectDescription || weatherRes.description || "No effect description available.",
          cropBonuses: weatherRes.cropBonuses || "None",
          mutations: Array.isArray(weatherRes.mutations) ? weatherRes.mutations : [],
          visualCue: weatherRes.visualCue || "None",
          rarity: weatherRes.rarity || "Unknown",
          updatedAt: weatherRes.updatedAt || 0
        };

        const restocks = getNextRestocks();

        const gearList = formatList(stockData.gearStock);
        const seedList = formatList(stockData.seedsStock);
        const eggList = formatList(stockData.eggStock);
        const cosmeticsList = formatList(stockData.cosmeticsStock);
        const honeyList = formatList(stockData.honeyStock);

        const mutationsList = weather.mutations.length ? weather.mutations.join(", ") : "None";

        const weatherDetails =
          `🌤️ 𝗪𝗲𝗮𝘁𝗵𝗲𝗿: ${weather.icon} ${weather.currentWeather} (${weather.weatherType})\n` +
          `📖 Description: ${weather.description}\n` +
          `📌 Effect: ${weather.effectDescription}\n` +
          `🪄 Crop Bonus: ${weather.cropBonuses}\n` +
          `🧬 Mutations: ${mutationsList}\n` +
          `📢 Visual Cue: ${weather.visualCue}\n` +
          `🌟 Rarity: ${weather.rarity}`;

        const message =
          `🌾 𝗚𝗿𝗼𝘄 𝗔 �_G𝗮𝗿𝗱𝗲𝗻 — 𝗦𝘁𝗼𝗰𝗸 𝗖𝗵𝗲𝗰𝗸 (Old API)\n\n` +
          `🛠️ 𝗚𝗲𝗮𝗿:\n${gearList}\n⏳ Restock in: ${restocks.gear}\n\n` +
          `🌱 𝗦𝗲𝗲𝗱𝘀:\n${seedList}\n⏳ Restock in: ${restocks.seed}\n\n` +
          `🥚 �_E𝗴𝗴𝘀:\n${eggList}\n⏳ Restock in: ${restocks.egg}\n\n` +
          `🎨 𝗖𝗼𝘀𝗺𝗲𝘁𝗶𝗰𝘀:\n${cosmeticsList}\n⏳ Restock in: ${restocks.cosmetics}\n\n` +
          `🍯 𝗛𝗼𝗻𝗲𝘆:\n${honeyList}\n⏳ Restock in: ${restocks.honey}\n\n` +
          weatherDetails;

        await sendResponseInChunks(senderId, message, config);
      } catch (err) {
        console.error(`❌ Gagstock check error for ${senderId}:`, err.message);
        await sendResponseInChunks(senderId, `❌ Error fetching data: ${err.message}. Please try again.`, config);
      }
    } else if (!subCommand || !['on', 'off'].includes(subCommand)) {
      await sendResponseInChunks(senderId, "📌 Usage:\n• `gagstock on` to start tracking (old API)\n• `gagstock off` to stop tracking\n• `gagstock check` to view current stock and weather (old API)", config);
      return;
    } else if (subCommand === 'off') {
      const session = activeSessions.get(senderId);
      if (session) {
        clearInterval(session.interval);
        activeSessions.delete(senderId);
        await sendResponseInChunks(senderId, "🛑 Gagstock tracking stopped.", config);
      } else {
        await sendResponseInChunks(senderId, "⚠️ You don't have an active gagstock session.", config);
      }
      return;
    } else if (subCommand === 'on') {
      if (activeSessions.has(senderId)) {
        await sendResponseInChunks(senderId, "📡 You're already tracking. Use `gagstock off` or `stock off` to stop.", config);
        return;
      }

      await sendResponseInChunks(senderId, "✅ Gagstock tracking started (old API)! You'll be notified when stock or weather changes.", config);

      const sessionData = {
        interval: null,
        lastCombinedKey: null,
        lastMessage: "",
        errorCount: 0,
        type: 'gagstock'
      };

      async function fetchAll() {
        try {
          const [stockRes, weatherRes] = await Promise.all([
            fetch("https://growagardenstock.com/api/stock?type=gear-seeds").then(async res => {
              if (!res.ok) throw new Error(`Stock API error: ${res.status}`);
              return res.json();
            }),
            fetch("https://growagardenstock.com/api/stock/weather").then(async res => {
              if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
              return res.json();
            })
          ]);

          const stockData = {
            gearStock: stockRes.gear || [],
            seedsStock: stockRes.seeds || [],
            eggStock: stockRes.egg || [],
            honeyStock: stockRes.honey || [],
            cosmeticsStock: stockRes.cosmetics || []
          };

          const weather = {
            icon: weatherRes.icon || "🌦️",
            currentWeather: weatherRes.currentWeather || "Unknown",
            weatherType: weatherRes.weatherType || "Unknown",
            description: weatherRes.description || "No description available.",
            effectDescription: weatherRes.effectDescription || weatherRes.description || "No effect description available.",
            cropBonuses: weatherRes.cropBonuses || "None",
            mutations: Array.isArray(weatherRes.mutations) ? weatherRes.mutations : [],
            visualCue: weatherRes.visualCue || "None",
            rarity: weatherRes.rarity || "Unknown",
            updatedAt: weatherRes.updatedAt || 0
          };

          const combinedKey = JSON.stringify({
            gearStock: stockData.gearStock,
            seedsStock: stockData.seedsStock,
            eggStock: stockData.eggStock,
            honeyStock: stockData.honeyStock,
            cosmeticsStock: stockData.cosmeticsStock,
            weatherUpdatedAt: weather.updatedAt,
            weatherCurrent: weather.currentWeather
          });

          if (combinedKey === sessionData.lastCombinedKey) return;
          sessionData.lastCombinedKey = combinedKey;
          sessionData.errorCount = 0;

          const restocks = getNextRestocks();

          const gearList = formatList(stockData.gearStock);
          const seedList = formatList(stockData.seedsStock);
          const eggList = formatList(stockData.eggStock);
          const cosmeticsList = formatList(stockData.cosmeticsStock);
          const honeyList = formatList(stockData.honeyStock);

          const mutationsList = weather.mutations.length ? weather.mutations.join(", ") : "None";

          const weatherDetails =
            `🌤️ 𝗪𝗲𝗮𝘁𝗵𝗲𝗿: ${weather.icon} ${weather.currentWeather} (${weather.weatherType})\n` +
            `📖 Description: ${weather.description}\n` +
            `📌 Effect: ${weather.effectDescription}\n` +
            `🪄 Crop Bonus: ${weather.cropBonuses}\n` +
            `🧬 Mutations: ${mutationsList}\n` +
            `📢 Visual Cue: ${weather.visualCue}\n` +
            `🌟 Rarity: ${weather.rarity}`;

          const message =
            `🌾 𝗚𝗿𝗼𝘄 𝗔 𝗚𝗮𝗿𝗱𝗲𝗻 — 𝗧𝗿𝗮𝗰𝗸𝗲𝗿 (Old API)\n\n` +
            `🛠️ 𝗚𝗲𝗮𝗿:\n${gearList}\n⏳ Restock in: ${restocks.gear}\n\n` +
            `🌱 𝗦𝗲𝗲𝗱𝘀:\n${seedList}\n⏳ Restock in: ${restocks.seed}\n\n` +
            `🥚 𝗘𝗴𝗴𝘀:\n${eggList}\n⏳ Restock in: ${restocks.egg}\n\n` +
            `🎨 𝗖𝗼𝘀𝗺𝗲𝘁𝗶𝗰𝘀:\n${cosmeticsList}\n⏳ Restock in: ${restocks.cosmetics}\n\n` +
            `🍯 𝗛𝗼𝗻𝗲𝘆:\n${honeyList}\n⏳ Restock in: ${restocks.honey}\n\n` +
            weatherDetails;

          if (message !== sessionData.lastMessage) {
            sessionData.lastMessage = message;
            await sendResponseInChunks(senderId, message, config);
          }
        } catch (err) {
          sessionData.errorCount++;
          console.error(`❌ Gagstock error for ${senderId}:`, err.message);
          if (sessionData.errorCount >= 3) {
            clearInterval(sessionData.interval);
            activeSessions.delete(senderId);
            await sendResponseInChunks(senderId, "❌ Tracking stopped due to repeated errors.", config);
          }
        }
      }

      sessionData.interval = setInterval(fetchAll, 30 * 1000);
      activeSessions.set(senderId, sessionData);
      await fetchAll();
    }
  } else if (command === 'stock') {
    if (subCommand === 'check') {
      try {
        const res = await fetch("https://www.gamersberg.com/api/grow-a-garden/stock").then(async res => {
          if (!res.ok) throw new Error(`Stock API error: ${res.status}`);
          return res.json();
        });

        if (!res.success || !res.data?.[0]) throw new Error("Invalid API response");

        const stockData = res.data[0];
        const stock = {
          gearStock: objectToArray(stockData.gear || {}),
          seedsStock: objectToArray(stockData.seeds || {}),
          eggStock: (stockData.eggs || []).map(egg => ({
            name: egg.name,
            value: egg.quantity,
            emoji: EMOJI_MAP[egg.name] || ""
          })),
          cosmeticStock: objectToArray(stockData.cosmetic || {}),
          honeyStock: objectToArray(stockData.honeyevent || {}),
          eventStock: objectToArray(stockData.event || {})
        };

        const weather = {
          icon: "🌧️", // Default for Rain, could map other types
          currentWeather: stockData.weather?.type || "Unknown",
          weatherType: stockData.weather?.type || "Unknown",
          description: `Current weather: ${stockData.weather?.type || "Unknown"}`,
          effectDescription: `Affects crop growth (details unavailable)`,
          cropBonuses: "Unknown",
          mutations: [], // No mutation data provided
          visualCue: "Unknown",
          rarity: "Unknown",
          updatedAt: stockData.timestamp || 0,
          duration: stockData.weather?.duration || 0
        };

        const restocks = getNextRestocks();

        const gearList = formatList(stock.gearStock);
        const seedList = formatList(stock.seedsStock);
        const eggList = formatList(stock.eggStock);
        const cosmeticList = formatList(stock.cosmeticStock);
        const honeyList = formatList(stock.honeyStock);
        const eventList = formatList(stock.eventStock);

        const weatherDetails =
          `🌤️ 𝗪𝗲𝗮𝘁𝗵𝗲𝗿: ${weather.icon} ${weather.currentWeather}\n` +
          `⏳ Duration: ${formatDuration(weather.duration)}\n` +
          `📖 Description: ${weather.description}\n` +
          `📌 Effect: ${weather.effectDescription}\n` +
          `🪄 Crop Bonus: ${weather.cropBonuses}\n` +
          `🧬 Mutations: None\n` +
          `📢 Visual Cue: ${weather.visualCue}\n` +
          `🌟 Rarity: ${weather.rarity}`;

        const message =
          `🌾 �_G𝗿𝗼𝘄 𝗔 𝗚𝗮𝗿𝗱𝗲𝗻 — 𝗦𝘁𝗼𝗰𝗸 𝗖𝗵𝗲𝗰𝗸 (New API)\n\n` +
          `🛠️ 𝗚𝗲𝗮𝗿:\n${gearList}\n⏳ Restock in: ${restocks.gear}\n\n` +
          `🌱 𝗦𝗲𝗲𝗱𝘀:\n${seedList}\n⏳ Restock in: ${restocks.seed}\n\n` +
          `🥚 𝗘𝗴𝗴𝘀:\n${eggList}\n⏳ Restock in: ${restocks.egg}\n\n` +
          `🎨 𝗖𝗼𝘀𝗺𝗲𝘁𝗶𝗰𝘀:\n${cosmeticList}\n⏳ Restock in: ${restocks.cosmetics}\n\n` +
          `🍯 𝗛𝗼𝗻𝗲𝘆:\n${honeyList}\n⏳ Restock in: ${restocks.honey}\n\n` +
          `🎉 𝗘𝘃𝗲𝗻𝘁:\n${eventList}\n⏳ Restock in: ${restocks.event}\n\n` +
          weatherDetails;

        await sendResponseInChunks(senderId, message, config);
      } catch (err) {
        console.error(`❌ Stock check error for ${senderId}:`, err.message);
        await sendResponseInChunks(senderId, `❌ Error fetching data: ${err.message}. Please try again.`, config);
      }
    } else if (!subCommand || !['on', 'off'].includes(subCommand)) {
      await sendResponseInChunks(senderId, "📌 Usage:\n• `stock on` to start tracking (new API)\n• `stock off` to stop tracking\n• `stock check` to view current stock and weather (new API)", config);
      return;
    } else if (subCommand === 'off') {
      const session = activeSessions.get(senderId);
      if (session) {
        clearInterval(session.interval);
        activeSessions.delete(senderId);
        await sendResponseInChunks(senderId, "🛑 Stock tracking stopped.", config);
      } else {
        await sendResponseInChunks(senderId, "⚠️ You don't have an active stock session.", config);
      }
      return;
    } else if (subCommand === 'on') {
      if (activeSessions.has(senderId)) {
        await sendResponseInChunks(senderId, "📡 You're already tracking. Use `gagstock off` or `stock off` to stop.", config);
        return;
      }

      await sendResponseInChunks(senderId, "✅ Stock tracking started (new API)! You'll be notified when stock or weather changes.", config);

      const sessionData = {
        interval: null,
        lastCombinedKey: null,
        lastMessage: "",
        errorCount: 0,
        type: 'stock'
      };

      async function fetchAll() {
        try {
          const res = await fetch("https://www.gamersberg.com/api/grow-a-garden/stock").then(async res => {
            if (!res.ok) throw new Error(`Stock API error: ${res.status}`);
            return res.json();
          });

          if (!res.success || !res.data?.[0]) throw new Error("Invalid API response");

          const stockData = res.data[0];
          const stock = {
            gearStock: objectToArray(stockData.gear || {}),
            seedsStock: objectToArray(stockData.seeds || {}),
            eggStock: (stockData.eggs || []).map(egg => ({
              name: egg.name,
              value: egg.quantity,
              emoji: EMOJI_MAP[egg.name] || ""
            })),
            cosmeticStock: objectToArray(stockData.cosmetic || {}),
            honeyStock: objectToArray(stockData.honeyevent || {}),
            eventStock: objectToArray(stockData.event || {})
          };

          const weather = {
            icon: "🌧️", // Default for Rain
            currentWeather: stockData.weather?.type || "Unknown",
            weatherType: stockData.weather?.type || "Unknown",
            description: `Current weather: ${stockData.weather?.type || "Unknown"}`,
            effectDescription: `Affects crop growth (details unavailable)`,
            cropBonuses: "Unknown",
            mutations: [],
            visualCue: "Unknown",
            rarity: "Unknown",
            updatedAt: stockData.timestamp || 0,
            duration: stockData.weather?.duration || 0
          };

          const combinedKey = JSON.stringify({
            gearStock: stock.gearStock,
            seedsStock: stock.seedsStock,
            eggStock: stock.eggStock,
            cosmeticStock: stock.cosmeticStock,
            honeyStock: stock.honeyStock,
            eventStock: stock.eventStock,
            weatherUpdatedAt: weather.updatedAt,
            weatherCurrent: weather.currentWeather
          });

          if (combinedKey === sessionData.lastCombinedKey) return;
          sessionData.lastCombinedKey = combinedKey;
          sessionData.errorCount = 0;

          const restocks = getNextRestocks();

          const gearList = formatList(stock.gearStock);
          const seedList = formatList(stock.seedsStock);
          const eggList = formatList(stock.eggStock);
          const cosmeticList = formatList(stock.cosmeticStock);
          const honeyList = formatList(stock.honeyStock);
          const eventList = formatList(stock.eventStock);

          const weatherDetails =
            `🌤️ 𝗪𝗲𝗮𝘁𝗵𝗲𝗿: ${weather.icon} ${weather.currentWeather}\n` +
            `⏳ Duration: ${formatDuration(weather.duration)}\n` +
            `📖 Description: ${weather.description}\n` +
            `📌 Effect: ${weather.effectDescription}\n` +
            `🪄 Crop Bonus: ${weather.cropBonuses}\n` +
            `🧬 Mutations: None\n` +
            `📢 Visual Cue: ${weather.visualCue}\n` +
            `🌟 Rarity: ${weather.rarity}`;

          const message =
            `🌾 𝗚𝗿𝗼𝘄 𝗔 𝗚𝗮𝗿𝗱𝗲𝗻 — 𝗧𝗿𝗮𝗰𝗸𝗲𝗿 (New API)\n\n` +
            `🛠️ 𝗚𝗲𝗮𝗿:\n${gearList}\n⏳ Restock in: ${restocks.gear}\n\n` +
            `🌱 𝗦𝗲𝗲𝗱𝘀:\n${seedList}\n⏳ Restock in: ${restocks.seed}\n\n` +
            `🥚 𝗘𝗴𝗴𝘀:\n${eggList}\n⏳ Restock in: ${restocks.egg}\n\n` +
            `🎨 𝗖𝗼𝘀𝗺𝗲𝘁𝗶𝗰𝘀:\n${cosmeticList}\n⏳ Restock in: ${restocks.cosmetics}\n\n` +
            `🍯 𝗛𝗼𝗻𝗲𝘆:\n${honeyList}\n⏳ Restock in: ${restocks.honey}\n\n` +
            `🎉 𝗘𝘃𝗲𝗻𝘁:\n${eventList}\n⏳ Restock in: ${restocks.event}\n\n` +
            weatherDetails;

          if (message !== sessionData.lastMessage) {
            sessionData.lastMessage = message;
            await sendResponseInChunks(senderId, message, config);
          }
        } catch (err) {
          sessionData.errorCount++;
          console.error(`❌ Stock error for ${senderId}:`, err.message);
          if (sessionData.errorCount >= 3) {
            clearInterval(sessionData.interval);
            activeSessions.delete(senderId);
            await sendResponseInChunks(senderId, "❌ Tracking stopped due to repeated errors.", config);
          }
        }
      }

      sessionData.interval = setInterval(fetchAll, 30 * 1000);
      activeSessions.set(senderId, sessionData);
      await fetchAll();
    }
  } else if (command === 'commands' || command === 'help') {
    const commandsList =
      `📋 𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀:\n\n` +
      `- gagstock: Track Grow A Garden stock and weather (old API)\n` +
      `  Usage: gagstock on | gagstock off\n` +
      `- gagstock check: Check current stock and weather (old API)\n` +
      `  Usage: gagstock check\n` +
      `- stock: Track Grow A Garden stock and weather (new API)\n` +
      `  Usage: stock on | stock off\n` +
      `- stock check: Check current stock and weather (new API)\n` +
      `  Usage: stock check\n` +
      `- commands: Show this list\n` +
      `  Usage: commands\n\n` +
      `For other queries, I'll respond with AI-powered answers!`;
    await sendResponseInChunks(senderId, commandsList, config);
  } else {
    let aiResponse;
    try {
      const apiUrl = `${config.deepseekEndpoint}?ask=${encodeURIComponent(messageText)}&apikey=${config.deepseekApiKey}`;
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
      const data = await response.json();
      aiResponse = data.response || "I couldn't generate a response.";
    } catch (error) {
      console.error('DeepSeek API error:', error);
      aiResponse = "Sorry, I'm having trouble thinking right now.";
    }
    await sendResponseInChunks(senderId, aiResponse, config);
  }
}

async function sendFacebookMessage(recipientId, messageText, config) {
  const responseData = typeof messageText === 'string' ? { recipient: { id: recipientId }, message: { text: messageText } } : { recipient: { id: recipientId }, message: messageText };
  try {
    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(responseData)
      }
    );
    if (!fbResponse.ok) {
      const errorData = await fbResponse.json();
      console.error('Facebook API error:', errorData);
    }
  } catch (error) {
    console.error('Error sending Facebook message:', error);
  }
}
