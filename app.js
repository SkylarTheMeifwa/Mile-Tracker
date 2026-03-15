const STORAGE_KEY = "mileTrackerDataV1";

function createDefaultData() {
  return {
    taxRate: 0.07,
    summaryYear: new Date().getFullYear(),
    drivers: [
      { id: "d1", name: "Driver 1" },
      { id: "d2", name: "Driver 2" }
    ],
    entries: {
      d1: {},
      d2: {}
    }
  };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = createDefaultData();
    saveData(seed);
    return seed;
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeData(parsed);
  } catch {
    const seed = createDefaultData();
    saveData(seed);
    return seed;
  }
}

function normalizeData(data) {
  const fallback = createDefaultData();
  const parsedYear = Number(data.summaryYear);
  const summaryYear = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
    ? parsedYear
    : fallback.summaryYear;

  const normalized = {
    taxRate: Number(data.taxRate) >= 0 ? Number(data.taxRate) : fallback.taxRate,
    summaryYear,
    drivers: Array.isArray(data.drivers) && data.drivers.length === 2
      ? data.drivers.map((driver, index) => ({
        id: index === 0 ? "d1" : "d2",
        name: String(driver.name || fallback.drivers[index].name).trim() || fallback.drivers[index].name
      }))
      : fallback.drivers,
    entries: {
      d1: {},
      d2: {}
    }
  };

  ["d1", "d2"].forEach((driverId) => {
    const sourceEntries = data.entries?.[driverId];

    if (isLegacyMonthlyEntries(sourceEntries)) {
      normalized.entries[driverId] = convertLegacyMonthlyEntries(sourceEntries, summaryYear);
      return;
    }

    if (!sourceEntries || typeof sourceEntries !== "object") {
      return;
    }

    Object.keys(sourceEntries).forEach((dateKey) => {
      if (!isIsoDate(dateKey)) {
        return;
      }

      const source = sourceEntries[dateKey];
      normalized.entries[driverId][dateKey] = {
        startMiles: asNullableNumber(source?.startMiles),
        endMiles: asNullableNumber(source?.endMiles),
        personalMiles: asNumber(source?.personalMiles),
        businessMiles: asNumber(source?.businessMiles),
        notes: String(source?.notes || "")
      };
    });

    if (Object.keys(normalized.entries[driverId]).length === 0 && isLegacyMonthlyEntries(sourceEntries)) {
      normalized.entries[driverId] = convertLegacyMonthlyEntries(sourceEntries, summaryYear);
    }
  });

  return normalized;
}

function isLegacyMonthlyEntries(entries) {
  if (!entries || typeof entries !== "object") {
    return false;
  }

  const keys = Object.keys(entries);
  return keys.some((key) => /^([1-9]|1[0-2])$/.test(String(key)));
}

function convertLegacyMonthlyEntries(monthlyEntries, year) {
  const converted = {};

  for (let month = 1; month <= 12; month += 1) {
    const source = monthlyEntries?.[month];
    if (!source || typeof source !== "object") {
      continue;
    }

    const row = {
      startMiles: asNullableNumber(source.startMiles),
      endMiles: asNullableNumber(source.endMiles),
      personalMiles: asNumber(source.personalMiles),
      businessMiles: asNumber(source.businessMiles),
      notes: String(source.notes || "")
    };

    const hasData =
      row.startMiles !== null ||
      row.endMiles !== null ||
      row.personalMiles > 0 ||
      row.businessMiles > 0 ||
      row.notes.length > 0;

    if (!hasData) {
      continue;
    }

    const dateKey = `${year}-${String(month).padStart(2, "0")}-01`;
    converted[dateKey] = row;
  }

  return converted;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function asNullableNumber(value) {
  if (value === null || value === "" || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function formatMiles(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD"
  });
}

function formatDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatMonthDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric"
  });
}

function computePersonalMiles(row) {
  const start = asNullableNumber(row?.startMiles);
  const end = asNullableNumber(row?.endMiles);
  const business = asNumber(row?.businessMiles);

  if (start !== null && end !== null && end >= start) {
    return Math.max(0, end - start - business);
  }

  // Fallback for legacy data that only has saved personal miles.
  return asNumber(row?.personalMiles);
}

function getYearEntries(data, driverId, year) {
  const allEntries = data.entries?.[driverId] || {};
  return Object.entries(allEntries)
    .filter(([dateKey]) => Number(dateKey.slice(0, 4)) === year)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function setActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".menu a").forEach((link) => {
    if (link.dataset.nav === page) {
      link.classList.add("active");
    }
  });
}

function buildDriverSummary(driver, data) {
  const year = data.summaryYear;
  const yearlyEntries = getYearEntries(data, driver.id, year);
  let personalTotal = 0;
  let businessTotal = 0;

  yearlyEntries.forEach(([, row]) => {
    personalTotal += computePersonalMiles(row);
    businessTotal += asNumber(row.businessMiles);
  });

  const januaryStart = yearlyEntries.find(([dateKey, row]) =>
    dateKey.slice(5, 7) === "01" && row.startMiles !== null
  )?.[1]?.startMiles ?? null;

  const earliestStart = yearlyEntries.find(([, row]) =>
    row.startMiles !== null
  )?.[1]?.startMiles ?? null;

  const decemberEnd = [...yearlyEntries].reverse().find(([dateKey, row]) =>
    dateKey.slice(5, 7) === "12" && row.endMiles !== null
  )?.[1]?.endMiles ?? null;

  const latestEnd = [...yearlyEntries].reverse().find(([, row]) =>
    row.endMiles !== null
  )?.[1]?.endMiles ?? null;

  const taxCredit = businessTotal * data.taxRate;

  return {
    driverName: driver.name,
    year,
    januaryStart: januaryStart ?? earliestStart,
    decemberEnd: decemberEnd ?? latestEnd,
    personalTotal,
    businessTotal,
    taxCredit
  };
}

function renderHome() {
  const target = document.getElementById("homeTotals");
  if (!target) return;

  const data = loadData();
  const cards = data.drivers.map((driver) => buildDriverSummary(driver, data));

  target.innerHTML = cards.map((summary) => `
    <article class="card">
      <h2>${summary.driverName} (${summary.year})</h2>
      <div class="stat-row"><span>Yearly Personal</span><strong>${formatMiles(summary.personalTotal)} mi</strong></div>
      <div class="stat-row"><span>Yearly Business</span><strong>${formatMiles(summary.businessTotal)} mi</strong></div>
      <div class="stat-row"><span>Estimated Tax Credit</span><strong>${formatCurrency(summary.taxCredit)}</strong></div>
    </article>
  `).join("");
}

function renderEntriesTable(data, driverId) {
  const body = document.getElementById("entryTableBody");
  const overviewDriverLabel = document.getElementById("overviewDriverLabel");
  if (!body) return;

  if (overviewDriverLabel) {
    const driverName = data.drivers.find((driver) => driver.id === driverId)?.name || "Unknown Driver";
    overviewDriverLabel.textContent = `Showing entries for: ${driverName}`;
  }

  const yearlyEntries = getYearEntries(data, driverId, data.summaryYear).reverse();

  if (yearlyEntries.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6">No entries yet for ${data.summaryYear}.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = yearlyEntries.map(([dateKey, row]) => `
    <tr>
      <td>${formatMonthDayLabel(dateKey)}</td>
      <td>${row.startMiles === null ? "-" : formatMiles(row.startMiles)}</td>
      <td>${row.endMiles === null ? "-" : formatMiles(row.endMiles)}</td>
      <td>${formatMiles(computePersonalMiles(row))}</td>
      <td>${formatMiles(row.businessMiles)}</td>
      <td><button type="button" class="button danger" data-delete-date="${dateKey}">Delete</button></td>
    </tr>
  `).join("");

  body.querySelectorAll("button[data-delete-date]").forEach((button) => {
    button.addEventListener("click", () => {
      const dateKey = button.getAttribute("data-delete-date");
      if (!dateKey) {
        return;
      }
      delete data.entries[driverId][dateKey];
      saveData(data);
      renderEntriesTable(data, driverId);
    });
  });
}

function bindEntriesPage() {
  const form = document.getElementById("entryForm");
  if (!form) return;

  const data = loadData();
  const driverSelect = document.getElementById("driverSelect");
  const entryDate = document.getElementById("entryDate");
  const startMiles = document.getElementById("startMiles");
  const endMiles = document.getElementById("endMiles");
  const businessMiles = document.getElementById("businessMiles");
  const notes = document.getElementById("notes");
  const status = document.getElementById("entryStatus");

  driverSelect.innerHTML = data.drivers
    .map((driver) => `<option value="${driver.id}">${driver.name}</option>`)
    .join("");

  entryDate.min = `${data.summaryYear}-01-01`;
  entryDate.max = `${data.summaryYear}-12-31`;

  function loadSelectedEntry() {
    const driverId = driverSelect.value;
    const dateKey = entryDate.value;
    const row = data.entries[driverId][dateKey] || {
      startMiles: null,
      endMiles: null,
      personalMiles: 0,
      businessMiles: 0,
      notes: ""
    };

    startMiles.value = row.startMiles ?? "";
    endMiles.value = row.endMiles ?? "";
    businessMiles.value = row.businessMiles;
    notes.value = row.notes;
    renderEntriesTable(data, driverId);
    status.textContent = "";
  }

  driverSelect.addEventListener("change", loadSelectedEntry);
  entryDate.addEventListener("change", loadSelectedEntry);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const driverId = driverSelect.value;
    const dateKey = entryDate.value;

    if (!isIsoDate(dateKey)) {
      status.textContent = "Choose a valid date.";
      return;
    }

    data.entries[driverId][dateKey] = {
      startMiles: asNullableNumber(startMiles.value),
      endMiles: asNullableNumber(endMiles.value),
      businessMiles: asNumber(businessMiles.value),
      personalMiles: 0,
      notes: String(notes.value || "").trim()
    };

    saveData(data);
    renderEntriesTable(data, driverId);
    const computed = computePersonalMiles(data.entries[driverId][dateKey]);
    status.textContent = `Saved ${formatDateLabel(dateKey)} entry. Personal: ${formatMiles(computed)} mi.`;
  });

  const today = new Date();
  let defaultDate = `${data.summaryYear}-01-01`;
  if (today.getFullYear() === data.summaryYear) {
    defaultDate = today.toISOString().slice(0, 10);
  }

  entryDate.value = defaultDate;
  driverSelect.value = data.drivers[0].id;
  loadSelectedEntry();
}

function renderSummaryPage() {
  const cardTarget = document.getElementById("summaryCards");
  if (!cardTarget) return;

  const data = loadData();
  const summaries = data.drivers.map((driver) => buildDriverSummary(driver, data));

  cardTarget.innerHTML = summaries.map((summary) => `
    <article class="card">
      <h2>${summary.driverName} (${summary.year})</h2>
      <div class="stat-row"><span>January Starting Miles</span><strong>${summary.januaryStart === null ? "-" : formatMiles(summary.januaryStart)}</strong></div>
      <div class="stat-row"><span>December Ending Miles</span><strong>${summary.decemberEnd === null ? "-" : formatMiles(summary.decemberEnd)}</strong></div>
      <div class="stat-row"><span>Total Personal Miles</span><strong>${formatMiles(summary.personalTotal)} mi</strong></div>
      <div class="stat-row"><span>Total Business Miles</span><strong>${formatMiles(summary.businessTotal)} mi</strong></div>
      <div class="stat-row"><span>Tax Credit</span><strong>${formatCurrency(summary.taxCredit)}</strong></div>
    </article>
  `).join("");

  const combined = summaries.reduce((sum, row) => sum + row.taxCredit, 0);
  document.getElementById("combinedTaxCredit").textContent = formatCurrency(combined);
  document.getElementById("taxRateHint").textContent = `${data.summaryYear} tax year, rate: ${formatCurrency(data.taxRate)} per business mile.`;
}

function bindSettingsPage() {
  const form = document.getElementById("settingsForm");
  if (!form) return;

  const data = loadData();
  const driverOneName = document.getElementById("driverOneName");
  const driverTwoName = document.getElementById("driverTwoName");
  const taxRate = document.getElementById("taxRate");
  const summaryYear = document.getElementById("summaryYear");
  const status = document.getElementById("settingsStatus");

  driverOneName.value = data.drivers[0].name;
  driverTwoName.value = data.drivers[1].name;
  taxRate.value = data.taxRate.toFixed(3);
  summaryYear.value = String(data.summaryYear);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    data.drivers[0].name = driverOneName.value.trim() || "Driver 1";
    data.drivers[1].name = driverTwoName.value.trim() || "Driver 2";
    data.taxRate = Number(taxRate.value) >= 0 ? Number(taxRate.value) : 0.07;
    data.summaryYear = Number.isInteger(Number(summaryYear.value))
      ? Number(summaryYear.value)
      : new Date().getFullYear();

    saveData(data);
    status.textContent = "Settings saved. Visit Entries and Summary for updated year totals.";
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then((registration) => {
      registration.update();
      let hasRefreshed = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasRefreshed) {
          return;
        }
        hasRefreshed = true;
        window.location.reload();
      });
    }).catch(() => {
      // No-op: app still works online even if registration fails.
    });
  }
}

function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function enforcePortraitInPwa() {
  if (!isStandalonePwa()) {
    return;
  }

  const overlay = document.createElement("aside");
  overlay.className = "orientation-lock-overlay";
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div>
      <h2>Rotate to Portrait</h2>
      <p>This app works in portrait mode only. Turn your device upright to continue.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const syncOrientation = () => {
    const isLandscape = window.innerWidth > window.innerHeight;
    document.body.classList.toggle("orientation-locked", isLandscape);
  };

  syncOrientation();
  window.addEventListener("resize", syncOrientation);
  window.addEventListener("orientationchange", syncOrientation);
}

setActiveNav();
renderHome();
bindEntriesPage();
renderSummaryPage();
bindSettingsPage();
registerServiceWorker();
enforcePortraitInPwa();
