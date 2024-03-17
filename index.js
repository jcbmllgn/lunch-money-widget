/****************************************************
             CONFIGURATION
*****************************************************/
const COLORS = {
  bg1: "#1D1F21",
  bg2: "#282A2E",
};
const FONT_NAME = "Menlo";
const FONT_SIZE = 12;
const regularFont = new Font(FONT_NAME, FONT_SIZE);
const regularColor = Color.white();

const BASE_URL = "https://dev.lunchmoney.app";

const local = FileManager.local();
const iCloud = FileManager.iCloud();

const BASE_FILE = "LunchMoneyWidget";
const API_FILE = "apiKey";
const CACHE_KEY = "lunchMoneyCache";
const CACHED_MS = 7200000; // 2 hours

const ICLOUD = "iCloud";
const LOCAL = "local";
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/****************************************************
               SETUP
  *****************************************************/

const cache = new Cache(ICLOUD);
const LM_ACCESS_TOKEN = await getApiKey();
const widget = await getWidget();

Script.setWidget(widget);
Script.complete();

/****************************************************
               WIDGET
  *****************************************************/

async function getWidget() {
  const widget = new ListWidget();
  const gradient = getLinearGradient(COLORS.bg1, COLORS.bg2);
  widget.backgroundGradient = gradient;
  widget.setPadding(10, 18, 10, 18);
  const mainStack = widget.addStack();
  mainStack.layoutVertically();
  mainStack.spacing = 2;
  mainStack.size = new Size(320, 0);
  const data = await getAllData();
  const headingStack = mainStack.addStack();
  headingStack.layoutHorizontally();
  headingStack.addSpacer();
  const line = headingStack.addText(
    `💰 Lunch Money - ${MONTHS[new Date().getMonth()]} 💰`
  );
  headingStack.addSpacer();
  line.font = regularFont;
  line.textColor = regularColor;
  line.centerAlignText(); // INCOME and EXPENSES
  const budget = mainStack.addStack();
  budget.layoutHorizontally();
  const incomeText = budget.addText("💵Income: ");
  incomeText.font = regularFont;
  incomeText.textColor = regularColor;
  const incomeNum = budget.addText(data.income);
  incomeNum.font = regularFont;
  incomeNum.textColor = Color.green();
  const expenseText = budget.addText(" 🛍Expenses ");
  expenseText.font = regularFont;
  expenseText.textColor = regularColor;
  const expenseNum = budget.addText(data.spent);
  expenseNum.font = regularFont;
  expenseNum.textColor = Color.red();
  budget.addSpacer();
  const savingsStack = mainStack.addStack();
  savingsStack.layoutHorizontally();
  const savingsText = savingsStack.addText("🏦 MTD savings rate: ");
  savingsText.font = regularFont;
  savingsText.textColor = regularColor;
  const savingsNum = savingsStack.addText(data.savings ?? "€0.00");
  savingsNum.font = regularFont;
  savingsNum.textColor = data.savings?.startsWith("-")
    ? Color.red()
    : Color.green();
  savingsStack.addSpacer(); // ACCOUNTS and TRANSACTIONS
  const accounts = mainStack.addText(
    `⏳ Transactions to review: ${data.pendingTransactions}`
  );
  accounts.font = regularFont;
  accounts.textColor = regularColor;

  if (data.hoursSincePlaidUpdate > 24) {
    const lastUpdated = mainStack.addText(`🕒 Oldest Balance Updates:`);
    lastUpdated.textColor = regularColor;
    lastUpdated.font = regularFont;
    const plaid = mainStack.addText(`   - Plaid: ${data.plaidOldestUpdate}`);
    plaid.font = regularFont;
    plaid.textColor = regularColor;

    // This wasn't useful for me, it just showed the last time I withdrew cash or spent cash
    //   const manual = mainStack.addText(`   - Manual: ${data.manualOldestUpdate}`);
    //   manual.font = regularFont;
    //   manual.textColor = regularColor;
  }

  const message = mainStack.addText(getMessageToDisplay(data));
  message.font = regularFont;
  message.textColor = regularColor;
  mainStack.addSpacer();
  widget.title = "Lunch Money";
  return widget;
}

async function getAllData() {
  const cached = cache.get(CACHE_KEY, CACHED_MS);
  if (cached) return JSON.parse(cached);
  const responses = await Promise.all([
    lunchMoneyGetPendingTransactions(),
    lunchMoneyGetPlaidAccountsInfo(),
    lunchMoneyGetBudgetInfo(),
    lunchMoneyGetAssetsInfo(),
  ]);
  const data = {
    pendingTransactions: responses[0],
    ...responses[1],
    ...responses[2],
    ...responses[3],
  };
  cache.set(CACHE_KEY, JSON.stringify(data));
  return data;
}

function getMessageToDisplay(data) {
  if (data.accountsInError > 1) {
    return "🧾 Some accounts need your attention.";
  }
  if (data.savings?.startsWith("-")) {
    return "💳 Looks rough, try and save more!";
  } else {
    return "🤑 You're doing great saving!";
  }
}
/****************************************************
               UI FUNCTIONS
  *****************************************************/

function getLinearGradient(color1, color2) {
  const gradient = new LinearGradient();
  gradient.colors = [new Color(color1), new Color(color2)];
  gradient.locations = [0.0, 1.0];
  return gradient;
}

/****************************************************
              API
  *****************************************************/

async function lunchMoneyGetPendingTransactions() {
  const url = `${BASE_URL}/v1/transactions`;
  const params = {
    limit: 250,
    status: "uncleared",
    currency: "EUR",
  };
  try {
    const res = await makeLunchMoneyRequest(url, params);
    return res.transactions.length;
  } catch (e) {
    return "?";
  }
}

async function lunchMoneyGetAssetsInfo() {
  const url = `${BASE_URL}/v1/assets`;
  try {
    const res = await makeLunchMoneyRequest(url);
    let manualLastUpdate = new Date();
    let account = "";
    res.assets.forEach((acc) => {
      const thisAccount = new Date(acc.balance_as_of);
      if (thisAccount < manualLastUpdate) {
        manualLastUpdate = thisAccount;
        account = acc.display_name ?? acc.name;
      }
    });
    const value = getReadableDate(manualLastUpdate) + " - " + account;
    return {
      manualOldestUpdate: value,
    };
  } catch (e) {
    console.error(e);
    return "?";
  }
}

async function lunchMoneyGetPlaidAccountsInfo() {
  const ignore = ["active", "inactive", "syncing"];
  const url = `${BASE_URL}/v1/plaid_accounts`;
  try {
    const res = await makeLunchMoneyRequest(url);
    let plaidLastUpdate = new Date();
    res.plaid_accounts.forEach((acc) => {
      const thisAccount = new Date(acc.balance_last_update);
      if (thisAccount < plaidLastUpdate) plaidLastUpdate = thisAccount;
    });
    return {
      accountsInError: res.plaid_accounts.filter(
        (acc) => !ignore.some((ig) => ig === acc.status)
      ).length,
      plaidOldestUpdate: getReadableDate(plaidLastUpdate),
      hoursSincePlaidUpdate: Math.round(
        (new Date() - plaidLastUpdate) / 3600000
      ),
    };
  } catch (e) {
    return {
      accountsInError: "?",
      plaidOldestUpdate: "?",
      hoursSincePlaidUpdate: "?",
    };
  }
}

function getReadableDate(date) {
  const now = new Date();
  const diff = now.valueOf() - date.valueOf();
  const hours = Math.round((hrs = diff / 3600000));
  return hours > 24 ? `${Math.round(hours / 24)} days` : `${hours} hours`;
}

async function lunchMoneyGetBudgetInfo() {
  // savings rate, income, total spent
  const url = `${BASE_URL}/v1/budgets`;
  const dates = getMonthStart();
  log(`Date range: ${dates.start_date} - ${dates.end_date}`);
  log("");

  const params = { ...dates, currency: "EUR" };
  const data = {
    income: 0,
    spent: 0,
    savings: 0,
  };
  try {
    const res = await makeLunchMoneyRequest(url, params);
    res?.forEach((cat) => {
      if (
        !cat.exclude_from_budget &&
        !cat.exclude_from_totals &&
        !cat.is_group
      ) {
        const k = Object.keys(cat.data)[0];
        const catData = cat.data[k];
        const nonRecurring = Math.abs(catData?.spending_to_base ?? 0);
        const recurring =
          cat.recurring?.list?.reduce(
            (sum, next) => sum + Math.abs(next.to_base),
            0
          ) ?? 0;
        if (cat.is_income) {
          data.income += nonRecurring + recurring;
        } else {
          // this used to include recurring which double counted spend on categories where recurring items existed
          // data.spent += nonRecurring + recurring;

          data.spent += nonRecurring;
        }
      }
    });

    return {
      income: `€${data.income.toFixed(2)}`,
      spent: `€${data.spent.toFixed(2)}`,
      savings: `${(((data.income - data.spent) / data.income) * 100).toFixed(
        2
      )}%`,
    };
  } catch (e) {
    console.error(e);
    return { income: "?", spent: "?" };
  }
}

function makeLunchMoneyRequest(url, params = {}) {
  const headers = {
    Authorization: `Bearer ${LM_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
  return makeRequest(url, params, headers);
}

function makeRequest(url, params, headers, method = "GET") {
  let query = ``;
  Object.keys(params).forEach((key, i) => {
    const value = params[key];
    query += i === 0 ? "?" : "&";
    query += `${key}=${value}`;
  });
  const req = new Request(url + query);
  req.headers = headers;
  req.method = method;
  return req.loadJSON();
}

/****************************************************
              Utilities
  *****************************************************/

function getMonthStart() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const monthStr = month < 10 ? "0" + month : month;
  const dayStr = day < 10 ? "0" + day : day;
  const start_date = `${now.getFullYear()}-${monthStr}-01`;
  const end_date = `${now.getFullYear()}-${monthStr}-${dayStr}`;
  return { start_date, end_date };
}

/****************************************************
              File Management
  *****************************************************/

async function getApiKey() {
  const keyLocation = BASE_FILE + "/" + API_FILE;
  const exists = doesFileExist(keyLocation);
  if (exists) {
    return await readString(keyLocation, exists);
  }
  const alert = new Alert();
  alert.addSecureTextField("api_key", "");
  alert.addAction("Device");
  alert.addAction("iCloud");
  alert.title = "Lunch Money API Key";
  alert.message =
    "Please enter your lunch money API key, found at https://my.lunchmoney.app/developers. Where do you want to save this information?";

  const option = await alert.present();
  const apiKey = alert.textFieldValue(0);
  saveToFile(apiKey, API_FILE, option === 0 ? "Device" : "iCloud");
  return apiKey;
}

function saveToFile(content, key, storage = "iCloud") {
  const folder = iCloud.documentsDirectory() + "/LunchMoneyWidget";
  const filePath = folder + `/${key}`;
  if (storage === "iCloud") {
    iCloud.createDirectory(folder, true);
    iCloud.writeString(filePath, content);
  } else {
    local.createDirectory(folder, true);
    local.writeString(filePath, content);
  }
}

async function readString(filePath, storage) {
  if (storage === ICLOUD) {
    const file = `${iCloud.documentsDirectory()}/${filePath}`;
    await iCloud.downloadFileFromiCloud(file);
    return iCloud.readString(file);
  } else {
    return local.readString(local.documentsDirectory() + "/" + filePath);
  }
}

function doesFileExist(filePath) {
  if (iCloud.fileExists(iCloud.documentsDirectory() + "/" + filePath)) {
    return ICLOUD;
  }
  if (local.fileExists(local.documentsDirectory() + "/" + filePath)) {
    return LOCAL;
  }
  return false;
}

function Cache(storage) {
  const manager =
    storage === ICLOUD ? FileManager.iCloud() : FileManager.local();
  const dir = manager.documentsDirectory();
  const set = (key, content) => {
    const folder = dir + "/" + BASE_FILE;
    manager.createDirectory(folder, true);
    manager.writeString(folder + "/" + key, content);
  };
  const get = (key, millis) => {
    const oldestAccepted = new Date(Date.now() - millis);
    const filePath = dir + "/" + BASE_FILE + "/" + key;
    const date = manager.creationDate(filePath);
    const accepted = date > oldestAccepted;
    try {
      return accepted ? manager.readString(filePath) : null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };
  return { set, get };
}
