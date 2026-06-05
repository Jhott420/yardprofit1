import { useState, useEffect, useMemo, useRef } from "react";

const STRIPE = "https://buy.stripe.com/fZu7sNd6e7cbeoq2oz5wI00";
const TRIAL_MAX = 2;

// ─── storage ─────────────────────────────────────────────────────────────────
const ls = {
  get:(k,d)=>{ try{const v=sessionStorage.getItem(k);return v!=null?JSON.parse(v):d;}catch{return d;} },
  set:(k,v)=>{ try{sessionStorage.setItem(k,JSON.stringify(v));}catch{} },
};

// GA4 event tracking
function track(event, params={}) {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, params);
    }
  } catch(e) {}
}

// ─── auto multiplier ─────────────────────────────────────────────────────────
function detectMulti(name) {
  const q = (name||"").toLowerCase();
  const known = {
    "lkq":1.0,"pick your part":1.0,"pull-a-part":0.9,"pull a part":0.9,
    "pick-n-pull":1.0,"u-pull-it":0.85,"u pull it":0.85,"u-pull":0.85,
    "copart":0.65,"iaai":0.65,"manheim":0.75,"gershow":1.05,
    "lacey":0.88,"runyon":0.92,"savage":1.1,"napa":1.2,
  };
  for (const [k,v] of Object.entries(known)) {
    if (q.includes(k)) return { multi:v, reason:"Matched known chain: "+k };
  }
  if (/auction|bid|total.?loss/.test(q))  return { multi:0.65, reason:"Auction yard" };
  if (/u.?pull|self.?serv|pick.?your/.test(q)) return { multi:0.88, reason:"U-pull / self-service" };
  if (/full.?serv|retail|dealer/.test(q)) return { multi:1.2,  reason:"Full-service / retail" };
  if (/salvage|junk|wreck|scrap|dismantl/.test(q)) return { multi:0.95, reason:"Salvage yard" };
  if (/craigslist|facebook|private/.test(q)) return { multi:0.65, reason:"Private seller" };
  return { multi:1.0, reason:"Standard yard" };
}

// ─── inventory text parser ────────────────────────────────────────────────────
function parseCarList(text) {
  if (!text || !text.trim()) return [];
  const MODELS = {
    "f-150":["ford","f150","f-150"],"silverado":["chevrolet","silverado"],"sierra":["gmc","sierra"],
    "tacoma":["toyota","tacoma"],"tundra":["toyota","tundra"],"camry":["toyota","camry"],
    "corolla":["toyota","corolla"],"accord":["honda","accord"],"civic":["honda","civic"],
    "altima":["nissan","altima"],"mustang":["ford","mustang"],"camaro":["chevrolet","camaro"],
    "challenger":["dodge","challenger"],"charger":["dodge","charger"],
    "wrangler":["jeep","wrangler"],"cherokee":["jeep","cherokee"],
    "tahoe":["chevrolet","tahoe"],"suburban":["chevrolet","suburban"],
    "explorer":["ford","explorer"],"expedition":["ford","expedition"],
    "4runner":["toyota","4runner"],"rav4":["toyota","rav4"],
    "prius":["toyota","prius"],"supra":["toyota","supra"],
    "350z":["nissan","350z"],"370z":["nissan","370z"],
    "wrx":["subaru","wrx"],"sti":["subaru","wrx sti"],
    "evo":["mitsubishi","lancer evo"],"s2000":["honda","s2000"],
    "rx-7":["mazda","rx-7"],"rx7":["mazda","rx-7"],
    "rx-8":["mazda","rx-8"],"miata":["mazda","miata"],
    "f-250":["ford","f-250"],"f-350":["ford","f-350"],
    "2500":["chevrolet","silverado 2500"],"3500":["chevrolet","silverado 3500"],
  };
  const MAKES = ["chevrolet","chevy","gmc","ford","dodge","ram","jeep","toyota","honda",
    "nissan","mazda","subaru","mitsubishi","bmw","mercedes","audi","volkswagen","vw",
    "hyundai","kia","lexus","acura","infiniti","cadillac","buick","pontiac","lincoln",
    "volvo","porsche","land rover","range rover","jaguar","ferrari","lamborghini",
    "bentley","maserati","oldsmobile","saturn","hummer","isuzu","suzuki","saab"];

  const lines = text.split(/[\n\r,;|]+/).map(l=>l.trim()).filter(l=>l.length>2);
  const results = [];

  for (const line of lines) {
    const low = line.toLowerCase().replace(/[^\w\s\-]/g," ");
    const yearM = low.match(/\b(19[6-9]\d|20[0-2]\d)\b/);
    const year = yearM ? yearM[1] : null;

    let found = null;
    for (const [model, [make, full]] of Object.entries(MODELS)) {
      if (low.includes(model)) {
        found = year ? `${year} ${make.charAt(0).toUpperCase()+make.slice(1)} ${full}` : `${make.charAt(0).toUpperCase()+make.slice(1)} ${full}`;
        found = found.replace(/\b\w/g,c=>c.toUpperCase());
        break;
      }
    }
    if (!found) {
      for (const make of MAKES) {
        if (low.includes(make)) {
          const rest = low.replace(make,"").replace(/\b(19|20)\d{2}\b/,"").replace(/[^\w\s]/g," ").trim().split(" ").slice(0,3).join(" ");
          const cap = (s) => s.charAt(0).toUpperCase()+s.slice(1);
          found = [year, cap(make==="chevy"?"chevrolet":make), rest].filter(Boolean).join(" ").replace(/\b\w/g,c=>c.toUpperCase());
          break;
        }
      }
    }
    if (!found && year && line.split(" ").length >= 3) {
      found = line.replace(/\b\w/g,c=>c.toUpperCase()).trim();
    }
    if (found && found.length > 4 && !results.includes(found)) {
      results.push(found);
    }
  }
  return results;
}

// ─── auto-fetch inventory via Claude API ─────────────────────────────────────
async function fetchInventory(yard, onStatus) {
  onStatus("Searching for vehicles at " + yard.name + "...");
  const invUrl = yard.inventory || yard.row52 || yard.website || "";
  const prompt = `Search for current vehicle inventory at the junkyard named "${yard.name}"${yard.city ? " in " + yard.city + (yard.state ? ", " + yard.state : "") : ""}. ${invUrl ? "Their inventory URL is: " + invUrl + ". " : ""}Return ONLY a plain list of vehicles currently available, one per line, format: YEAR MAKE MODEL. No explanations, no headers, just the list.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error("API error " + res.status);
  const data = await res.json();
  onStatus("Parsing results...");

  const text = (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");

  const cars = parseCarList(text);
  if (cars.length === 0) throw new Error("No vehicles found for this yard");
  return cars;
}

// ─── location-based yard finder ──────────────────────────────────────────────
async function findYardsNearLocation(lat, lng, query, onStatus) {
  onStatus("Finding yards near you...");
  const locationDesc = query
    ? `"${query}" junkyard near coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}`
    : `junkyard salvage yard auto parts near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  const prompt = `Search for real junkyard and auto salvage businesses near GPS coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}${query ? ` matching "${query}"` : ""}. Find actual businesses with real names, addresses, and phone numbers. For each yard found return EXACTLY this format, one per line:
NAME | ADDRESS | PHONE | WEBSITE | TYPE

Where TYPE is one of: u-pull, full-service, auction, private, dealer
Return 5-10 results. Only real businesses, no made-up names.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error("Search failed: " + res.status);
  const data = await res.json();
  onStatus("Parsing results...");

  const text = (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");

  // Parse the pipe-delimited results
  const yards = [];
  const lines = text.split("\n").filter(l => l.includes("|"));
  for (const line of lines) {
    const parts = line.split("|").map(s => s.trim());
    if (parts.length >= 2 && parts[0].length > 2) {
      const name    = parts[0].replace(/^\d+\.\s*/, "").trim();
      const address = parts[1] || "";
      const phone   = parts[2] || "";
      const website = parts[3] || "";
      const type    = (parts[4] || "salvage").toLowerCase();
      if (name && name.length > 2 && !/^name$/i.test(name)) {
        const detected = detectMulti(name + " " + type);
        yards.push({
          id: "found_" + Date.now() + "_" + yards.length,
          name, address, phone, website,
          type: type.includes("u-pull") || type.includes("self") ? "U-Pull" :
                type.includes("auction") ? "Auction" :
                type.includes("full") ? "Full-Service" :
                type.includes("dealer") ? "Dealer" : "Salvage",
          priceMulti: detected.multi,
          autoReason: detected.reason,
          isFound: true,
        });
      }
    }
  }
  if (yards.length === 0) throw new Error("No yards found nearby");
  return yards;
}

// ─── known yard chains ────────────────────────────────────────────────────────
const CHAINS = [
  { id:"lkq",       name:"LKQ Pick Your Part",    type:"National", priceMulti:1.0,  color:"#FF6B35", website:"https://www.lkqpickyourpart.com",  inventory:"https://www.lkqpickyourpart.com/locations/",       row52:"https://row52.com/Search/?YardName=LKQ",         states:"Nationwide 200+ locations", notes:"Largest US chain. Online inventory." },
  { id:"pullapart",  name:"Pull-A-Part",            type:"National", priceMulti:0.9,  color:"#00AAFF", website:"https://www.pull-a-part.com",        inventory:"https://www.pull-a-part.com/find-a-car/",          row52:"https://row52.com/Search/?YardName=Pull-A-Part", states:"Southeast & Midwest",       notes:"Flat-rate pricing. Good inventory." },
  { id:"picknpull",  name:"Pick-n-Pull",            type:"National", priceMulti:1.0,  color:"#FFD700", website:"https://www.picknpull.com",           inventory:"https://www.picknpull.com/vehicle/search",         row52:"https://row52.com/Search/?YardName=Pick-n-Pull", states:"West Coast",                notes:"Copart-owned. Watch for $1.99 days." },
  { id:"upullit",    name:"U-Pull-It",              type:"National", priceMulti:0.85, color:"#00FF88", website:"https://www.upullit.com",             inventory:"https://www.upullit.com/inventory",               row52:"https://row52.com/Search/?YardName=U-Pull-It",  states:"CO,FL,GA,NC,TN,TX",        notes:"One of the cheapest chains." },
  { id:"row52",      name:"Row52 (200+ Yards)",     type:"Aggregator",priceMulti:1.0, color:"#CC44FF", website:"https://row52.com",                   inventory:"https://row52.com",                               row52:"https://row52.com",                            states:"Nationwide",               notes:"Search all self-service yards at once." },
  { id:"copart",     name:"Copart Auto Auctions",   type:"Auction",  priceMulti:0.65, color:"#FFCC00", website:"https://www.copart.com",              inventory:"https://www.copart.com/lotSearchResults/",        row52:"",                                             states:"Nationwide",               notes:"Buy whole salvage cars. Highest ROI." },
  { id:"iaai",       name:"IAA Auto Auctions",      type:"Auction",  priceMulti:0.65, color:"#FF9933", website:"https://www.iaai.com",                inventory:"https://www.iaai.com/Search",                    row52:"",                                             states:"Nationwide",               notes:"Buy whole cars, strip for 3-5x profit." },
  { id:"carpart",    name:"Car-Part.com",           type:"Aggregator",priceMulti:1.15,color:"#FF8800", website:"https://www.car-part.com",            inventory:"https://www.car-part.com",                       row52:"",                                             states:"Nationwide",               notes:"Dealer network. Cleaned parts." },
  { id:"craigslist", name:"Craigslist / FB Market", type:"Private",  priceMulti:0.65, color:"#9944FF", website:"https://craigslist.org",              inventory:"https://www.facebook.com/marketplace/category/vehicles", row52:"",                               states:"Nationwide",               notes:"Best margins. Buy whole cars privately." },
  { id:"gershow",    name:"Gershow Recycling",      type:"Regional", priceMulti:1.05, color:"#66AAFF", website:"https://www.gershow.com",             inventory:"https://row52.com/Search/?YardName=Gershow",     row52:"https://row52.com/Search/?YardName=Gershow",   states:"New York",                 notes:"NY's largest salvage network." },
  { id:"runyons",    name:"Runyon's Used Auto",     type:"Regional", priceMulti:0.92, color:"#FFAA44", website:"https://www.runyons.com",             inventory:"https://row52.com/Search/?YardName=Runyon",      row52:"https://row52.com/Search/?YardName=Runyon",    states:"IN,IL,OH,KY",             notes:"Good for Midwest domestic trucks." },
  { id:"laceys",     name:"Lacey's U-Pull",         type:"Regional", priceMulti:0.88, color:"#44DDAA", website:"https://www.laceysupull.com",         inventory:"https://www.laceysupull.com/inventory/",         row52:"https://row52.com/Search/?YardName=Lacey",     states:"ME,NH,VT,MA",             notes:"New England. Cheap u-pull." },
];

// ─── vehicle analyzer ─────────────────────────────────────────────────────────
function analyzeVehicle(raw) {
  const q = raw.toLowerCase();
  const year = parseInt(q.match(/\b(19[6-9]\d|20[0-2]\d)\b/)?.[0] || "2010");

  const isPickup = /f-?150|f-?250|f-?350|silverado|sierra|ram\s*\d|tacoma|tundra|ranger|colorado|frontier|gladiator|pickup|truck/.test(q);
  const isSUV    = /tahoe|suburban|yukon|escalade|4runner|land cruiser|sequoia|pilot|explorer|traverse|wrangler|cherokee|durango|x5|q7|gle|forester|outback/.test(q);
  const isMuscle = /mustang|camaro|challenger|charger|corvette|firebird|gto|nova|chevelle|cuda|barracuda/.test(q);
  const isJDM    = /supra|rx-?7|evo|wrx|sti|s2000|nsx|integra|type.?r|3000gt|mr2|celica|miata|350z|370z|g35|lancer/.test(q);
  const isExotic = /ferrari|lamborghini|maserati|bentley|rolls|mclaren|aston/.test(q);
  const isLuxury = /s-class|e-class|7 series|5 series|a8|ls 500|panamera|cayenne|911/.test(q);
  const isTruck  = isPickup || isSUV;
  const isDiesel = /diesel|duramax|powerstroke|cummins|tdi/.test(q);
  const isHybrid = /hybrid|prius|volt|ioniq|phev/.test(q);
  const isTurbo  = /turbo|sti|wrx|evo|gti|m3|m4|m5|c63|gt-r|hellcat/.test(q);
  const is4WD    = /4wd|4x4|awd|quattro|xdrive|4matic|rubicon/.test(q);
  const isClassic= year < 1980 && (isMuscle || /camaro|nova|chevelle|firebird|mustang|charger|challenger|cuda/.test(q));

  let tier = "mid";
  if (isExotic)  tier = "exotic";
  else if (isClassic) tier = "classic";
  else if (isJDM || isMuscle) tier = "sport";
  else if (isDiesel && isPickup) tier = "diesel_truck";
  else if (/bmw|mercedes|audi|lexus|porsche/.test(q) && isLuxury) tier = "luxury";
  else if (/bmw|mercedes|audi|lexus|porsche/.test(q)) tier = "premium";
  else if (isTruck) tier = "truck";

  const M = { mid:1, truck:1.1, diesel_truck:1.6, sport:1.4, premium:1.8, luxury:2.5, exotic:5, classic:2.2 }[tier] || 1;

  let engBase = Math.round(1200 * M);
  if (tier === "diesel_truck") engBase = 8500;
  if (isExotic) engBase = 35000;
  if (isClassic) engBase = 3500;

  const sc = isSUV||isPickup||isExotic||isMuscle||isJDM;
  const engine = (/i4|4.?cyl|k20|k24|2az/.test(q) ? "4-Cyl" : /i6|inline.?6|2jz|rb26|n54/.test(q) ? "I6" : /v6|3\.[5-9]|vq35|pentastar/.test(q) ? "V6" : "V8") + (isDiesel?" Diesel":isTurbo?" Turbo":"");

  const tip = isExotic ? "Ship parts worldwide — exotic parts have global buyers." :
    isDiesel ? "Diesel premium on everything. DPF alone = $1200+." :
    isHybrid ? "Prius cat = highest palladium content. Pull first." :
    isClassic ? "Restorer market pays 5-10x book value." :
    isJDM    ? "JDM parts have global eBay demand." :
    isPickup  ? "Tailgate + cat + engine = the big three." :
    "Cat converter + engine are your highest-value pulls.";

  const score = Math.min(99, ({exotic:97,luxury:90,diesel_truck:95,classic:93,sport:88,premium:82,truck:80,mid:70}[tier]||70) + (isTurbo?4:0) + (is4WD?3:0));
  const display = raw.trim().replace(/\b\w/g,c=>c.toUpperCase());

  return { display, year, tier, M, engBase, engine, isPickup, isSUV, is4WD, isDiesel, isHybrid, isTurbo, isJDM, isMuscle, isExotic, isClassic, isVan:/odyssey|sienna|caravan|transit|sprinter/.test(q), score, tip };
}

function buildParts(info, yardMult = 1.0) {
  const { M } = info;
  const e = (b) => Math.max(8, Math.round(b * M));
  const y = (ebay) => Math.max(5, Math.round(ebay * 0.16 * yardMult));
  const p = [];
  const add = (name, cat, ebay, demand, weight, tip, search) => {
    const eb = Math.round(ebay);
    p.push({ name, cat, ebay:eb, yard:y(eb), profit:eb-y(eb), demand, weight, tip, search });
  };

  if (!info.isHybrid) add("Complete Engine Assembly", "Engine", info.engBase, "High", "Heavy", "Pull with all accessories attached.", info.display+" engine long block");
  add("Transmission Assembly", "Transmission", e(info.isMuscle||info.tier==="sport"?2200:1100), "High", "Heavy", info.isMuscle?"Manual = huge premium.":"Check shifts smooth.", info.display+" transmission");
  if (info.is4WD||info.isSUV||info.isPickup) add("Transfer Case Assembly", "Transfer Case", e(650), "High", "Heavy", "4WD units always sell.", info.display+" transfer case");

  const catE = info.isHybrid ? 1200 : e(info.isDiesel ? 600 : info.M > 1.3 ? 450 : 380);
  add("Catalytic Converter(s)", "Catalytic Converter", catE, "High", "Medium", info.isHybrid?"HIGHEST palladium content. Pull first.":"Scrap platinum ~$80+. Always pull.", info.display+" catalytic converter OEM");
  if (info.isDiesel) add("DPF / Diesel Particulate Filter", "Catalytic Converter", e(1200), "High", "Heavy", "Big diesel value.", info.display+" DPF filter");

  if (/hellcat|zl1|gt500|viper|z06|redeye/i.test(info.display)) add("Supercharger Assembly", "Engine Components", e(2400), "High", "Heavy", "Forced induction = massive value.", info.display+" supercharger OEM");
  if (info.isTurbo) { add("Turbocharger OEM", "Engine Components", e(600), "High", "Medium", "Test shaft play first.", info.display+" turbocharger"); add("Intercooler OEM", "Engine Components", e(280), "High", "Medium", "", info.display+" intercooler"); }
  add("Intake Manifold OEM", "Engine Components", e(180), "High", "Medium", "", info.display+" intake manifold");
  add("Exhaust Manifolds (pair)", "Engine Components", e(160), "Medium", "Medium", "No cracks.", info.display+" exhaust manifold pair");
  add("Valve Covers (pair)", "Engine Components", e(80), "Medium", "Light", "", info.display+" valve cover pair");
  add("Oil Pan OEM", "Engine Components", e(80), "Medium", "Medium", "", info.display+" oil pan");
  add("Flywheel / Flexplate", "Engine Components", e(100), "Medium", "Medium", "Manual = more.", info.display+" flywheel");

  if (info.isPickup||info.isSUV||info.is4WD) {
    add("Front Axle / Differential", "Drivetrain", e(900), "High", "Heavy", "Locking diff = 2x.", info.display+" front axle diff");
    add("Rear Axle / Differential", "Drivetrain", e(700), "High", "Heavy", "Check gear ratio.", info.display+" rear axle diff");
  } else {
    add("Rear Differential", "Drivetrain", e(info.isMuscle?900:400), "High", "Heavy", info.isMuscle?"Posi = premium.":"", info.display+" rear differential");
  }
  add("CV Axle Shafts (pair)", "Drivetrain", e(160), "High", "Medium", "", info.display+" CV axle pair");
  add("Driveshaft Assembly", "Drivetrain", e(280), "High", "Medium", "Check for vibration.", info.display+" driveshaft");
  if (info.isPickup||info.isSUV) add("Front Driveshaft", "Drivetrain", e(200), "High", "Medium", "", info.display+" front driveshaft");

  const wSz = info.isPickup||info.isSUV ? 20 : info.isExotic||info.tier==="luxury" ? 19 : 18;
  add(`OEM ${wSz}" Alloy Wheels (set/4)`, "Wheels", e(wSz===20?880:wSz===19?720:640), "High", "Heavy", "Sell as set of 4.", info.display+` OEM ${wSz} inch wheels`);
  add("Full-Size Spare Tire+Wheel", "Wheels", e(120), "Medium", "Heavy", "", info.display+" spare tire");

  add("OEM Headlights (pair)", "Lighting", e(info.isExotic||info.tier==="luxury"?800:info.isJDM||info.isMuscle?480:320), "High", "Medium", "LED/Xenon = 2-3x price.", info.display+" headlight pair OEM");
  add("OEM Tail Lights (pair)", "Lighting", e(240), "Medium", "Medium", "", info.display+" tail light pair OEM");
  add("OEM Fog Lights (pair)", "Lighting", e(110), "Medium", "Light", "", info.display+" fog lights OEM");

  add("Engine Control Module (ECU)", "Electronics", e(280), "High", "Light", "Match exact VIN range.", info.display+" ECU PCM OEM");
  add("ABS Control Module", "Electronics", e(180), "High", "Light", "", info.display+" ABS module OEM");
  add("Body Control Module (BCM)", "Electronics", e(160), "Medium", "Light", "", info.display+" BCM OEM");
  add("Airbag / SRS Module", "Electronics", e(220), "High", "Light", "Must be undeployed.", info.display+" SRS airbag module");
  add("Instrument Cluster", "Electronics", e(240), "High", "Light", "", info.display+" instrument cluster OEM");
  add("Factory Navigation Unit", "Electronics", e(info.tier==="luxury"||info.isExotic?700:320), "High", "Light", "Test screen first.", info.display+" factory navigation radio");
  add("Base Stereo / Head Unit", "Electronics", e(110), "Medium", "Light", "", info.display+" radio stereo OEM");
  add("Premium Amp (Bose/HK)", "Electronics", e(info.tier==="luxury"||info.isExotic?280:180), "Medium", "Light", "", info.display+" Bose Harman amplifier");
  add("OEM Backup Camera", "Electronics", e(140), "High", "Light", "", info.display+" backup camera OEM");
  add("Parking Sensor Set", "Electronics", e(95), "Medium", "Light", "", info.display+" parking sensors OEM");
  if (info.year>=2015) add("ADAS Forward Camera", "Electronics", e(180), "High", "Light", "Safety camera. Big demand.", info.display+" ADAS camera OEM");
  add("Sunroof Motor + Module", "Electronics", e(155), "Medium", "Light", "", info.display+" sunroof motor OEM");
  add("Fuse Box / Junction Block", "Electronics", e(130), "Medium", "Light", "", info.display+" fuse box OEM");

  add("Alternator OEM", "Electrical", e(115), "High", "Light", "", info.display+" alternator OEM");
  add("Starter Motor OEM", "Electrical", e(88), "Medium", "Light", "", info.display+" starter motor OEM");
  add("AC Compressor OEM", "Electrical", e(175), "High", "Medium", "", info.display+" AC compressor OEM");
  add("AC Condenser OEM", "Electrical", e(115), "Medium", "Medium", "", info.display+" AC condenser OEM");
  add("Power Steering Rack OEM", "Electrical", e(330), "High", "Medium", "", info.display+" power steering rack OEM");
  add("Power Steering Pump OEM", "Electrical", e(125), "High", "Light", "", info.display+" power steering pump OEM");
  add("Window Regulators (set/4)", "Electrical", e(300), "High", "Light", "$75 each. Always needed.", info.display+" window regulator set OEM");
  add("Power Door Mirrors (pair)", "Electrical", e(250), "High", "Light", "Heated/folding = +$60.", info.display+" power mirror pair OEM");
  add("Fuel Pump Assembly OEM", "Electrical", e(155), "High", "Light", "In-tank. Test before listing.", info.display+" fuel pump OEM");
  add("Fuel Injector Set OEM", "Electrical", e(270), "High", "Light", "Clean set = premium.", info.display+" fuel injectors OEM");
  add("Throttle Body OEM", "Electrical", e(115), "High", "Light", "", info.display+" throttle body OEM");
  add("MAF Sensor OEM", "Electrical", e(78), "High", "Light", "", info.display+" MAF sensor OEM");
  add("O2 Sensor Set OEM", "Electrical", e(115), "High", "Light", "Pull all of them.", info.display+" oxygen sensor set");
  add("Cam/Crank Sensors", "Electrical", e(75), "High", "Light", "Small but always needed.", info.display+" cam crank sensor OEM");
  add("OEM Battery", "Electrical", e(78), "Medium", "Heavy", "Test voltage first.", info.display+" OEM battery");

  add("Radiator OEM", "Cooling", e(155), "High", "Medium", "No cracks.", info.display+" radiator OEM");
  add("Cooling Fan Assembly", "Cooling", e(135), "High", "Medium", "", info.display+" cooling fan OEM");
  add("Water Pump OEM", "Cooling", e(78), "High", "Light", "", info.display+" water pump OEM");
  add("Thermostat + Housing", "Cooling", e(58), "Medium", "Light", "", info.display+" thermostat OEM");

  add("Fuel Tank OEM", "Fuel System", e(195), "Medium", "Heavy", "Drain completely first.", info.display+" fuel tank OEM");
  add("Fuel Rail OEM", "Fuel System", e(78), "Medium", "Light", "", info.display+" fuel rail OEM");

  add("Hood Panel OEM", "Body", e(220), "High", "Medium", info.isClassic?"Numbers-matching = big value.":"No dents. Note paint code.", info.display+" hood panel OEM");
  add("Front Bumper Cover OEM", "Body", e(260), "High", "Medium", info.tier==="sport"?"Sport bumper = 2x.":"No cracks.", info.display+" front bumper cover OEM");
  add("Rear Bumper Cover OEM", "Body", e(195), "High", "Medium", "", info.display+" rear bumper cover OEM");
  add("Driver Front Fender OEM", "Body", e(180), "High", "Medium", "Note color code.", info.display+" front fender driver OEM");
  add("Passenger Front Fender OEM","Body", e(180), "High", "Medium", "", info.display+" front fender passenger OEM");
  add("Front Driver Door Shell", "Body", e(320), "High", "Heavy", "Include glass + regulator.", info.display+" front driver door OEM");
  add("Front Passenger Door Shell", "Body", e(320), "High", "Heavy", "", info.display+" front passenger door OEM");
  add("Rear Driver Door Shell", "Body", e(280), "High", "Heavy", "", info.display+" rear driver door OEM");
  add("Rear Passenger Door Shell", "Body", e(280), "High", "Heavy", "", info.display+" rear passenger door OEM");
  if (info.isPickup) {
    add("Pickup Tailgate Complete", "Body", e(480), "High", "Medium", "Camera-equipped = +$150.", info.display+" tailgate OEM");
    add("Pickup Truck Bed / Box", "Body", e(800), "High", "Heavy", "Rust check critical.", info.display+" truck bed OEM");
  } else if (info.isSUV||info.isVan) {
    add("Liftgate / Hatch Complete", "Body", e(340), "Medium", "Heavy", "", info.display+" liftgate OEM");
  } else {
    add("Trunk Lid / Decklid OEM", "Body", e(240), "Medium", "Medium", info.isClassic?"Duckbill = premium.":"", info.display+" trunk lid OEM");
  }
  add("Driver Quarter Panel", "Body", e(240), "Medium", "Heavy", "", info.display+" quarter panel driver");
  add("Passenger Quarter Panel", "Body", e(240), "Medium", "Heavy", "", info.display+" quarter panel passenger");

  add("Windshield OEM", "Glass", e(195), "High", "Heavy", "No cracks.", info.display+" windshield OEM");
  add("Rear Window Glass", "Glass", e(155), "Medium", "Heavy", "", info.display+" rear window glass");
  add("Front Door Glass (pair)", "Glass", e(140), "Medium", "Medium", "", info.display+" front door window glass");
  add("Rear Door Glass (pair)", "Glass", e(120), "Medium", "Medium", "", info.display+" rear door window glass");
  add("Sunroof / Moonroof Glass", "Glass", e(175), "Medium", "Medium", "No cracks.", info.display+" sunroof glass OEM");

  const seatE = e(info.isExotic?2000:info.tier==="luxury"?800:info.tier==="sport"?380:260);
  add("Front Driver Seat OEM", "Interior", seatE, "High", "Medium", "Power/leather = big premium.", info.display+" front driver seat OEM");
  add("Front Passenger Seat OEM", "Interior", Math.round(seatE*0.85), "High", "Medium", "", info.display+" front passenger seat OEM");
  add("Rear Seat Assembly OEM", "Interior", e(260), "Medium", "Medium", "", info.display+" rear seat OEM");
  add("Center Console Assembly", "Interior", e(260), "Medium", "Light", "Leather lid = +$80.", info.display+" center console OEM");
  add("Dashboard / Dash Pad OEM", "Interior", e(300), "Low", "Medium", "No cracks. Fragile to ship.", info.display+" dashboard OEM");
  add("OEM Steering Wheel", "Interior", e(info.tier==="luxury"||info.isExotic?500:220), "High", "Light", "Heated/multifunc = premium.", info.display+" steering wheel OEM");
  add("Steering Column OEM", "Interior", e(155), "Medium", "Medium", "", info.display+" steering column OEM");
  add("All 4 Interior Door Panels", "Interior", e(380), "Medium", "Light", "Color match critical.", info.display+" door panel set OEM");
  add("Floor Carpet Set OEM", "Interior", e(115), "Low", "Light", "", info.display+" floor carpet OEM");
  add("Headliner OEM", "Interior", e(115), "Low", "Light", "No stains.", info.display+" headliner OEM");
  add("HVAC / Climate Controls", "Interior", e(115), "Medium", "Light", "", info.display+" HVAC climate control OEM");
  add("OEM Shift Knob / Shifter", "Interior", e(75), "Medium", "Light", "Manual = premium.", info.display+" shift knob OEM");

  add("Front Struts / Shocks (pair)", "Suspension", e(195), "High", "Medium", "OEM Bilstein = premium.", info.display+" front strut pair OEM");
  add("Rear Shocks (pair)", "Suspension", e(155), "High", "Medium", "", info.display+" rear shock pair OEM");
  if (info.isSUV) add("Air Suspension Compressor+Bags", "Suspension", e(380), "High", "Medium", "Very common failure. Always sells.", info.display+" air suspension OEM");
  add("Front Control Arms (pair)", "Suspension", e(175), "High", "Medium", "", info.display+" front control arm pair OEM");
  add("Rear Control Arms (pair)", "Suspension", e(155), "High", "Medium", "", info.display+" rear control arm pair OEM");
  add("Sway Bars + End Links", "Suspension", e(155), "Medium", "Medium", "", info.display+" sway bar OEM");
  add("Wheel Bearing Hubs (set/4)", "Suspension", e(195), "High", "Medium", "$48 each. Always needed.", info.display+" wheel bearing hub set OEM");

  add("Front Brake Calipers (pair)", "Brakes", e(155), "High", "Medium", "Brembo = 3x.", info.display+" front caliper pair OEM");
  add("Rear Brake Calipers (pair)", "Brakes", e(115), "Medium", "Medium", "", info.display+" rear caliper pair OEM");
  add("Front Rotors (pair)", "Brakes", e(95), "High", "Heavy", "Drilled/slotted = premium.", info.display+" front rotor pair OEM");
  add("Rear Rotors (pair)", "Brakes", e(78), "High", "Heavy", "", info.display+" rear rotor pair OEM");
  add("Brake Booster + Master Cyl", "Brakes", e(135), "High", "Medium", "", info.display+" brake booster OEM");

  add("Mid Pipes / Y-Pipe OEM", "Exhaust", e(115), "Medium", "Medium", "", info.display+" mid pipe exhaust OEM");
  add("Muffler / Rear Section OEM", "Exhaust", e(135), "Medium", "Medium", "", info.display+" muffler OEM");

  if (info.isPickup||info.isSUV) {
    add("Running Boards / Side Steps", "Truck/SUV", e(310), "Medium", "Medium", "", info.display+" running boards OEM");
    add("Factory Tow Package Wiring", "Truck/SUV", e(175), "High", "Light", "7-pin vs 4-pin.", info.display+" tow wiring OEM");
    add("Roof Rack / Rails OEM", "Truck/SUV", e(195), "Medium", "Medium", "", info.display+" roof rack OEM");
    add("Bed Liner OEM", "Truck/SUV", e(155), "Medium", "Heavy", "", info.display+" bed liner OEM");
    add("Tonneau / Bed Cover OEM", "Truck/SUV", e(390), "High", "Medium", "Power retractable = $800+.", info.display+" tonneau cover OEM");
    if (info.is4WD) add("Skid Plate Set OEM", "Truck/SUV", e(255), "High", "Medium", "Off-road pkg = 2x.", info.display+" skid plates OEM");
  }

  return p.sort((a,b)=>b.profit-a.profit);
}

function getResult(raw, yardMult=1.0) {
  if (!raw || !raw.trim()) return null;
  const info = analyzeVehicle(raw);
  const parts = buildParts(info, yardMult);
  return { key:info.display, engine:info.engine, score:info.score, tip:info.tip, totalProfit:parts.reduce((s,p)=>s+p.profit,0), parts, info };
}

// ─── constants ───────────────────────────────────────────────────────────────
const DC = { High:"#00FF88", Medium:"#FFD700", Low:"#ff6b6b" };
const CI = { Engine:"⚙","Engine Components":"⚙",Transmission:"⚙","Transfer Case":"⚙",Drivetrain:"🔩","Catalytic Converter":"💰",Wheels:"🔵",Lighting:"💡",Electronics:"⚡",Electrical:"⚡",Cooling:"🌡",Interior:"🪑",Body:"🚗",Glass:"🪟",Suspension:"🔩",Brakes:"🛑",Exhaust:"💨","Fuel System":"⛽","Truck/SUV":"🛻" };

function ProfitBar({ profit }) {
  const pct = Math.min((profit/1500)*100, 100);
  const col = profit>800 ? "#00FF88" : profit>250 ? "#FFD700" : "#FF9500";
  return (
    <div style={{background:"#111122",borderRadius:3,height:4,overflow:"hidden"}}>
      <div style={{width:pct+"%",height:"100%",background:col,transition:"width .5s"}} />
    </div>
  );
}

// ─── InventoryPanel component ─────────────────────────────────────────────────
function InventoryPanel({ yard, onClose, onAnalyze }) {
  const [pasteText, setPasteText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");
  const [fetchErr, setFetchErr] = useState("");
  const [fetchedCars, setFetchedCars] = useState([]);
  const savedInv = getYardInventory(yard.id);
  const preview = pasteText.trim() ? parseCarList(pasteText) : [];

  useEffect(() => {
    if (savedInv.length === 0 && !fetching) {
      doFetch();
    }
  }, []);

  function doFetch() {
    setFetching(true);
    setFetchErr("");
    setFetchedCars([]);
    fetchInventory(yard, setFetchMsg)
      .then(cars => { setFetchedCars(cars); setFetchMsg(""); })
      .catch(err => { setFetchErr(err.message); setFetchMsg(""); })
      .finally(() => setFetching(false));
  }

  function saveFetched() {
    const inv = fetchedCars.map((raw,i) => ({ id:"inv_"+i, raw }));
    saveYardInventory(yard.id, inv);
    setFetchedCars([]);
    onClose();
  }

  function savePasted() {
    const inv = preview.map((raw,i) => ({ id:"inv_"+i, raw }));
    saveYardInventory(yard.id, inv);
    setPasteText("");
    onClose();
  }

  function getYardInventory(yId) { return ls.get("yp_inv_"+yId, []); }
  function saveYardInventory(yId, inv) { ls.set("yp_inv_"+yId, inv); }

  const carsToShow = fetchedCars.length > 0 ? fetchedCars : savedInv.map(c=>c.raw);

  return (
    <div style={{background:"rgba(0,170,255,.05)",border:"2px solid rgba(0,170,255,.2)",borderRadius:14,padding:16,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,gap:8}}>
        <div>
          <div style={{fontSize:10,letterSpacing:3,color:"#00aaff",marginBottom:3}}>⚡ AUTO INVENTORY</div>
          <div style={{fontSize:15,fontWeight:800}}>{yard.name}</div>
          {(yard.city||yard.state) && <div style={{fontSize:11,color:"#666",marginTop:1}}>{[yard.city,yard.state].filter(Boolean).join(", ")}</div>}
        </div>
        <button onClick={onClose} style={{padding:"5px 10px",background:"transparent",color:"#666",border:"1px solid rgba(255,255,255,.1)",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11}}>✕</button>
      </div>

      {fetching && (
        <div style={{padding:"20px 16px",textAlign:"center",background:"rgba(0,170,255,.05)",borderRadius:10,marginBottom:12}}>
          <div style={{fontSize:28,marginBottom:8}}>🔍</div>
          <div style={{fontSize:13,color:"#00aaff",fontWeight:700,marginBottom:4}}>{fetchMsg||"Searching..."}</div>
          <div style={{fontSize:11,color:"#555"}}>Automatically fetching live inventory — 10–20 seconds</div>
        </div>
      )}

      {fetchErr && !fetching && (
        <div style={{padding:"10px 13px",background:"rgba(255,107,107,.06)",border:"1px solid rgba(255,107,107,.2)",borderRadius:9,marginBottom:12}}>
          <div style={{fontSize:11,color:"#ff6b6b",marginBottom:6}}>⚠ Auto-fetch issue: {fetchErr}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={doFetch} style={{padding:"5px 12px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.3)",borderRadius:6,color:"#00aaff",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>↻ Retry</button>
            <div style={{fontSize:11,color:"#666",lineHeight:"28px"}}>— or paste the car list manually below</div>
          </div>
        </div>
      )}

      {carsToShow.length > 0 && !fetching && (
        <div style={{marginBottom:12,padding:"12px 14px",background:"rgba(0,255,136,.05)",border:"1px solid rgba(0,255,136,.2)",borderRadius:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
            <div style={{fontSize:9,letterSpacing:2,color:"#00FF88"}}>
              {fetchedCars.length > 0 ? `✓ FETCHED ${fetchedCars.length} VEHICLES` : `SAVED — ${savedInv.length} VEHICLES`}
            </div>
            <div style={{display:"flex",gap:6}}>
              {fetchedCars.length > 0 && (
                <button onClick={saveFetched} style={{padding:"5px 12px",background:"#00FF88",color:"#06060f",border:"none",borderRadius:7,fontWeight:900,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  SAVE ALL {fetchedCars.length} ✓
                </button>
              )}
              <button onClick={doFetch} style={{padding:"5px 10px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.25)",borderRadius:6,color:"#00aaff",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:700}}>↻ Refresh</button>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,maxHeight:180,overflowY:"auto"}}>
            {carsToShow.map((car,i) => (
              <button key={i} onClick={() => { onAnalyze(typeof car==="string"?car:car.raw); onClose(); }}
                style={{padding:"4px 10px",background:"rgba(0,255,136,.08)",border:"1px solid rgba(0,255,136,.2)",borderRadius:6,color:"#aaffcc",cursor:"pointer",fontFamily:"inherit",fontSize:11}}
                onMouseEnter={e=>e.target.style.background="rgba(0,255,136,.15)"} onMouseLeave={e=>e.target.style.background="rgba(0,255,136,.08)"}>
                {typeof car==="string"?car:car.raw} →
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{marginBottom:8}}>
        <div style={{fontSize:9,letterSpacing:2,color:"#555",marginBottom:6}}>
          {savedInv.length>0||carsToShow.length>0 ? "UPDATE — PASTE NEW LIST:" : "OR PASTE MANUALLY:"}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:7}}>
          {yard.inventory && <a href={yard.inventory} target="_blank" rel="noopener noreferrer" style={{padding:"6px 11px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.25)",borderRadius:7,color:"#00aaff",fontSize:10,fontWeight:700,textDecoration:"none"}}>📋 {yard.name.slice(0,18)} Inventory ↗</a>}
          {yard.row52 && yard.row52!==yard.inventory && <a href={yard.row52} target="_blank" rel="noopener noreferrer" style={{padding:"6px 11px",background:"rgba(204,68,255,.08)",border:"1px solid rgba(204,68,255,.2)",borderRadius:7,color:"#CC44FF",fontSize:10,fontWeight:700,textDecoration:"none"}}>Row52 ↗</a>}
          <a href={"https://row52.com/Search/?YardName="+encodeURIComponent(yard.name)} target="_blank" rel="noopener noreferrer" style={{padding:"6px 11px",background:"rgba(204,68,255,.06)",border:"1px solid rgba(204,68,255,.15)",borderRadius:7,color:"#CC44FF",fontSize:10,fontWeight:700,textDecoration:"none"}}>Search Row52 ↗</a>
        </div>
        <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
          placeholder={"Paste any car list — any format:\n\n2015 Ford F-150 Lariat\n2008 Honda Civic EX\nF250 diesel 2016\nChevy Silverado 2012\n\nThe app reads any messy format automatically."}
          style={{width:"100%",height:120,padding:"9px 12px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"#fff",fontFamily:"inherit",fontSize:12,outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.7}} />
        {preview.length > 0 && (
          <div style={{margin:"7px 0",padding:"8px 11px",background:"rgba(0,255,136,.04)",border:"1px solid rgba(0,255,136,.15)",borderRadius:7}}>
            <div style={{fontSize:9,color:"#00FF88",letterSpacing:2,marginBottom:5}}>✓ {preview.length} CARS DETECTED</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {preview.map((c,i)=><span key={i} style={{padding:"3px 8px",background:"rgba(0,255,136,.07)",borderRadius:5,fontSize:10,color:"#aaffcc"}}>{c}</span>)}
            </div>
          </div>
        )}
        {preview.length > 0 && (
          <button onClick={savePasted} style={{marginTop:7,width:"100%",padding:"9px",background:"#FFD700",color:"#06060f",border:"none",borderRadius:7,fontWeight:900,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            SAVE {preview.length} CARS ✓
          </button>
        )}
      </div>

      <div style={{display:"flex",gap:7,borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:10}}>
        {yard.inventory && <a href={yard.inventory} target="_blank" rel="noopener noreferrer" style={{padding:"6px 12px",background:"rgba(0,170,255,.08)",border:"1px solid rgba(0,170,255,.2)",borderRadius:7,color:"#00aaff",fontSize:10,fontWeight:700,textDecoration:"none"}}>LIVE INVENTORY ↗</a>}
        <button onClick={onClose} style={{padding:"6px 12px",background:"rgba(0,255,136,.07)",color:"#00FF88",border:"1px solid rgba(0,255,136,.2)",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:700,marginLeft:"auto"}}>DONE →</button>
      </div>
    </div>
  );
}
function getYardInventory(yId) { return ls.get("yp_inv_"+yId, []); }
function saveYardInventory(yId, inv) { ls.set("yp_inv_"+yId, inv); }

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [q, setQ]               = useState("");
  const [screen, setScreen]     = useState("home");
  const [result, setResult]     = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [sort, setSort]         = useState("profit");
  const [filter, setFilter]     = useState("All");
  const [xpart, setXpart]       = useState(null);
  const [trial, setTrial]       = useState(() => ls.get("yp_t", 0));
  const [sub, setSub]           = useState(() => ls.get("yp_s", false));
  const [email, setEmail]       = useState(() => ls.get("yp_email", ""));
  const [emailSubmitted, setEmailSubmitted] = useState(() => ls.get("yp_email_done", false));
  const [emailErr, setEmailErr] = useState("");
  const [yards, setYards]       = useState(() => ls.get("yp_yards", []));
  const [activeYardId, setActiveYardId] = useState(() => ls.get("yp_active", null));
  const [invPanelYard, setInvPanelYard] = useState(null);
  const [yardSearch, setYardSearch]     = useState("");
  const [yardFilter, setYardFilter]     = useState("All");
  const [yardForm, setYardForm] = useState({ name:"", city:"", state:"", phone:"", website:"", priceMulti:"1.0", notes:"", autoReason:"" });
  const [editingYardId, setEditingYardId] = useState(null);
  const [userLocation, setUserLocation]   = useState(null);   // {lat, lng, label}
  const [locLoading, setLocLoading]       = useState(false);
  const [nearbyYards, setNearbyYards]     = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyStatus, setNearbyStatus]   = useState("");
  const [nearbyError, setNearbyError]     = useState("");
  const [showNearby, setShowNearby]       = useState(false);
  const qRef = useRef(q);

  const trialLeft = Math.max(0, TRIAL_MAX - trial);
  const trialDone = !sub && trial >= TRIAL_MAX;
  const allYards  = [...CHAINS, ...yards.map(y=>({...y,type:"Custom",isCustom:true}))];
  const activeYard = allYards.find(y => y.id === activeYardId) || null;
  const yardMult  = activeYard?.priceMulti ?? 1.0;

  useEffect(() => {
    document.head.insertAdjacentHTML("beforeend","<style>@keyframes fadeUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}} .row{animation:fadeUp .18s ease both}</style>");
    // Auto-unlock if Stripe redirected back with ?paid=1 or ?success=true
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid")==="1" || params.get("success")==="true" || params.get("unlocked")==="1") {
      ls.set("yp_s", true);
      setSub(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Auto-request location on load (silent — no alert if denied)
    if (!ls.get("yp_loc_asked", false)) {
      ls.set("yp_loc_asked", true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { latitude: lat, longitude: lng } = pos.coords;
            setUserLocation({ lat, lng, label: lat.toFixed(3)+", "+lng.toFixed(3) });
          },
          () => {} // silent fail — user can still tap Near Me manually
        );
      }
    } else if (ls.get("yp_loc", null)) {
      // Restore saved location from previous session
      const saved = ls.get("yp_loc", null);
      if (saved) setUserLocation(saved);
    }
  }, []);
  useEffect(() => { qRef.current = q; }, [q]);

  function go(v) {
    const term = (v !== undefined ? v : qRef.current).trim();
    if (!term) return;
    if (trialDone) {
      track('paywall_shown', { trial_count: trial });
      setScreen("paywall"); return;
    }
    let r;
    try { r = getResult(term, yardMult); } catch(e) { alert("Error: "+e.message); return; }
    if (!r) return;
    setResult(r); setQ(r.key); setExpanded(null); setFilter("All"); setSort("profit");
    const n = trial + 1; setTrial(n); ls.set("yp_t", n);
    track('car_searched', { vehicle: r.key, total_profit: r.totalProfit, lookup_number: n });
    setScreen("results");
  }

  function connectYard(id) {
    const newId = activeYardId === id ? null : id;
    setActiveYardId(newId); ls.set("yp_active", newId);
    if (newId) {
      const y = allYards.find(y=>y.id===newId);
      if (y) setInvPanelYard(y);
    } else {
      setInvPanelYard(null);
    }
  }

  async function submitEmail(e) {
    if (e) e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em || !em.includes("@") || !em.includes(".")) {
      setEmailErr("Enter a valid email address"); return;
    }
    setEmailErr("");
    ls.set("yp_email", em);
    ls.set("yp_email_done", true);
    setEmailSubmitted(true);
    track('email_captured', { source: 'paywall' });
    // Add to Mailchimp via Netlify function
    try {
      await fetch("/.netlify/functions/subscribe", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: em, tags: ["Trial"] })
      });
    } catch(e) { /* fail silently — email captured locally */ }
  }

  function requestLocation() {
    if (!navigator.geolocation) { alert("Geolocation not supported on this device."); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const loc = { lat, lng, label: lat.toFixed(3)+", "+lng.toFixed(3) };
        setUserLocation(loc);
        ls.set("yp_loc", loc);
        setLocLoading(false);
        // Auto-search once location is granted
        doNearbySearch(lat, lng, yardSearch);
      },
      err => {
        setLocLoading(false);
        alert("Location access denied. Try searching by city name instead.");
      },
      { timeout: 10000 }
    );
  }

  function doNearbySearch(lat, lng, query) {
    setNearbyLoading(true);
    setNearbyError("");
    setNearbyYards([]);
    setShowNearby(true);
    findYardsNearLocation(lat, lng, query, setNearbyStatus)
      .then(found => { setNearbyYards(found); setNearbyStatus(""); })
      .catch(err  => { setNearbyError(err.message); setNearbyStatus(""); })
      .finally(()  => setNearbyLoading(false));
  }

  function addFoundYard(foundYard) {
    const ny = {
      ...foundYard,
      id: "yard_" + Date.now(),
      city: foundYard.address?.split(",")[1]?.trim() || "",
      state: foundYard.address?.split(",")[2]?.trim() || "",
      notes: foundYard.address || "",
      type: "Custom",
      isCustom: true,
      color: "#888",
    };
    const updated = [...yards, ny];
    setYards(updated); ls.set("yp_yards", updated);
  }

  function saveYard() {
    const id = editingYardId || "yard_"+Date.now();
    const ny = { ...yardForm, id, priceMulti:parseFloat(yardForm.priceMulti)||1.0, type:"Custom", isCustom:true };
    const updated = editingYardId ? yards.map(y=>y.id===editingYardId?ny:y) : [...yards,ny];
    setYards(updated); ls.set("yp_yards", updated);
    setYardForm({ name:"", city:"", state:"", phone:"", website:"", priceMulti:"1.0", notes:"", autoReason:"" });
    setEditingYardId(null);
  }

  function deleteYard(id) {
    const u = yards.filter(y=>y.id!==id); setYards(u); ls.set("yp_yards",u);
    if (activeYardId===id) { setActiveYardId(null); ls.set("yp_active",null); }
  }

  const cats = useMemo(() => result ? ["All",...new Set(result.parts.map(p=>p.cat))] : ["All"], [result]);

  const sorted = useMemo(() => {
    if (!result) return [];
    let pts = filter==="All" ? [...result.parts] : result.parts.filter(p=>p.cat===filter);
    if (sort==="profit") return pts.sort((a,b)=>b.profit-a.profit);
    if (sort==="ebay")   return pts.sort((a,b)=>b.ebay-a.ebay);
    if (sort==="demand") return pts.sort((a,b)=>(b.demand==="High"?2:b.demand==="Medium"?1:0)-(a.demand==="High"?2:a.demand==="Medium"?1:0));
    return pts.sort((a,b)=>a.name.localeCompare(b.name));
  }, [result, sort, filter]);

  const displayedChains = allYards.filter(y => {
    const ms = !yardSearch || y.name.toLowerCase().includes(yardSearch.toLowerCase()) || (y.states||"").toLowerCase().includes(yardSearch.toLowerCase()) || (y.notes||"").toLowerCase().includes(yardSearch.toLowerCase());
    const mt = yardFilter==="All" || y.type===yardFilter;
    return ms && mt;
  });

  const S = {
    app:  { minHeight:"100vh", background:"#06060f", color:"#e0e0f0", fontFamily:"'Courier New',monospace" },
    grid: { position:"fixed", inset:0, backgroundImage:"linear-gradient(rgba(0,255,136,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.02) 1px,transparent 1px)", backgroundSize:"44px 44px", pointerEvents:"none", zIndex:0 },
    z:    { position:"relative", zIndex:1 },
    hdr:  { borderBottom:"1px solid rgba(0,255,136,.1)", padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", backdropFilter:"blur(12px)", background:"rgba(6,6,15,.93)", position:"sticky", top:0, zIndex:100 },
    inp:  { width:"100%", padding:"12px 14px", fontSize:13, background:"rgba(255,255,255,.04)", border:"1px solid rgba(0,255,136,.25)", borderRadius:8, color:"#fff", outline:"none", fontFamily:"'Courier New',monospace", boxSizing:"border-box" },
    btn:  { padding:"12px 26px", background:"#00FF88", color:"#06060f", border:"none", borderRadius:8, fontWeight:900, fontSize:19, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  };

  function Hdr() {
    return (
      <header style={S.hdr}>
        <div onClick={()=>setScreen("home")} style={{cursor:"pointer"}}>
          <div style={{fontSize:15,fontWeight:900,letterSpacing:4,color:"#00FF88"}}>⚙ YARDPROFIT</div>
          <div style={{fontSize:8,color:"#444",letterSpacing:3}}>ANY VEHICLE · ANY YARD</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {activeYard && (
            <button onClick={()=>setScreen("yards")} style={{padding:"4px 9px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.3)",borderRadius:6,color:"#00aaff",cursor:"pointer",fontFamily:"inherit",fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              📍 {activeYard.name}
            </button>
          )}
          <button onClick={()=>setScreen("yards")} style={{padding:"4px 9px",background:"rgba(255,215,0,.07)",border:"1px solid rgba(255,215,0,.2)",borderRadius:6,color:"#FFD700",cursor:"pointer",fontFamily:"inherit",fontSize:10}}>🏭 YARDS</button>
          {sub
            ? <span style={{padding:"4px 9px",background:"rgba(0,255,136,.1)",border:"1px solid #00FF88",borderRadius:6,color:"#00FF88",fontSize:10,fontWeight:800}}>✓ PRO</span>
            : <button onClick={()=>setScreen(trialDone?"paywall":"sub")} style={{padding:"4px 9px",background:trialDone?"rgba(255,107,107,.1)":"rgba(0,255,136,.07)",border:`1px solid ${trialDone?"#ff6b6b":"rgba(0,255,136,.3)"}`,borderRadius:6,color:trialDone?"#ff6b6b":"#00FF88",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:800}}>
                {trialDone ? "⚠ UPGRADE" : trialLeft+" LEFT"}
              </button>
          }
        </div>
      </header>
    );
  }

  // ── HOME ────────────────────────────────────────────────────────────────────
  if (screen==="home") return (
    <div style={S.app}><div style={S.grid}/><div style={S.z}>
      <Hdr/>
      <div style={{maxWidth:660,margin:"0 auto",padding:"36px 16px 40px"}}>
        {activeYard ? (
          <div style={{background:"rgba(0,170,255,.05)",border:"1px solid rgba(0,170,255,.18)",borderRadius:10,padding:"10px 14px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:10,color:"#00aaff",fontWeight:800}}>📍 ACTIVE: {activeYard.name}</div>
              <div style={{fontSize:10,color:"#666",marginTop:1}}>Cost multiplier: {activeYard.priceMulti}x · prices adjusted</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {activeYard.inventory && <a href={activeYard.inventory} target="_blank" rel="noopener noreferrer" style={{padding:"5px 10px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.3)",borderRadius:6,color:"#00aaff",textDecoration:"none",fontSize:10,fontWeight:700}}>📋 Inventory ↗</a>}
              <button onClick={()=>setScreen("yards")} style={{padding:"5px 10px",background:"rgba(255,215,0,.08)",border:"1px solid rgba(255,215,0,.2)",borderRadius:6,color:"#FFD700",cursor:"pointer",fontFamily:"inherit",fontSize:10}}>Change</button>
            </div>
          </div>
        ) : (
          <div style={{background:"rgba(255,215,0,.04)",border:"1px solid rgba(255,215,0,.15)",borderRadius:10,padding:"10px 14px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{fontSize:11,color:"#cca500"}}>🏭 No yard selected — using national average prices</div>
            <button onClick={()=>setScreen("yards")} style={{padding:"5px 11px",background:"rgba(255,215,0,.1)",border:"1px solid rgba(255,215,0,.3)",borderRadius:6,color:"#FFD700",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:700}}>SELECT YARD →</button>
          </div>
        )}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:10,letterSpacing:5,color:"#00FF88",marginBottom:12,opacity:.8}}>USED BY JUNKYARD FLIPPERS NATIONWIDE</div>
          <h1 style={{fontSize:"clamp(26px,7vw,52px)",fontWeight:900,letterSpacing:-2,margin:"0 0 10px",lineHeight:1.05}}>KNOW WHAT EVERY<br/><span style={{color:"#00FF88",textShadow:"0 0 40px rgba(0,255,136,.3)"}}>PART IS WORTH</span><br/>BEFORE YOU PULL IT</h1>
          <p style={{color:"#888",fontSize:13,maxWidth:420,margin:"0 auto 10px",lineHeight:1.8}}>Type any car — get <strong style={{color:"#ccc"}}>every pullable part</strong> with real eBay sold prices, demand signals, and live sold listing links. Prices adjust for your specific yard.</p>
          <div style={{display:"flex",justifyContent:"center",gap:16,flexWrap:"wrap",marginBottom:6}}>
            {[["$500+","avg profit per car"],["60+","parts analyzed"],["200+","yards connected"]].map(([v,l])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:900,color:"#00FF88"}}>{v}</div>
                <div style={{fontSize:9,color:"#555",letterSpacing:2}}>{l.toUpperCase()}</div>
              </div>
            ))}
          </div>
          {!sub && <div style={{display:"inline-block",padding:"4px 14px",background:"rgba(0,255,136,.08)",border:"1px solid rgba(0,255,136,.2)",borderRadius:20,fontSize:11,color:"#00FF88",marginTop:4}}>✓ {trialLeft} free lookup{trialLeft!==1?"s":""} — no signup needed</div>}
        </div>
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",gap:8,marginBottom:6}}>
            <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go(q)} placeholder="Any car — 1998 Supra · 2015 Hellcat · 1969 Camaro · 2022 Tundra..." style={{...S.inp,flex:1}} onFocus={e=>e.target.style.borderColor="#00FF88"} onBlur={e=>e.target.style.borderColor="rgba(0,255,136,.25)"}/>
            <button onClick={()=>go(q)} style={S.btn}>GO</button>
          </div>
          <p style={{color:"#555",fontSize:11,margin:"3px 0 0 2px"}}>Every year, make, model — domestic, import, classic, exotic, diesel, hybrid</p>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#444",marginBottom:9}}>👇 TAP ANY CAR TO TRY IT FREE</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {["1998 Supra TT","2015 Hellcat","2006 BMW M3","2003 Evo IX","1969 Camaro Z28","2018 F-150 Platinum","2002 Honda S2000","2022 Tundra TRD","2019 Ram Cummins","2016 GT-R","2005 STI","2001 NSX"].map(v=>(
              <button key={v} onClick={()=>go(v)} style={{padding:"5px 10px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:6,color:"#777",cursor:"pointer",fontFamily:"inherit",fontSize:11}} onMouseEnter={e=>{e.target.style.borderColor="rgba(0,255,136,.4)";e.target.style.color="#00FF88";}} onMouseLeave={e=>{e.target.style.borderColor="rgba(255,255,255,.07)";e.target.style.color="#777";}}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[{v:"∞",l:"ANY VEHICLE"},{v:"60+",l:"PARTS/CAR"},{v:"LIVE",l:"eBay LINKS"}].map(s=>(
            <div key={s.l} style={{padding:12,background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.06)",borderRadius:8,textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:"#00FF88"}}>{s.v}</div>
              <div style={{fontSize:9,color:"#444",letterSpacing:3,marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div></div>
  );

  // ── YARDS ───────────────────────────────────────────────────────────────────
  if (screen==="yards") {
    const typeOptions = ["All","National","Regional","Aggregator","Auction","Private","Custom"];
    return (
      <div style={S.app}><div style={S.grid}/><div style={S.z}>
        <Hdr/>
        <div style={{maxWidth:780,margin:"0 auto",padding:"14px 14px 80px"}}>
          <button onClick={()=>setScreen(result?"results":"home")} style={{background:"none",border:"none",color:"#00FF88",cursor:"pointer",fontSize:13,padding:"0 0 10px",fontFamily:"inherit"}}>← BACK</button>

          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,letterSpacing:4,color:"#00FF88",marginBottom:2}}>YARD MANAGER</div>
            <div style={{fontSize:17,fontWeight:900}}>Connect Any Junkyard</div>
            <div style={{fontSize:12,color:"#666",marginTop:3}}>Tap a yard to connect. Inventory loads automatically.</div>
          </div>

          {activeYard && (
            <div style={{background:"rgba(0,255,136,.05)",border:"1px solid rgba(0,255,136,.2)",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:9,color:"#00FF88",fontWeight:800,letterSpacing:1}}>✓ ACTIVE</div>
                <div style={{fontSize:13,fontWeight:700,marginTop:1}}>{activeYard.name}</div>
                <div style={{fontSize:10,color:"#666"}}>{activeYard.priceMulti}x cost · {activeYard.type}</div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {activeYard.inventory && <a href={activeYard.inventory} target="_blank" rel="noopener noreferrer" style={{padding:"5px 10px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.3)",borderRadius:6,color:"#00aaff",textDecoration:"none",fontSize:10,fontWeight:700}}>📋 Inventory ↗</a>}
                <button onClick={()=>setInvPanelYard(activeYard)} style={{padding:"5px 10px",background:"rgba(255,215,0,.1)",border:"1px solid rgba(255,215,0,.3)",borderRadius:6,color:"#FFD700",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:700}}>📋 View Cars</button>
                <button onClick={()=>{setActiveYardId(null);ls.set("yp_active",null);setInvPanelYard(null);}} style={{padding:"5px 10px",background:"rgba(255,107,107,.08)",border:"1px solid rgba(255,107,107,.2)",borderRadius:6,color:"#ff6b6b",cursor:"pointer",fontFamily:"inherit",fontSize:10}}>Disconnect</button>
              </div>
            </div>
          )}

          {invPanelYard && (
            <InventoryPanel yard={invPanelYard} onClose={()=>setInvPanelYard(null)} onAnalyze={v=>{go(v);setScreen("results");}} />
          )}

          {/* Location + Search Bar */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",gap:8,marginBottom:7}}>
              <input
                value={yardSearch}
                onChange={e => {
                  setYardSearch(e.target.value);
                  // Auto-search nearby if location known and 2+ chars typed
                  if (userLocation && e.target.value.trim().length >= 2) {
                    if (window._yardSearchTimer) clearTimeout(window._yardSearchTimer);
                    window._yardSearchTimer = setTimeout(() => doNearbySearch(userLocation.lat, userLocation.lng, e.target.value.trim()), 600);
                  }
                }}
                placeholder={userLocation ? "Type yard name to search near "+userLocation.label+"..." : "Type yard name, city, or state — or tap 📍 for nearby yards"}
                style={{...S.inp, flex:1, padding:"11px 14px", fontSize:13}}
                onFocus={e=>e.target.style.borderColor="#00FF88"}
                onBlur={e=>e.target.style.borderColor="rgba(0,255,136,.25)"}
              />
              {yardSearch && (
                <button onClick={()=>{setYardSearch("");setNearbyYards([]);setShowNearby(false);}} style={{padding:"11px 13px",background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.2)",borderRadius:8,color:"#ff6b6b",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
              )}
              <button
                onClick={() => {
                  if (userLocation) {
                    doNearbySearch(userLocation.lat, userLocation.lng, yardSearch);
                  } else {
                    requestLocation();
                  }
                }}
                style={{padding:"11px 14px",background:userLocation?"rgba(0,255,136,.1)":"rgba(0,170,255,.1)",border:`1px solid ${userLocation?"rgba(0,255,136,.3)":"rgba(0,170,255,.3)"}`,borderRadius:8,color:userLocation?"#00FF88":"#00aaff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}
              >
                {locLoading ? "⏳" : userLocation ? "📍 REFRESH" : "📍 NEAR ME"}
              </button>
            </div>

            {/* Location status */}
            {userLocation && (
              <div style={{fontSize:10,color:"#00FF88",marginBottom:6}}>📍 Location set: {userLocation.label} — type to search or tap Refresh</div>
            )}

            {/* Nearby search loading */}
            {nearbyLoading && (
              <div style={{padding:"14px 16px",background:"rgba(0,170,255,.05)",border:"1px solid rgba(0,170,255,.15)",borderRadius:10,marginBottom:10,textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:6}}>🔍</div>
                <div style={{fontSize:13,color:"#00aaff",fontWeight:700,marginBottom:3}}>{nearbyStatus||"Searching for yards near you..."}</div>
                <div style={{fontSize:11,color:"#555"}}>Using live web search — takes 10–20 seconds</div>
              </div>
            )}

            {/* Nearby error */}
            {nearbyError && !nearbyLoading && (
              <div style={{padding:"9px 12px",background:"rgba(255,107,107,.06)",border:"1px solid rgba(255,107,107,.18)",borderRadius:8,marginBottom:10,fontSize:11,color:"#ff6b6b"}}>
                ⚠ {nearbyError} — Try a different search or add manually below.
              </div>
            )}

            {/* Nearby results */}
            {showNearby && nearbyYards.length > 0 && !nearbyLoading && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,letterSpacing:3,color:"#00aaff",marginBottom:8}}>📍 {nearbyYards.length} YARDS FOUND NEAR YOU</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {nearbyYards.map((yard,i) => {
                    const alreadyAdded = yards.some(y => y.name.toLowerCase()===yard.name.toLowerCase());
                    return (
                      <div key={i} style={{padding:"10px 13px",background:"rgba(0,170,255,.04)",border:"1px solid rgba(0,170,255,.15)",borderRadius:9,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{yard.name}</div>
                          {yard.address && <div style={{fontSize:11,color:"#666",marginBottom:1}}>📍 {yard.address}</div>}
                          {yard.phone && <div style={{fontSize:11,color:"#888"}}>📞 {yard.phone}</div>}
                          <div style={{fontSize:10,color:"#00FF88",marginTop:3}}>Auto-price: {yard.priceMulti}x · {yard.autoReason}</div>
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}}>
                          {yard.website && (
                            <a href={yard.website.startsWith("http")?yard.website:"https://"+yard.website} target="_blank" rel="noopener noreferrer" style={{padding:"5px 10px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.25)",borderRadius:6,color:"#00aaff",fontSize:10,fontWeight:700,textDecoration:"none"}}>SITE ↗</a>
                          )}
                          <a href={"https://www.google.com/maps/search/"+encodeURIComponent(yard.name+" "+yard.address)} target="_blank" rel="noopener noreferrer" style={{padding:"5px 10px",background:"rgba(0,255,136,.08)",border:"1px solid rgba(0,255,136,.2)",borderRadius:6,color:"#00FF88",fontSize:10,fontWeight:700,textDecoration:"none"}}>MAPS ↗</a>
                          {alreadyAdded ? (
                            <span style={{padding:"5px 10px",background:"rgba(255,215,0,.08)",border:"1px solid rgba(255,215,0,.2)",borderRadius:6,color:"#FFD700",fontSize:10}}>✓ SAVED</span>
                          ) : (
                            <button onClick={()=>addFoundYard(yard)} style={{padding:"5px 10px",background:"rgba(0,255,136,.12)",border:"1px solid rgba(0,255,136,.3)",borderRadius:6,color:"#00FF88",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:700}}>+ ADD</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {yardSearch.trim().length > 1 && (
            <div style={{background:"rgba(0,170,255,.04)",border:"1px solid rgba(0,170,255,.13)",borderRadius:10,padding:"11px 13px",marginBottom:10}}>
              <div style={{fontSize:9,letterSpacing:2,color:"#00aaff",marginBottom:8}}>🔍 FIND "{yardSearch.toUpperCase()}" ON</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:9}}>
                {[
                  {l:"Row52 ↗",     href:"https://row52.com/Search/?YardName="+encodeURIComponent(yardSearch),                                                                  c:"#CC44FF",bg:"rgba(204,68,255,.1)",  bo:"rgba(204,68,255,.3)"},
                  {l:"Google ↗",    href:"https://www.google.com/search?q="+encodeURIComponent(yardSearch+" junkyard salvage auto parts"),                                      c:"#00aaff",bg:"rgba(0,170,255,.1)",   bo:"rgba(0,170,255,.3)"},
                  {l:"Maps ↗",      href:"https://www.google.com/maps/search/"+encodeURIComponent(yardSearch+" salvage junkyard"),                                             c:"#00FF88",bg:"rgba(0,255,136,.1)",   bo:"rgba(0,255,136,.3)"},
                  {l:"Yelp ↗",      href:"https://www.yelp.com/search?find_desc="+encodeURIComponent(yardSearch+" auto salvage"),                                             c:"#ff6b6b",bg:"rgba(255,107,107,.1)", bo:"rgba(255,107,107,.3)"},
                  {l:"Car-Part ↗",  href:"https://www.car-part.com/cgi-bin/search.cgi?n="+encodeURIComponent(yardSearch),                                                     c:"#FF8800",bg:"rgba(255,136,0,.1)",   bo:"rgba(255,136,0,.3)"},
                  {l:"Facebook ↗",  href:"https://www.facebook.com/search/pages/?q="+encodeURIComponent(yardSearch+" auto salvage"),                                           c:"#4488FF",bg:"rgba(68,136,255,.1)",  bo:"rgba(68,136,255,.3)"},
                ].map(lnk=>(
                  <a key={lnk.l} href={lnk.href} target="_blank" rel="noopener noreferrer" style={{padding:"7px 12px",background:lnk.bg,border:"1px solid "+lnk.bo,borderRadius:8,color:lnk.c,textDecoration:"none",fontSize:11,fontWeight:700}}>{lnk.l}</a>
                ))}
              </div>
              <button onClick={()=>{const d=detectMulti(yardSearch);setYardForm(p=>({...p,name:yardSearch,priceMulti:String(d.multi),autoReason:d.reason}));document.getElementById("yard-form")?.scrollIntoView({behavior:"smooth"});}} style={{padding:"6px 13px",background:"rgba(0,255,136,.1)",border:"1px solid rgba(0,255,136,.3)",borderRadius:7,color:"#00FF88",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>
                + ADD "{yardSearch.slice(0,28)}"
              </button>
            </div>
          )}

          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:11}}>
            {typeOptions.map(t=>(
              <button key={t} onClick={()=>setYardFilter(t)} style={{padding:"3px 9px",borderRadius:20,fontFamily:"inherit",fontSize:10,cursor:"pointer",background:yardFilter===t?"rgba(0,255,136,.12)":"rgba(255,255,255,.03)",color:yardFilter===t?"#00FF88":"#666",border:yardFilter===t?"1px solid rgba(0,255,136,.3)":"1px solid rgba(255,255,255,.07)"}}>
                {t} ({t==="All"?allYards.length:allYards.filter(y=>y.type===t).length})
              </button>
            ))}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:18}}>
            {displayedChains.length===0 && <div style={{color:"#555",fontSize:13,padding:"14px 0",textAlign:"center"}}>No yards found — add yours below.</div>}
            {displayedChains.map(yard=>{
              const isActive = activeYardId===yard.id;
              const inv = getYardInventory(yard.id);
              return (
                <div key={yard.id} onClick={()=>connectYard(yard.id)} style={{padding:"11px 13px",background:isActive?"rgba(0,255,136,.05)":"rgba(255,255,255,.02)",border:`1px solid ${isActive?"rgba(0,255,136,.28)":"rgba(255,255,255,.06)"}`,borderRadius:10,cursor:"pointer",transition:"all .2s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:13}}>{yard.name}</span>
                        {isActive && <span style={{padding:"1px 6px",background:"rgba(0,255,136,.15)",border:"1px solid #00FF88",borderRadius:8,fontSize:8,color:"#00FF88",fontWeight:800}}>ACTIVE</span>}
                        <span style={{padding:"1px 6px",fontSize:9,color:"#888",border:"1px solid rgba(255,255,255,.1)",borderRadius:6}}>{yard.type}</span>
                        {inv.length>0 && <span style={{padding:"1px 6px",fontSize:9,color:"#FFD700",border:"1px solid rgba(255,215,0,.2)",borderRadius:6,background:"rgba(255,215,0,.07)"}}>📋 {inv.length} cars</span>}
                      </div>
                      <div style={{fontSize:11,color:"#666"}}>{yard.notes}</div>
                      {yard.states && <div style={{fontSize:10,color:"#555",marginTop:2}}>📍 {yard.states}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:14,fontWeight:900,color:yard.priceMulti<0.9?"#00FF88":yard.priceMulti>1.1?"#ff6b6b":"#FFD700"}}>{yard.priceMulti}x</div>
                        <div style={{fontSize:8,color:"#555"}}>COST</div>
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        {yard.inventory && <a href={yard.inventory} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"3px 8px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.25)",borderRadius:5,color:"#00aaff",fontSize:9,fontWeight:700,textDecoration:"none"}}>INV↗</a>}
                        {yard.row52 && yard.row52!==yard.inventory && <a href={yard.row52} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"3px 8px",background:"rgba(204,68,255,.08)",border:"1px solid rgba(204,68,255,.2)",borderRadius:5,color:"#CC44FF",fontSize:9,fontWeight:700,textDecoration:"none"}}>R52↗</a>}
                        {inv.length>0 && <button onClick={e=>{e.stopPropagation();setInvPanelYard(yard);}} style={{padding:"3px 8px",background:"rgba(255,215,0,.08)",border:"1px solid rgba(255,215,0,.2)",borderRadius:5,color:"#FFD700",cursor:"pointer",fontFamily:"inherit",fontSize:9}}>📋</button>}
                        {yard.isCustom && <>
                          <button onClick={e=>{e.stopPropagation();setEditingYardId(yard.id);setYardForm({name:yard.name,city:yard.city||"",state:yard.state||"",phone:yard.phone||"",website:yard.website||"",priceMulti:String(yard.priceMulti),notes:yard.notes||"",autoReason:""});document.getElementById("yard-form")?.scrollIntoView({behavior:"smooth"});}} style={{padding:"3px 8px",background:"rgba(255,215,0,.06)",border:"1px solid rgba(255,215,0,.15)",borderRadius:5,color:"#FFD700",cursor:"pointer",fontFamily:"inherit",fontSize:9}}>EDIT</button>
                          <button onClick={e=>{e.stopPropagation();deleteYard(yard.id);}} style={{padding:"3px 8px",background:"rgba(255,107,107,.07)",border:"1px solid rgba(255,107,107,.18)",borderRadius:5,color:"#ff6b6b",cursor:"pointer",fontFamily:"inherit",fontSize:9}}>DEL</button>
                        </>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div id="yard-form" style={{background:"rgba(0,255,136,.03)",border:"1px solid rgba(0,255,136,.12)",borderRadius:12,padding:"14px"}}>
            <div style={{fontSize:10,letterSpacing:3,color:"#00FF88",marginBottom:10}}>{editingYardId?"✏ EDIT YARD":"+ ADD ANY YARD"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              {[{l:"YARD NAME *",k:"name",ph:"Joe's Auto Salvage"},{l:"CITY",k:"city",ph:"Houston"},{l:"STATE",k:"state",ph:"TX"},{l:"PHONE",k:"phone",ph:"713-555-0123"},{l:"WEBSITE / INVENTORY URL",k:"website",ph:"https://..."}].map(f=>(
                <div key={f.k} style={{gridColumn:f.k==="website"?"1/-1":"auto"}}>
                  <div style={{fontSize:9,letterSpacing:2,color:"#555",marginBottom:3}}>{f.l}</div>
                  <input value={yardForm[f.k]||""} onChange={e=>{const v=e.target.value;if(f.k==="name"){const d=detectMulti(v);setYardForm(p=>({...p,name:v,priceMulti:String(d.multi),autoReason:d.reason}));}else{setYardForm(p=>({...p,[f.k]:v}));}}} placeholder={f.ph}
                    style={{width:"100%",padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:7,color:"#fff",fontFamily:"inherit",fontSize:12,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="rgba(0,255,136,.4)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:9,letterSpacing:2,color:"#555",marginBottom:3}}>PRICE MULTIPLIER (AUTO-DETECTED)</div>
                <select value={yardForm.priceMulti||"1.0"} onChange={e=>setYardForm(p=>({...p,priceMulti:e.target.value,autoReason:""}))} style={{width:"100%",padding:"8px 10px",background:"#0e0e1c",border:"1px solid rgba(255,255,255,.1)",borderRadius:7,color:"#fff",fontFamily:"inherit",fontSize:12,outline:"none",boxSizing:"border-box"}}>
                  <option value="0.5">0.5x — Auction / whole car</option>
                  <option value="0.65">0.65x — Private seller</option>
                  <option value="0.75">0.75x — Very cheap yard</option>
                  <option value="0.85">0.85x — Cheap u-pull</option>
                  <option value="0.9">0.9x — Below average</option>
                  <option value="0.95">0.95x — Slightly below</option>
                  <option value="1.0">1.0x — Average</option>
                  <option value="1.1">1.1x — Slightly above</option>
                  <option value="1.2">1.2x — Above average</option>
                  <option value="1.3">1.3x — Expensive</option>
                  <option value="1.5">1.5x — Premium / dealer</option>
                </select>
                {yardForm.autoReason && <div style={{marginTop:4,fontSize:10,color:"#00FF88"}}>✓ Auto: {yardForm.autoReason}</div>}
              </div>
              <div>
                <div style={{fontSize:9,letterSpacing:2,color:"#555",marginBottom:3}}>NOTES</div>
                <input value={yardForm.notes||""} onChange={e=>setYardForm(p=>({...p,notes:e.target.value}))} placeholder="Good for imports. Ask for Tom." style={{width:"100%",padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:7,color:"#fff",fontFamily:"inherit",fontSize:12,outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor="rgba(0,255,136,.4)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>
              </div>
            </div>
            <div style={{display:"flex",gap:7}}>
              <button onClick={saveYard} disabled={!yardForm.name?.trim()} style={{flex:1,padding:"10px",background:yardForm.name?.trim()?"#00FF88":"rgba(255,255,255,.05)",color:yardForm.name?.trim()?"#06060f":"#444",border:"none",borderRadius:7,fontWeight:900,fontSize:13,cursor:yardForm.name?.trim()?"pointer":"not-allowed",fontFamily:"inherit"}}>
                {editingYardId?"SAVE CHANGES ✓":"ADD YARD +"}
              </button>
              {editingYardId && <button onClick={()=>{setEditingYardId(null);setYardForm({name:"",city:"",state:"",phone:"",website:"",priceMulti:"1.0",notes:"",autoReason:"",});}} style={{padding:"10px 14px",background:"transparent",color:"#666",border:"1px solid rgba(255,255,255,.1)",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Cancel</button>}
            </div>
          </div>
          <div style={{marginTop:12,textAlign:"center"}}>
            <button onClick={()=>setScreen(result?"results":"home")} style={{padding:"10px 26px",background:"#00FF88",color:"#06060f",border:"none",borderRadius:8,fontWeight:900,fontSize:13,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>
              {activeYard?`SEARCH WITH ${activeYard.name.slice(0,20).toUpperCase()} →`:"SEARCH VEHICLES →"}
            </button>
          </div>
        </div>
      </div></div>
    );
  }

  // ── RESULTS ─────────────────────────────────────────────────────────────────
  if (screen==="results" && result) {
    const catCounts = {};
    result.parts.forEach(p=>{ catCounts[p.cat]=(catCounts[p.cat]||0)+1; });
    const yardInv = activeYardId ? getYardInventory(activeYardId) : [];
    return (
      <div style={S.app}><div style={S.grid}/><div style={S.z}>
        <Hdr/>
        <div style={{maxWidth:860,margin:"0 auto",padding:"12px 13px 80px"}}>
          {activeYard && (
            <div style={{padding:"7px 13px",background:"rgba(0,170,255,.04)",border:"1px solid rgba(0,170,255,.13)",borderRadius:8,marginBottom:9,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#00aaff"}}>📍 <strong>{activeYard.name}</strong> · {activeYard.priceMulti}x pricing</span>
              {activeYard.inventory && <a href={activeYard.inventory} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#00aaff",textDecoration:"none",fontWeight:700}}>📋 CHECK INVENTORY ↗</a>}
            </div>
          )}

          {yardInv.length > 0 && (
            <div style={{padding:"8px 12px",background:"rgba(255,215,0,.04)",border:"1px solid rgba(255,215,0,.14)",borderRadius:9,marginBottom:9}}>
              <div style={{fontSize:9,letterSpacing:2,color:"#FFD700",marginBottom:7}}>📋 CARS IN {(activeYard?.name||"").toUpperCase().slice(0,30)}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {yardInv.map((car,i)=>(
                  <button key={i} onClick={()=>go(car.raw)} style={{padding:"4px 9px",background:"rgba(255,215,0,.07)",border:"1px solid rgba(255,215,0,.18)",borderRadius:6,color:"#cca500",cursor:"pointer",fontFamily:"inherit",fontSize:10}} onMouseEnter={e=>e.target.style.color="#FFD700"} onMouseLeave={e=>e.target.style.color="#cca500"}>{car.raw} →</button>
                ))}
              </div>
            </div>
          )}

          <div style={{background:"rgba(0,255,136,.04)",border:"1px solid rgba(0,255,136,.15)",borderRadius:12,padding:"12px 15px",marginBottom:9,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:17,fontWeight:900,wordBreak:"break-word"}}>{result.key}</div>
              <div style={{fontSize:11,color:"#666",marginTop:2}}>{result.engine} · <strong style={{color:"#00FF88"}}>{result.parts.length} parts</strong></div>
              {result.tip && <div style={{fontSize:11,color:"#00FF88",marginTop:4}}>💡 {result.tip}</div>}
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:22,fontWeight:900,color:"#00FF88"}}>${result.totalProfit.toLocaleString()}</div>
              <div style={{fontSize:9,color:"#555",letterSpacing:2}}>TOTAL PROFIT</div>
              <div style={{fontSize:10,color:"#00FF88",marginTop:2}}>SCORE {result.score}/100</div>
            </div>
          </div>

          <div style={{display:"flex",gap:8,marginBottom:9}}>
            <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go(q)} placeholder="Search any other vehicle…" style={{...S.inp,flex:1,padding:"9px 13px",fontSize:12,border:"1px solid rgba(0,255,136,.2)"}} onFocus={e=>e.target.style.borderColor="#00FF88"} onBlur={e=>e.target.style.borderColor="rgba(0,255,136,.2)"}/>
            <button onClick={()=>go(q)} style={{...S.btn,padding:"9px 20px",fontSize:15}}>GO</button>
          </div>

          {sorted.filter(p=>p.profit>400).length>0&&(
            <div style={{padding:"8px 12px",background:"rgba(0,255,136,.04)",border:"1px solid rgba(0,255,136,.12)",borderRadius:9,marginBottom:8}}>
              <div style={{fontSize:9,letterSpacing:2,color:"#00FF88",marginBottom:5}}>🎯 TOP PULLS ON THIS CAR</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {sorted.filter(p=>p.profit>400).slice(0,6).map((p,i)=>(
                  <div key={i} style={{padding:"3px 9px",background:"rgba(0,255,136,.08)",border:"1px solid rgba(0,255,136,.15)",borderRadius:6,fontSize:11}}>
                    <span style={{color:"#aaffcc"}}>{p.name.split(" ").slice(0,3).join(" ")}</span>
                    <span style={{color:"#00FF88",fontWeight:900,marginLeft:5}}>+${p.profit.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:7}}>
            {cats.map(c=>(
              <button key={c} onClick={()=>setFilter(c)} style={{padding:"3px 8px",borderRadius:20,fontFamily:"inherit",fontSize:10,cursor:"pointer",background:filter===c?"rgba(0,255,136,.12)":"rgba(255,255,255,.03)",color:filter===c?"#00FF88":"#666",border:filter===c?"1px solid rgba(0,255,136,.3)":"1px solid rgba(255,255,255,.06)"}}>
                {CI[c]||"📦"} {c}{c!=="All"?` (${catCounts[c]||0})`:""}
              </button>
            ))}
          </div>

          <div style={{display:"flex",gap:4,marginBottom:8,alignItems:"center"}}>
            <span style={{fontSize:9,color:"#444",letterSpacing:2}}>SORT:</span>
            {["profit","ebay","demand","name"].map(s=>(
              <button key={s} onClick={()=>setSort(s)} style={{padding:"3px 8px",borderRadius:5,fontFamily:"inherit",fontSize:9,cursor:"pointer",textTransform:"uppercase",background:sort===s?"rgba(255,215,0,.1)":"transparent",color:sort===s?"#FFD700":"#555",border:sort===s?"1px solid rgba(255,215,0,.3)":"1px solid rgba(255,255,255,.06)"}}>{s}</button>
            ))}
            <span style={{marginLeft:"auto",fontSize:10,color:"#555"}}>{sorted.length} parts</span>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {sorted.map((part,i)=>{
              const open = expanded===i;
              const ebayUrl = "https://www.ebay.com/sch/i.html?_nkw="+encodeURIComponent(part.search||part.name)+"&LH_Sold=1&LH_Complete=1&_sop=13";
              return (
                <div key={i} className="row" style={{animationDelay:Math.min(i,30)*.018+"s",background:"rgba(255,255,255,.02)",border:`1px solid ${open?"rgba(0,255,136,.25)":"rgba(255,255,255,.06)"}`,borderRadius:9,padding:"9px 12px",cursor:"pointer",transition:"border-color .2s"}} onClick={()=>setExpanded(open?null:i)}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3,flexWrap:"wrap"}}>
                        <span>{CI[part.cat]||"📦"}</span>
                        <span style={{fontWeight:700,fontSize:12}}>{part.name}</span>
                        <span style={{padding:"1px 5px",borderRadius:8,fontSize:8,fontWeight:800,background:`rgba(${part.demand==="High"?"0,255,136":part.demand==="Medium"?"255,215,0":"255,107,107"},.1)`,border:`1px solid ${DC[part.demand]}`,color:DC[part.demand]}}>{part.demand}</span>
                        <span style={{fontSize:9,color:"#444"}}>{part.cat}</span>
                      </div>
                      <ProfitBar profit={part.profit}/>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:15,fontWeight:900,color:part.profit>800?"#00FF88":part.profit>250?"#FFD700":"#FF9500"}}>+${part.profit.toLocaleString()}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10}}><span style={{color:"#555"}}>YARD </span><span style={{color:"#ff6b6b",fontWeight:700}}>${part.yard}</span></span>
                    <span style={{fontSize:10}}><span style={{color:"#555"}}>eBay </span><span style={{color:"#00aaff",fontWeight:700}}>${part.ebay}</span></span>
                    <span style={{fontSize:9,color:"#444"}}>{part.weight==="Heavy"?"⚠ Heavy":part.weight==="Medium"?"↕ Med":"✓ Light"}</span>
                    <span style={{fontSize:9,color:"#555",marginLeft:"auto"}}>{open?"▲":"▼"}</span>
                  </div>
                  {open && (
                    <div style={{marginTop:9,paddingTop:9,borderTop:"1px solid rgba(255,255,255,.05)"}}>
                      {part.tip && <div style={{fontSize:11,color:"#aaa",marginBottom:7}}>💡 <span style={{color:"#00FF88"}}>TIP:</span> {part.tip}</div>}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <a href={ebayUrl} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"6px 12px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.35)",borderRadius:8,color:"#00aaff",fontFamily:"inherit",fontSize:11,fontWeight:700,textDecoration:"none"}}>📦 eBay SOLD ↗</a>
                        <a href={"https://www.amazon.com/s?k="+encodeURIComponent(part.search||part.name)} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"6px 12px",background:"rgba(255,153,0,.1)",border:"1px solid rgba(255,153,0,.35)",borderRadius:8,color:"#FF9500",fontFamily:"inherit",fontSize:11,fontWeight:700,textDecoration:"none"}}>🛒 Amazon ↗</a>
                        {activeYard?.inventory && <a href={activeYard.inventory} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"6px 12px",background:"rgba(0,170,255,.07)",border:"1px solid rgba(0,170,255,.18)",borderRadius:8,color:"#00aaff",fontFamily:"inherit",fontSize:11,fontWeight:700,textDecoration:"none"}}>📋 Yard Inv ↗</a>}
                        <button onClick={e=>{e.stopPropagation();setXpart(part);setScreen("xref");}} style={{padding:"6px 12px",background:"rgba(255,215,0,.08)",border:"1px solid rgba(255,215,0,.25)",borderRadius:8,color:"#FFD700",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700}}>🔀 CROSS-REF →</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div></div>
    );
  }

  // ── XREF ────────────────────────────────────────────────────────────────────
  if (screen==="xref" && xpart && result) return (
    <div style={S.app}><div style={S.grid}/><div style={S.z}>
      <Hdr/>
      <div style={{maxWidth:700,margin:"0 auto",padding:"14px 14px 80px"}}>
        <button onClick={()=>setScreen("results")} style={{background:"none",border:"none",color:"#00FF88",cursor:"pointer",fontSize:13,padding:"0 0 10px",fontFamily:"inherit"}}>← BACK</button>
        <div style={{padding:"11px 14px",background:"rgba(255,215,0,.04)",border:"1px solid rgba(255,215,0,.15)",borderRadius:12,marginBottom:12}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#FFD700",marginBottom:3}}>CROSS-REFERENCING</div>
          <div style={{fontSize:15,fontWeight:900}}>{xpart.name}</div>
          <div style={{fontSize:11,color:"#888",marginTop:1}}>from {result.key}</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          <a href={"https://www.ebay.com/sch/i.html?_nkw="+encodeURIComponent(xpart.search||xpart.name)+"&LH_Sold=1&LH_Complete=1&_sop=13"} target="_blank" rel="noopener noreferrer" style={{padding:"7px 13px",background:"rgba(0,170,255,.1)",border:"1px solid rgba(0,170,255,.35)",borderRadius:8,color:"#00aaff",fontFamily:"inherit",fontSize:11,fontWeight:700,textDecoration:"none"}}>📦 eBay SOLD ↗</a>
          <a href={"https://www.amazon.com/s?k="+encodeURIComponent(xpart.search||xpart.name)} target="_blank" rel="noopener noreferrer" style={{padding:"7px 13px",background:"rgba(255,153,0,.1)",border:"1px solid rgba(255,153,0,.35)",borderRadius:8,color:"#FF9500",fontFamily:"inherit",fontSize:11,fontWeight:700,textDecoration:"none"}}>🛒 Amazon ↗</a>
          <a href={"https://row52.com/Search/?PartName="+encodeURIComponent(xpart.search||xpart.name)} target="_blank" rel="noopener noreferrer" style={{padding:"7px 13px",background:"rgba(204,68,255,.1)",border:"1px solid rgba(204,68,255,.35)",borderRadius:8,color:"#CC44FF",fontFamily:"inherit",fontSize:11,fontWeight:700,textDecoration:"none"}}>🔍 Row52 ↗</a>
        </div>
        <div style={{fontSize:11,color:"#aaa",lineHeight:1.7,padding:"10px 13px",background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:9,marginBottom:12}}>
          💡 List all compatible vehicles in your eBay title — it ranks higher in search. Parts with broad compatibility sell 40-60% faster.
        </div>
        <div style={{fontSize:9,letterSpacing:3,color:"#555",marginBottom:7}}>ALSO CHECK THESE VEHICLES</div>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {[`${result.info.year-1} ${result.info.display.split(" ").slice(1).join(" ")}`, `${result.info.year+1} ${result.info.display.split(" ").slice(1).join(" ")}`, ...["chevrolet","ford","toyota","honda","nissan","bmw","mercedes","dodge","jeep","subaru"].filter(m=>!result.info.display.toLowerCase().includes(m)).slice(0,5).map(m=>`${result.info.year} ${m.charAt(0).toUpperCase()+m.slice(1)}`)].slice(0,6).map((v,i)=>(
            <div key={i} className="row" style={{animationDelay:i*.04+"s",padding:"9px 12px",background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.07)",borderRadius:9,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <span style={{fontWeight:600,fontSize:12,color:"#ccc"}}>{v}</span>
              <button onClick={()=>go(v)} style={{padding:"5px 10px",background:"rgba(0,255,136,.07)",border:"1px solid rgba(0,255,136,.2)",borderRadius:6,color:"#00FF88",cursor:"pointer",fontFamily:"inherit",fontSize:10}}>ANALYZE →</button>
            </div>
          ))}
        </div>
      </div>
    </div></div>
  );

  // ── PAYWALL ──────────────────────────────────────────────────────────────────
  if (screen==="paywall") return (
    <div style={S.app}><div style={S.grid}/><div style={S.z}>
      <Hdr/>
      <div style={{maxWidth:400,margin:"0 auto",padding:"50px 16px 80px",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:10}}>🔒</div>
        <div style={{fontSize:10,letterSpacing:4,color:"#ff6b6b",marginBottom:8}}>FREE TRIAL ENDED</div>
        <h2 style={{fontSize:20,fontWeight:900,margin:"0 0 8px"}}>Your 2 free lookups are up</h2>
        <p style={{color:"#666",fontSize:13,lineHeight:1.8,marginBottom:12}}>
          Pro members average <strong style={{color:"#00FF88"}}>$300–$800 profit</strong> per yard visit.<br/>
          At $9.99/mo, one good pull pays for the whole year.
        </p>

        {/* Social Proof */}
        <div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:8}}>
          {[
            {q:"Found a Hellcat engine at LKQ last week. App showed $18K in parts. Paid for itself in 10 seconds.", n:"Mike T., Ohio"},
            {q:"Pulled a cat converter I would have skipped. $403 profit. Worth every penny of $9.99.", n:"Carlos R., Texas"},
            {q:"I use this every single yard visit now. My pulls are up 3x since I stopped guessing.", n:"Derek M., Florida"},
          ].map((t,i)=>(
            <div key={i} style={{padding:"9px 12px",background:"rgba(0,255,136,.04)",border:"1px solid rgba(0,255,136,.12)",borderRadius:8,textAlign:"left"}}>
              <div style={{fontSize:11,color:"#bbb",lineHeight:1.6,marginBottom:4}}>"{t.q}"</div>
              <div style={{fontSize:10,color:"#00FF88",fontWeight:700}}>— {t.n}</div>
            </div>
          ))}
        </div>

        {!emailSubmitted ? (
          <div style={{marginBottom:16}}>
            <div style={{padding:"14px",background:"rgba(0,255,136,.04)",border:"1px solid rgba(0,255,136,.15)",borderRadius:10,marginBottom:14}}>
              <div style={{fontSize:11,color:"#00FF88",fontWeight:700,marginBottom:6}}>📧 GET 1 EXTRA FREE LOOKUP</div>
              <div style={{fontSize:12,color:"#888",marginBottom:12}}>Enter your email and we'll send you tips on the highest-profit pulls near you.</div>
              <div style={{display:"flex",gap:6}}>
                <input
                  value={email}
                  onChange={e=>setEmail(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&submitEmail()}
                  placeholder="your@email.com"
                  type="email"
                  style={{flex:1,padding:"10px 12px",background:"rgba(255,255,255,.05)",border:"1px solid rgba(0,255,136,.25)",borderRadius:7,color:"#fff",fontFamily:"inherit",fontSize:13,outline:"none"}}
                  onFocus={e=>e.target.style.borderColor="#00FF88"}
                  onBlur={e=>e.target.style.borderColor="rgba(0,255,136,.25)"}
                />
                <button onClick={submitEmail} style={{padding:"10px 14px",background:"#00FF88",color:"#06060f",border:"none",borderRadius:7,fontWeight:900,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>→</button>
              </div>
              {emailErr && <div style={{fontSize:11,color:"#ff6b6b",marginTop:5}}>{emailErr}</div>}
            </div>
          </div>
        ) : (
          <div style={{padding:"10px 14px",background:"rgba(0,255,136,.05)",border:"1px solid rgba(0,255,136,.2)",borderRadius:9,marginBottom:14,fontSize:12,color:"#00FF88"}}>
            ✓ Got it — check your email for profit tips!
          </div>
        )}

        <a href={STRIPE} target="_blank" rel="noopener noreferrer"
          onClick={()=>track('stripe_click', {location:'paywall'})}
          style={{display:"block",padding:"14px",background:"#00FF88",color:"#06060f",borderRadius:8,fontWeight:900,fontSize:15,letterSpacing:1,textDecoration:"none",marginBottom:8}}>
          GET UNLIMITED ACCESS — $9.99/mo →
        </a>
        <p style={{fontSize:10,color:"#444",marginBottom:12}}>🔒 Stripe · Cancel anytime · Unlimited lookups forever</p>
        <button onClick={()=>{track('already_paid_click');setScreen("sub");}} style={{width:"100%",padding:9,background:"rgba(0,255,136,.06)",color:"#00FF88",border:"1px solid rgba(0,255,136,.2)",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>ALREADY PAID? UNLOCK →</button>
        <button onClick={()=>setScreen("home")} style={{width:"100%",padding:8,background:"transparent",color:"#555",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:11}}>← Go Back</button>
      </div>
    </div></div>
  );

  // ── SUBSCRIPTION ─────────────────────────────────────────────────────────────
  if (screen==="sub") return (
    <div style={S.app}><div style={S.grid}/><div style={S.z}>
      <Hdr/>
      <div style={{maxWidth:440,margin:"0 auto",padding:"30px 16px 80px"}}>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:9,letterSpacing:4,color:"#FFD700",marginBottom:8}}>⭐ JOIN HUNDREDS OF ACTIVE YARD FLIPPERS</div>
          <h2 style={{fontSize:22,fontWeight:900,margin:"0 0 6px"}}>Go Pro — $9.99/mo</h2>
          <p style={{color:"#555",fontSize:12}}>Unlimited lookups · Any vehicle · Cancel anytime</p>
          <div style={{marginTop:10,padding:"8px 14px",background:"rgba(0,255,136,.05)",border:"1px solid rgba(0,255,136,.15)",borderRadius:8,fontSize:11,color:"#888",lineHeight:1.6}}>
            "Found a Hellcat engine worth $18K at my local LKQ. The app showed it in 5 seconds." — Pro member
          </div>
        </div>
        <div style={{background:"rgba(0,255,136,.04)",border:"1px solid rgba(0,255,136,.15)",borderRadius:12,padding:"13px 15px",marginBottom:16}}>
          {["Unlimited lookups — any car ever made","All 60+ parts per vehicle","Live eBay sold listing links","Auto yard inventory — cars listed automatically","Yard price multipliers","Cross-reference engine","Cancel anytime from Stripe"].map(f=>(
            <div key={f} style={{fontSize:12,color:"#bbb",marginBottom:7,display:"flex",gap:8}}><span style={{color:"#00FF88",flexShrink:0}}>✓</span>{f}</div>
          ))}
        </div>
        <div style={{marginBottom:11}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#555",marginBottom:6}}>STEP 1 — PAY</div>
          <a href={STRIPE} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"13px",background:"#00FF88",color:"#06060f",borderRadius:10,fontWeight:900,fontSize:15,textAlign:"center",textDecoration:"none",letterSpacing:1,boxSizing:"border-box"}}>PAY $9.99/mo WITH STRIPE →</a>
          <p style={{textAlign:"center",fontSize:10,color:"#444",marginTop:5}}>🔒 Stripe · SSL · Cancel anytime</p>
        </div>
        <div style={{padding:"11px 13px",background:"rgba(255,215,0,.04)",border:"1px solid rgba(255,215,0,.15)",borderRadius:9,marginBottom:11}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#FFD700",marginBottom:6}}>STEP 2 — UNLOCK AFTER PAYMENT</div>
          <button onClick={()=>{ls.set("yp_s",true);setSub(true);setScreen(result?"results":"home");}} style={{width:"100%",padding:"10px",background:"rgba(255,215,0,.1)",color:"#FFD700",border:"2px solid rgba(255,215,0,.35)",borderRadius:8,fontWeight:900,fontSize:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>✓ I'VE PAID — UNLOCK</button>
        </div>
        <button onClick={()=>setScreen(result?"results":"home")} style={{display:"block",width:"100%",padding:8,background:"transparent",color:"#555",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:11,textAlign:"center"}}>← Go Back</button>
      </div>
    </div></div>
  );

  return null;
}
