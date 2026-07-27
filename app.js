// ─── Pricing constants ───────────────────────────────────────────
const MEMBER_RATE = 0.02;
const VC_BOT_RATE = 0.50;

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
let currentUser = null;

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

calcTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    calcTabs.forEach((t) => t.classList.toggle('active', t === tab));
    calcMembers.classList.toggle('hidden', activeTab !== 'members');
    calcVc.classList.toggle('hidden', activeTab !== 'vc');
  });
});

document.querySelectorAll('[data-product]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = document.querySelector(`.calc-tab[data-tab="${btn.dataset.product}"]`);
    if (tab) tab.click();
  });
});

memberQtyInput.addEventListener('input', updateMemberTotal);
vcQtyInput.addEventListener('input', updateVcTotal);

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function renderLoginButton() {
  if (currentUser) {
    loginBtn.innerHTML = `
      <img src="${currentUser.avatarUrl}" alt="" width="24" height="24" style="border-radius:50%" />
      ${currentUser.username}
    `;
    loginBtn.onclick = () => {
      if (confirm('Log out of MioMembers?')) {
        window.location.href = '/auth/logout';
      }
    };
  } else {
    loginBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
      Login with Discord
    `;
    loginBtn.onclick = () => {
      window.location.href = '/auth/discord';
    };
  }
}

async function loadSession() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      currentUser = await res.json();
    }
  } catch {
    // offline or functions not deployed yet
  }
  renderLoginButton();
}

checkoutBtn.addEventListener('click', () => {
  if (!currentUser) {
    showToast('Please log in with Discord first.');
    window.location.href = '/auth/discord';
    return;
  }
  const isMembers = activeTab === 'members';
  const qty = isMembers ? parseInt(memberQtyInput.value, 10) : parseInt(vcQtyInput.value, 10);
  const total = isMembers ? qty * MEMBER_RATE : qty * VC_BOT_RATE;
  const product = isMembers ? 'Discord Members' : 'VC AFK Bots';
  showToast(`Order: ${qty} × ${product} = ${formatUSD(total)} — checkout coming soon!`);
});

const params = new URLSearchParams(window.location.search);
if (params.get('login') === 'success') {
  showToast('Logged in with Discord successfully!');
  window.history.replaceState({}, '', '/');
  loadSession();
} else if (params.get('login') === 'failed') {
  showToast('Discord login failed. Check your OAuth settings in Cloudflare.');
  window.history.replaceState({}, '', '/');
}

updateMemberTotal();
updateVcTotal();
loadSession();
