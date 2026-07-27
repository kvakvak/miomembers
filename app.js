// ─── Pricing constants ───────────────────────────────────────────
const MEMBER_RATE = 0.02;   // $0.02 per member
const VC_BOT_RATE = 0.50;   // $0.50 per VC bot per month

// ─── Discord OAuth (replace with your credentials) ───────────────
// Get these from https://discord.com/developers/applications
const DISCORD_CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/discord/callback';
// When using server.js, point the login button to the backend route instead:
const USE_BACKEND_AUTH = false; // set true after configuring .env

function buildDiscordLoginUrl() {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

// ─── DOM refs ────────────────────────────────────────────────────
const memberQtyInput = document.getElementById('memberQty');
const vcQtyInput = document.getElementById('vcQty');
const memberTotalEl = document.getElementById('memberTotal');
const vcTotalEl = document.getElementById('vcTotal');
const calcTabs = document.querySelectorAll('.calc-tab');
const calcMembers = document.getElementById('calcMembers');
const calcVc = document.getElementById('calcVc');
const loginBtn = document.getElementById('loginBtn');
const checkoutBtn = document.getElementById('checkoutBtn');
const toast = document.getElementById('toast');

let activeTab = 'members';

// ─── Format currency ─────────────────────────────────────────────
function formatUSD(amount) {
  return `$${amount.toFixed(2)}`;
}

function updateMemberTotal() {
  const qty = Math.max(100, parseInt(memberQtyInput.value, 10) || 0);
  memberQtyInput.value = qty;
  memberTotalEl.textContent = formatUSD(qty * MEMBER_RATE);
}

function updateVcTotal() {
  const qty = Math.max(1, parseInt(vcQtyInput.value, 10) || 1);
  vcQtyInput.value = qty;
  vcTotalEl.textContent = formatUSD(qty * VC_BOT_RATE);
}

// ─── Tab switching ───────────────────────────────────────────────
calcTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    calcTabs.forEach((t) => t.classList.toggle('active', t === tab));
    calcMembers.classList.toggle('hidden', activeTab !== 'members');
    calcVc.classList.toggle('hidden', activeTab !== 'vc');
  });
});

// Product card buttons pre-select tab
document.querySelectorAll('[data-product]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const product = btn.dataset.product;
    const tab = document.querySelector(`.calc-tab[data-tab="${product}"]`);
    if (tab) tab.click();
  });
});

// ─── Inputs ──────────────────────────────────────────────────────
memberQtyInput.addEventListener('input', updateMemberTotal);
vcQtyInput.addEventListener('input', updateVcTotal);

// ─── Toast helper ────────────────────────────────────────────────
function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ─── Login button ────────────────────────────────────────────────
loginBtn.addEventListener('click', () => {
  if (USE_BACKEND_AUTH) {
    window.location.href = '/auth/discord';
    return;
  }
  if (DISCORD_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    showToast('Set your Discord Client ID in app.js first — see the Login setup section.');
    document.getElementById('discord-login').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  window.location.href = buildDiscordLoginUrl();
});

// ─── Checkout ────────────────────────────────────────────────────
checkoutBtn.addEventListener('click', () => {
  const isMembers = activeTab === 'members';
  const qty = isMembers
    ? parseInt(memberQtyInput.value, 10)
    : parseInt(vcQtyInput.value, 10);
  const total = isMembers ? qty * MEMBER_RATE : qty * VC_BOT_RATE;
  const product = isMembers ? 'Discord Members' : 'VC AFK Bots';

  showToast(`Order: ${qty} × ${product} = ${formatUSD(total)} — log in with Discord to continue.`);
});

// ─── Handle OAuth redirect result ────────────────────────────────
const params = new URLSearchParams(window.location.search);
if (params.get('login') === 'success') {
  showToast('Logged in with Discord successfully!');
  window.history.replaceState({}, '', '/');
} else if (params.get('login') === 'failed') {
  showToast('Discord login failed. Check your OAuth settings.');
  window.history.replaceState({}, '', '/');
}

// ─── Init ─────────────────────────────────────────────────────────
updateMemberTotal();
updateVcTotal();
