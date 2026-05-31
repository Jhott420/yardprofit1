// ─── storage ──────────────────────────────────────────────────────────────────
export const ls = {
  get: (k, d) => { try { const v = sessionStorage.getItem(k); return v != null ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── auto multiplier ──────────────────────────────────────────────────────────
export function detectMulti(name) {
  const q = (name || "").toLowerCase();
  const known = {
    "lkq": 1.0, "pick your part": 1.0, "pull-a-part": 0.9, "pull a part": 0.9,
    "pick-n-pull": 1.0, "u-pull-it": 0.85, "u pull it": 0.85, "u-pull": 0.85,
    "copart": 0.65, "iaai": 0.65, "manheim": 0.75, "gershow": 1.05,
    "lacey": 0.88, "runyon": 0.92, "savage": 1.1, "napa": 1.2,
  };
  for (const [k, v] of Object.entries(known)) {
    if (q.includes(k)) return { multi: v, reason: "Matched known chain: " + k };
  }
  if (/auction|bid|total.?loss/.test(q))  return { multi: 0.65, reason: "Auction yard" };
  if (/u.?pull|self.?serv|pick.?your/.test(q)) return { multi: 0.88, reason: "U-pull / self-service" };
  if (/full.?serv|retail|dealer/.test(q)) return { multi: 1.2,  reason: "Full-service / retail" };
  if (/salvage|junk|wreck|scrap|dismantl/.test(q)) return { multi: 0.95, reason: "Salvage yard" };
  if (/craigslist|facebook|private/.test(q)) return { multi: 0.65, reason: "Private seller" };
  return { multi: 1.0, reason: "Standard yard" };
}

// ─── inventory text parser ─────────────────────────────────────────────────────
export function parseCarList(text) {
  if (!text || !text.trim()) return [];
  const MODELS = {
    "f-150": ["ford", "f150", "f-150"], "silverado": ["chevrolet", "silverado"], "sierra": ["gmc", "sierra"],
    "tacoma": ["toyota", "tacoma"], "tundra": ["toyota", "tundra"], "camry": ["toyota", "camry"],
    "corolla": ["toyota", "corolla"], "accord": ["honda", "accord"], "civic": ["honda", "civic"],
    "altima": ["nissan", "altima"], "mustang": ["ford", "mustang"], "camaro": ["chevrolet", "camaro"],
    "challenger": ["dodge", "challenger"], "charger": ["dodge", "charger"],
    "wrangler": ["jeep", "wrangler"], "cherokee": ["jeep", "cherokee"],
    "tahoe": ["chevrolet", "tahoe"], "suburban": ["chevrolet", "suburban"],
    "explorer": ["ford", "explorer"], "expedition": ["ford", "expedition"],
    "4runner": ["toyota", "4runner"], "rav4": ["toyota", "rav4"],
    "prius": ["toyota", "prius"], "supra": ["toyota", "supra"],
    "350z": ["nissan", "350z"], "370z": ["nissan", "370z"],
    "wrx": ["subaru", "wrx"], "sti": ["subaru", "wrx sti"],
    "evo": ["mitsubishi", "lancer evo"], "s2000": ["honda", "s2000"],
    "rx-7": ["mazda", "rx-7"], "rx7": ["mazda", "rx-7"],
    "rx-8": ["mazda", "rx-8"], "miata": ["mazda", "miata"],
    "f-250": ["ford", "f-250"], "f-350": ["ford", "f-350"],
    "2500": ["chevrolet", "silverado 2500"], "3500": ["chevrolet", "silverado 3500"],
  };
  const MAKES = ["chevrolet", "chevy", "gmc", "ford", "dodge", "ram", "jeep", "toyota", "honda",
    "nissan", "mazda", "subaru", "mitsubishi", "bmw", "mercedes", "audi", "volkswagen", "vw",
    "hyundai", "kia", "lexus", "acura", "infiniti", "cadillac", "buick", "pontiac", "lincoln",
    "volvo", "porsche", "land rover", "range rover", "jaguar", "ferrari", "lamborghini",
    "bentley", "maserati", "oldsmobile", "saturn", "hummer", "isuzu", "suzuki", "saab"];

  const lines = text.split(/[\n\r,;|]+/).map(l => l.trim()).filter(l => l.length > 2);
  const results = [];

  for (const line of lines) {
    const low = line.toLowerCase().replace(/[^\w\s\-]/g, " ");
    const yearM = low.match(/\b(19[6-9]\d|20[0-2]\d)\b/);
    const year = yearM ? yearM[1] : null;

    let found = null;
    for (const [model, [make, full]] of Object.entries(MODELS)) {
      if (low.includes(model)) {
        found = year ? `${year} ${make.charAt(0).toUpperCase() + make.slice(1)} ${full}` : `${make.charAt(0).toUpperCase() + make.slice(1)} ${full}`;
        found = found.replace(/\b\w/g, c => c.toUpperCase());
        break;
      }
    }
    if (!found) {
      for (const make of MAKES) {
        if (low.includes(make)) {
          const rest = low.replace(make, "").replace(/\b(19|20)\d{2}\b/, "").replace(/[^\w\s]/g, " ").trim().split(" ").slice(0, 3).join(" ");
          const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
          found = [year, cap(make === "chevy" ? "chevrolet" : make), rest].filter(Boolean).join(" ").replace(/\b\w/g, c => c.toUpperCase());
          break;
        }
      }
    }
    if (!found && year && line.split(" ").length >= 3) {
      found = line.replace(/\b\w/g, c => c.toUpperCase()).trim();
    }
    if (found && found.length > 4 && !results.includes(found)) {
      results.push(found);
    }
  }
  return results;
}

// ─── auto-fetch inventory via Claude API ──────────────────────────────────────
export async function fetchInventory(yard, onStatus) {
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

// ─── location-based yard finder ────────────────────────────────────────────────
export async function findYardsNearLocation(lat, lng, query, onStatus) {
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

// ─── vehicle analyzer ──────────────────────────────────────────────────────────
export function analyzeVehicle(raw) {
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
  const isClassic = year < 1980 && (isMuscle || /camaro|nova|chevelle|firebird|mustang|charger|challenger|cuda/.test(q));

  let tier = "mid";
  if (isExotic)  tier = "exotic";
  else if (isClassic) tier = "classic";
  else if (isJDM || isMuscle) tier = "sport";
  else if (isDiesel && isPickup) tier = "diesel_truck";
  else if (/bmw|mercedes|audi|lexus|porsche/.test(q) && isLuxury) tier = "luxury";
  else if (/bmw|mercedes|audi|lexus|porsche/.test(q)) tier = "premium";
  else if (isTruck) tier = "truck";

  const M = { mid: 1, truck: 1.1, diesel_truck: 1.6, sport: 1.4, premium: 1.8, luxury: 2.5, exotic: 5, classic: 2.2 }[tier] || 1;

  let engBase = Math.round(1200 * M);
  if (tier === "diesel_truck") engBase = 8500;
  if (isExotic) engBase = 35000;
  if (isClassic) engBase = 3500;

  const engine = (/i4|4.?cyl|k20|k24|2az/.test(q) ? "4-Cyl" : /i6|inline.?6|2jz|rb26|n54/.test(q) ? "I6" : /v6|3\.[5-9]|vq35|pentastar/.test(q) ? "V6" : "V8") + (isDiesel ? " Diesel" : isTurbo ? " Turbo" : "");

  const tip = isExotic ? "Ship parts worldwide — exotic parts have global buyers." :
    isDiesel ? "Diesel premium on everything. DPF alone = $1200+." :
    isHybrid ? "Prius cat = highest palladium content. Pull first." :
    isClassic ? "Restorer market pays 5-10x book value." :
    isJDM    ? "JDM parts have global eBay demand." :
    isPickup  ? "Tailgate + cat + engine = the big three." :
    "Cat converter + engine are your highest-value pulls.";

  const score = Math.min(99, ({ exotic: 97, luxury: 90, diesel_truck: 95, classic: 93, sport: 88, premium: 82, truck: 80, mid: 70 }[tier] || 70) + (isTurbo ? 4 : 0) + (is4WD ? 3 : 0));
  const display = raw.trim().replace(/\b\w/g, c => c.toUpperCase());

  return { display, year, tier, M, engBase, engine, isPickup, isSUV, is4WD, isDiesel, isHybrid, isTurbo, isJDM, isMuscle, isExotic, isClassic, isVan: /odyssey|sienna|caravan|transit|sprinter/.test(q), score, tip };
}

export function buildParts(info, yardMult = 1.0) {
  const { M } = info;
  const e = (b) => Math.max(8, Math.round(b * M));
  const y = (ebay) => Math.max(5, Math.round(ebay * 0.16 * yardMult));
  const p = [];
  const add = (name, cat, ebay, demand, weight, tip, search) => {
    const eb = Math.round(ebay);
    p.push({ name, cat, ebay: eb, yard: y(eb), profit: eb - y(eb), demand, weight, tip, search });
  };

  if (!info.isHybrid) add("Complete Engine Assembly", "Engine", info.engBase, "High", "Heavy", "Pull with all accessories attached.", info.display + " engine long block");
  add("Transmission Assembly", "Transmission", e(info.isMuscle || info.tier === "sport" ? 2200 : 1100), "High", "Heavy", info.isMuscle ? "Manual = huge premium." : "Check shifts smooth.", info.display + " transmission");
  if (info.is4WD || info.isSUV || info.isPickup) add("Transfer Case Assembly", "Transfer Case", e(650), "High", "Heavy", "4WD units always sell.", info.display + " transfer case");

  const catE = info.isHybrid ? 1200 : e(info.isDiesel ? 600 : info.M > 1.3 ? 450 : 380);
  add("Catalytic Converter(s)", "Catalytic Converter", catE, "High", "Medium", info.isHybrid ? "HIGHEST palladium content. Pull first." : "Scrap platinum ~$80+. Always pull.", info.display + " catalytic converter OEM");
  if (info.isDiesel) add("DPF / Diesel Particulate Filter", "Catalytic Converter", e(1200), "High", "Heavy", "Big diesel value.", info.display + " DPF filter");

  if (/hellcat|zl1|gt500|viper|z06|redeye/i.test(info.display)) add("Supercharger Assembly", "Engine Components", e(2400), "High", "Heavy", "Forced induction = massive value.", info.display + " supercharger OEM");
  if (info.isTurbo) { add("Turbocharger OEM", "Engine Components", e(600), "High", "Medium", "Test shaft play first.", info.display + " turbocharger"); add("Intercooler OEM", "Engine Components", e(280), "High", "Medium", "", info.display + " intercooler"); }
  add("Intake Manifold OEM", "Engine Components", e(180), "High", "Medium", "", info.display + " intake manifold");
  add("Exhaust Manifolds (pair)", "Engine Components", e(160), "Medium", "Medium", "No cracks.", info.display + " exhaust manifold pair");
  add("Valve Covers (pair)", "Engine Components", e(80), "Medium", "Light", "", info.display + " valve cover pair");
  add("Oil Pan OEM", "Engine Components", e(80), "Medium", "Medium", "", info.display + " oil pan");
  add("Flywheel / Flexplate", "Engine Components", e(100), "Medium", "Medium", "Manual = more.", info.display + " flywheel");

  if (info.isPickup || info.isSUV || info.is4WD) {
    add("Front Axle / Differential", "Drivetrain", e(900), "High", "Heavy", "Locking diff = 2x.", info.display + " front axle diff");
    add("Rear Axle / Differential", "Drivetrain", e(700), "High", "Heavy", "Check gear ratio.", info.display + " rear axle diff");
  } else {
    add("Rear Differential", "Drivetrain", e(info.isMuscle ? 900 : 400), "High", "Heavy", info.isMuscle ? "Posi = premium." : "", info.display + " rear differential");
  }
  add("CV Axle Shafts (pair)", "Drivetrain", e(160), "High", "Medium", "", info.display + " CV axle pair");
  add("Driveshaft Assembly", "Drivetrain", e(280), "High", "Medium", "Check for vibration.", info.display + " driveshaft");
  if (info.isPickup || info.isSUV) add("Front Driveshaft", "Drivetrain", e(200), "High", "Medium", "", info.display + " front driveshaft");

  const wSz = info.isPickup || info.isSUV ? 20 : info.isExotic || info.tier === "luxury" ? 19 : 18;
  add(`OEM ${wSz}" Alloy Wheels (set/4)`, "Wheels", e(wSz === 20 ? 880 : wSz === 19 ? 720 : 640), "High", "Heavy", "Sell as set of 4.", info.display + ` OEM ${wSz} inch wheels`);
  add("Full-Size Spare Tire+Wheel", "Wheels", e(120), "Medium", "Heavy", "", info.display + " spare tire");

  add("OEM Headlights (pair)", "Lighting", e(info.isExotic || info.tier === "luxury" ? 800 : info.isJDM || info.isMuscle ? 480 : 320), "High", "Medium", "LED/Xenon = 2-3x price.", info.display + " headlight pair OEM");
  add("OEM Tail Lights (pair)", "Lighting", e(240), "Medium", "Medium", "", info.display + " tail light pair OEM");
  add("OEM Fog Lights (pair)", "Lighting", e(110), "Medium", "Light", "", info.display + " fog lights OEM");

  add("Engine Control Module (ECU)", "Electronics", e(280), "High", "Light", "Match exact VIN range.", info.display + " ECU PCM OEM");
  add("ABS Control Module", "Electronics", e(180), "High", "Light", "", info.display + " ABS module OEM");
  add("Body Control Module (BCM)", "Electronics", e(160), "Medium", "Light", "", info.display + " BCM OEM");
  add("Airbag / SRS Module", "Electronics", e(220), "High", "Light", "Must be undeployed.", info.display + " SRS airbag module");
  add("Instrument Cluster", "Electronics", e(240), "High", "Light", "", info.display + " instrument cluster OEM");
  add("Factory Navigation Unit", "Electronics", e(info.tier === "luxury" || info.isExotic ? 700 : 320), "High", "Light", "Test screen first.", info.display + " factory navigation radio");
  add("Base Stereo / Head Unit", "Electronics", e(110), "Medium", "Light", "", info.display + " radio stereo OEM");
  add("Premium Amp (Bose/HK)", "Electronics", e(info.tier === "luxury" || info.isExotic ? 280 : 180), "Medium", "Light", "", info.display + " Bose Harman amplifier");
  add("OEM Backup Camera", "Electronics", e(140), "High", "Light", "", info.display + " backup camera OEM");
  add("Parking Sensor Set", "Electronics", e(95), "Medium", "Light", "", info.display + " parking sensors OEM");
  if (info.year >= 2015) add("ADAS Forward Camera", "Electronics", e(180), "High", "Light", "Safety camera. Big demand.", info.display + " ADAS camera OEM");
  add("Sunroof Motor + Module", "Electronics", e(155), "Medium", "Light", "", info.display + " sunroof motor OEM");
  add("Fuse Box / Junction Block", "Electronics", e(130), "Medium", "Light", "", info.display + " fuse box OEM");

  add("Alternator OEM", "Electrical", e(115), "High", "Light", "", info.display + " alternator OEM");
  add("Starter Motor OEM", "Electrical", e(88), "Medium", "Light", "", info.display + " starter motor OEM");
  add("AC Compressor OEM", "Electrical", e(175), "High", "Medium", "", info.display + " AC compressor OEM");
  add("AC Condenser OEM", "Electrical", e(115), "Medium", "Medium", "", info.display + " AC condenser OEM");
  add("Power Steering Rack OEM", "Electrical", e(330), "High", "Medium", "", info.display + " power steering rack OEM");
  add("Power Steering Pump OEM", "Electrical", e(125), "High", "Light", "", info.display + " power steering pump OEM");
  add("Window Regulators (set/4)", "Electrical", e(300), "High", "Light", "$75 each. Always needed.", info.display + " window regulator set OEM");
  add("Power Door Mirrors (pair)", "Electrical", e(250), "High", "Light", "Heated/folding = +$60.", info.display + " power mirror pair OEM");
  add("Fuel Pump Assembly OEM", "Electrical", e(155), "High", "Light", "In-tank. Test before listing.", info.display + " fuel pump OEM");
  add("Fuel Injector Set OEM", "Electrical", e(270), "High", "Light", "Clean set = premium.", info.display + " fuel injectors OEM");
  add("Throttle Body OEM", "Electrical", e(115), "High", "Light", "", info.display + " throttle body OEM");
  add("MAF Sensor OEM", "Electrical", e(78), "High", "Light", "", info.display + " MAF sensor OEM");
  add("O2 Sensor Set OEM", "Electrical", e(115), "High", "Light", "Pull all of them.", info.display + " oxygen sensor set");
  add("Cam/Crank Sensors", "Electrical", e(75), "High", "Light", "Small but always needed.", info.display + " cam crank sensor OEM");
  add("OEM Battery", "Electrical", e(78), "Medium", "Heavy", "Test voltage first.", info.display + " OEM battery");

  add("Radiator OEM", "Cooling", e(155), "High", "Medium", "No cracks.", info.display + " radiator OEM");
  add("Cooling Fan Assembly", "Cooling", e(135), "High", "Medium", "", info.display + " cooling fan OEM");
  add("Water Pump OEM", "Cooling", e(78), "High", "Light", "", info.display + " water pump OEM");
  add("Thermostat + Housing", "Cooling", e(58), "Medium", "Light", "", info.display + " thermostat OEM");

  add("Fuel Tank OEM", "Fuel System", e(195), "Medium", "Heavy", "Drain completely first.", info.display + " fuel tank OEM");
  add("Fuel Rail OEM", "Fuel System", e(78), "Medium", "Light", "", info.display + " fuel rail OEM");

  add("Hood Panel OEM", "Body", e(220), "High", "Medium", info.isClassic ? "Numbers-matching = big value." : "No dents. Note paint code.", info.display + " hood panel OEM");
  add("Front Bumper Cover OEM", "Body", e(260), "High", "Medium", info.tier === "sport" ? "Sport bumper = 2x." : "No cracks.", info.display + " front bumper cover OEM");
  add("Rear Bumper Cover OEM", "Body", e(195), "High", "Medium", "", info.display + " rear bumper cover OEM");
  add("Driver Front Fender OEM", "Body", e(180), "High", "Medium", "Note color code.", info.display + " front fender driver OEM");
  add("Passenger Front Fender OEM", "Body", e(180), "High", "Medium", "", info.display + " front fender passenger OEM");
  add("Front Driver Door Shell", "Body", e(320), "High", "Heavy", "Include glass + regulator.", info.display + " front driver door OEM");
  add("Front Passenger Door Shell", "Body", e(320), "High", "Heavy", "", info.display + " front passenger door OEM");
  add("Rear Driver Door Shell", "Body", e(280), "High", "Heavy", "", info.display + " rear driver door OEM");
  add("Rear Passenger Door Shell", "Body", e(280), "High", "Heavy", "", info.display + " rear passenger door OEM");
  if (info.isPickup) {
    add("Pickup Tailgate Complete", "Body", e(480), "High", "Medium", "Camera-equipped = +$150.", info.display + " tailgate OEM");
    add("Pickup Truck Bed / Box", "Body", e(800), "High", "Heavy", "Rust check critical.", info.display + " truck bed OEM");
  } else if (info.isSUV || info.isVan) {
    add("Liftgate / Hatch Complete", "Body", e(340), "Medium", "Heavy", "", info.display + " liftgate OEM");
  } else {
    add("Trunk Lid / Decklid OEM", "Body", e(240), "Medium", "Medium", info.isClassic ? "Duckbill = premium." : "", info.display + " trunk lid OEM");
  }
  add("Driver Quarter Panel", "Body", e(240), "Medium", "Heavy", "", info.display + " quarter panel driver");
  add("Passenger Quarter Panel", "Body", e(240), "Medium", "Heavy", "", info.display + " quarter panel passenger");

  add("Windshield OEM", "Glass", e(195), "High", "Heavy", "No cracks.", info.display + " windshield OEM");
  add("Rear Window Glass", "Glass", e(155), "Medium", "Heavy", "", info.display + " rear window glass");
  add("Front Door Glass (pair)", "Glass", e(140), "Medium", "Medium", "", info.display + " front door window glass");
  add("Rear Door Glass (pair)", "Glass", e(120), "Medium", "Medium", "", info.display + " rear door window glass");
  add("Sunroof / Moonroof Glass", "Glass", e(175), "Medium", "Medium", "No cracks.", info.display + " sunroof glass OEM");

  const seatE = e(info.isExotic ? 2000 : info.tier === "luxury" ? 800 : info.tier === "sport" ? 380 : 260);
  add("Front Driver Seat OEM", "Interior", seatE, "High", "Medium", "Power/leather = big premium.", info.display + " front driver seat OEM");
  add("Front Passenger Seat OEM", "Interior", Math.round(seatE * 0.85), "High", "Medium", "", info.display + " front passenger seat OEM");
  add("Rear Seat Assembly OEM", "Interior", e(260), "Medium", "Medium", "", info.display + " rear seat OEM");
  add("Center Console Assembly", "Interior", e(260), "Medium", "Light", "Leather lid = +$80.", info.display + " center console OEM");
  add("Dashboard / Dash Pad OEM", "Interior", e(300), "Low", "Medium", "No cracks. Fragile to ship.", info.display + " dashboard OEM");
  add("OEM Steering Wheel", "Interior", e(info.tier === "luxury" || info.isExotic ? 500 : 220), "High", "Light", "Heated/multifunc = premium.", info.display + " steering wheel OEM");
  add("Steering Column OEM", "Interior", e(155), "Medium", "Medium", "", info.display + " steering column OEM");
  add("All 4 Interior Door Panels", "Interior", e(380), "Medium", "Light", "Color match critical.", info.display + " door panel set OEM");
  add("Floor Carpet Set OEM", "Interior", e(115), "Low", "Light", "", info.display + " floor carpet OEM");
  add("Headliner OEM", "Interior", e(115), "Low", "Light", "No stains.", info.display + " headliner OEM");
  add("HVAC / Climate Controls", "Interior", e(115), "Medium", "Light", "", info.display + " HVAC climate control OEM");
  add("OEM Shift Knob / Shifter", "Interior", e(75), "Medium", "Light", "Manual = premium.", info.display + " shift knob OEM");

  add("Front Struts / Shocks (pair)", "Suspension", e(195), "High", "Medium", "OEM Bilstein = premium.", info.display + " front strut pair OEM");
  add("Rear Shocks (pair)", "Suspension", e(155), "High", "Medium", "", info.display + " rear shock pair OEM");
  if (info.isSUV) add("Air Suspension Compressor+Bags", "Suspension", e(380), "High", "Medium", "Very common failure. Always sells.", info.display + " air suspension OEM");
  add("Front Control Arms (pair)", "Suspension", e(175), "High", "Medium", "", info.display + " front control arm pair OEM");
  add("Rear Control Arms (pair)", "Suspension", e(155), "High", "Medium", "", info.display + " rear control arm pair OEM");
  add("Sway Bars + End Links", "Suspension", e(155), "Medium", "Medium", "", info.display + " sway bar OEM");
  add("Wheel Bearing Hubs (set/4)", "Suspension", e(195), "High", "Medium", "$48 each. Always needed.", info.display + " wheel bearing hub set OEM");

  add("Front Brake Calipers (pair)", "Brakes", e(155), "High", "Medium", "Brembo = 3x.", info.display + " front caliper pair OEM");
  add("Rear Brake Calipers (pair)", "Brakes", e(115), "Medium", "Medium", "", info.display + " rear caliper pair OEM");
  add("Front Rotors (pair)", "Brakes", e(95), "High", "Heavy", "Drilled/slotted = premium.", info.display + " front rotor pair OEM");
  add("Rear Rotors (pair)", "Brakes", e(78), "High", "Heavy", "", info.display + " rear rotor pair OEM");
  add("Brake Booster + Master Cyl", "Brakes", e(135), "High", "Medium", "", info.display + " brake booster OEM");

  add("Mid Pipes / Y-Pipe OEM", "Exhaust", e(115), "Medium", "Medium", "", info.display + " mid pipe exhaust OEM");
  add("Muffler / Rear Section OEM", "Exhaust", e(135), "Medium", "Medium", "", info.display + " muffler OEM");

  if (info.isPickup || info.isSUV) {
    add("Running Boards / Side Steps", "Truck/SUV", e(310), "Medium", "Medium", "", info.display + " running boards OEM");
    add("Factory Tow Package Wiring", "Truck/SUV", e(175), "High", "Light", "7-pin vs 4-pin.", info.display + " tow wiring OEM");
    add("Roof Rack / Rails OEM", "Truck/SUV", e(195), "Medium", "Medium", "", info.display + " roof rack OEM");
    add("Bed Liner OEM", "Truck/SUV", e(155), "Medium", "Heavy", "", info.display + " bed liner OEM");
    add("Tonneau / Bed Cover OEM", "Truck/SUV", e(390), "High", "Medium", "Power retractable = $800+.", info.display + " tonneau cover OEM");
    if (info.is4WD) add("Skid Plate Set OEM", "Truck/SUV", e(255), "High", "Medium", "Off-road pkg = 2x.", info.display + " skid plates OEM");
  }

  return p.sort((a, b) => b.profit - a.profit);
}

export function getResult(raw, yardMult = 1.0) {
  if (!raw || !raw.trim()) return null;
  const info = analyzeVehicle(raw);
  const parts = buildParts(info, yardMult);
  return { key: info.display, engine: info.engine, score: info.score, tip: info.tip, totalProfit: parts.reduce((s, p) => s + p.profit, 0), parts, info };
}
