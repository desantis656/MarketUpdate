// Generates a stock market summary using the OpenAI API and publishes it to data/summary.json.
// Runs on a schedule via .github/workflows/update-summary.yml, but only actually calls the API
// when the real America/New_York time matches one of the configured slots (handles DST correctly
// and prevents duplicate runs for the same slot/day).

import fs from "node:fs/promises";

const SUMMARY_FILE = new URL("../data/summary.json", import.meta.url);
const TOLERANCE_MINUTES = 12;

const SLOTS = [
  { name: "open", label: "Market Open", hour: 9, minute: 45 },
  { name: "midday", label: "Midday Update", hour: 12, minute: 30 },
  { name: "close", label: "Market Close", hour: 16, minute: 15 },
];

// Free, no-API-key CSV quote feed for the major US indices.
const QUOTE_URL = "https://stooq.com/q/l/?s=^spx,^dji,^ndq&f=sd2t2ohlcv&h&e=csv";
const INDEX_NAMES = { "^SPX": "S&P 500", "^DJI": "Dow Jones", "^NDQ": "Nasdaq" };

function getNyParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    weekday: get("weekday"),
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function matchSlot(ny) {
  for (const slot of SLOTS) {
    const diff = Math.abs(ny.hour * 60 + ny.minute - (slot.hour * 60 + slot.minute));
    if (diff <= TOLERANCE_MINUTES) return slot;
  }
  return null;
}

async function fetchQuotes() {
  const res = await fetch(QUOTE_URL);
  const csv = (await res.text()).trim();
  const [, ...rows] = csv.split("\n"); // drop header row
  return rows.map((row) => {
    const [symbol, , , open, high, low, close] = row.split(",");
    return { name: INDEX_NAMES[symbol] ?? symbol, open, high, low, close };
  });
}

async function generateSummary({ slot, ny, quotes }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const quoteLines = quotes
    .map((q) => `${q.name}: open ${q.open}, high ${q.high}, low ${q.low}, last ${q.close}`)
    .join("\n");

  const systemPrompt = [
    "You are a financial markets analyst writing a short, factual stock market update for a public website.",
    "Use only the index data provided to you as ground truth; never invent prices.",
    "Write 3-5 sentences: overall market direction, standout index moves, and one line of plain-English context.",
    "Neutral, no investment advice, no speculation about causes you aren't given data for.",
  ].join(" ");

  const userPrompt = `Slot: ${slot.label}\nDate (America/New_York): ${ny.dateStr}\nIndex data:\n${quoteLines}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function readExisting() {
  try {
    return JSON.parse(await fs.readFile(SUMMARY_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const now = new Date();
  const ny = getNyParts(now);

  if (ny.weekday === "Sat" || ny.weekday === "Sun") {
    console.log("Weekend, skipping.");
    return;
  }

  const slot = matchSlot(ny);
  if (!slot) {
    console.log(`No slot matches current NY time ${ny.hour}:${ny.minute}, skipping.`);
    return;
  }

  const existing = await readExisting();
  if (existing?.date === ny.dateStr && existing?.slot === slot.name) {
    console.log(`Slot "${slot.name}" already generated for ${ny.dateStr}, skipping.`);
    return;
  }

  const quotes = await fetchQuotes();
  const summary = await generateSummary({ slot, ny, quotes });

  const output = {
    date: ny.dateStr,
    slot: slot.name,
    slotLabel: slot.label,
    generatedAt: now.toISOString(),
    quotes,
    summary,
  };

  await fs.writeFile(SUMMARY_FILE, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote summary for slot "${slot.name}" (${ny.dateStr}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
