const PRODUCTS = {
  members: { rate: 0.03, min: 100, totalEl: 'memberTotal', inputId: 'memberQty', minMsg: 'No — minimum order is 100 members.' },
  vc: { rate: 0.50, min: 1, totalEl: 'vcTotal', inputId: 'vcQty', minMsg: 'Enter at least 1 VC bot.' },
  spam: { rate: 6.50, fixed: true, totalEl: 'spamTotal' },
  autoreply: { rate: 4.00, fixed: true, totalEl: 'autoreplyTotal' },
};

const calcTabs = document.querySelectorAll('.calc-tab');
const calcPanels = document.querySelectorAll('.calc-body');
const loginBtn = document.getElementById('loginBtn');
const checkoutBtn = document.getElementById('checkoutBtn');
const toast = document.getElementById('toast');
const checkoutOverlay = document.getElementById('checkoutOverlay');
const checkoutClose = document.getElementById('checkoutClose');
const checkoutDone = document.getElementById('checkoutDone');
const payTabs = document.querySelectorAll('.pay-tab');
const payEthPanel = document.getElementById('payEth');
const payBtcPanel = document.getElementById('payBtc');

let activeTab = 'members';
let currentUser = null;
let currentOrder = null;

function formatUSD(amount) {
  return `$${amount.toFixed(2)}`;
}

function updateProductTotal(productKey) {
  const product = PRODUCTS[productKey];
  const totalEl = document.getElementById(product.totalEl);

  if (product.fixed) {
    totalEl.textContent = formatUSD(product.rate);
    return;
  }

  const input = document.getElementById(product.inputId);
  const raw = input.value.trim();

  if (raw === '') {
    totalEl.textContent = '$0.00';
    return;
  }

  const qty = parseInt(raw, 10);
  if (isNaN(qty) || qty < 0) {
    totalEl.textContent = '$0.00';
    return;
  }

  totalEl.textContent = formatUSD(qty * product.rate);
}

function switchTab(tabKey) {
  activeTab = tabKey;
  calcTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabKey));
  calcPanels.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== tabKey));
}

calcTabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('[data-product]').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.product);
  });
});

Object.keys(PRODUCTS).forEach((key) => {
  const product = PRODUCTS[key];
  if (!product.fixed) {
    document.getElementById(product.inputId).addEventListener('input', () => updateProductTotal(key));
  }
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), 4500);
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
    // functions not deployed yet
  }
  renderLoginButton();
}

function openCheckout(order) {
  currentOrder = order;
  document.getElementById('checkoutOrderId').textContent = order.id;
  document.getElementById('checkoutSummary').innerHTML = `
    <div class="checkout-summary-item">
      <span>Product</span>
      <strong>${order.qty.toLocaleString()} × ${order.productLabel}</strong>
    </div>
    <div class="checkout-summary-item checkout-summary-total">
      <span>Total due</span>
      <strong>${formatUSD(order.totalUsd)}</strong>
    </div>
  `;
  document.getElementById('payEthAmount').textContent = `${order.payment.eth.amount} ETH`;
  document.getElementById('payEthAddress').textContent = order.payment.eth.address;
  document.getElementById('payBtcAmount').textContent = `${order.payment.btc.amount} BTC`;
  document.getElementById('payBtcAddress').textContent = order.payment.btc.address;

  payTabs.forEach((t) => {
    const isEth = t.dataset.currency === 'eth';
    t.classList.toggle('active', isEth);
    t.setAttribute('aria-selected', String(isEth));
  });
  payEthPanel.classList.remove('hidden');
  payBtcPanel.classList.add('hidden');

  checkoutOverlay.classList.remove('hidden');
  requestAnimationFrame(() => checkoutOverlay.classList.add('is-open'));
  checkoutOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('checkout-open');
}

function closeCheckout() {
  checkoutOverlay.classList.remove('is-open');
  checkoutOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('checkout-open');
  currentOrder = null;
  setTimeout(() => {
    if (!checkoutOverlay.classList.contains('is-open')) {
      checkoutOverlay.classList.add('hidden');
    }
  }, 280);
}

payTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    payTabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    const isEth = tab.dataset.currency === 'eth';
    payEthPanel.classList.toggle('hidden', !isEth);
    payBtcPanel.classList.toggle('hidden', isEth);
  });
});

document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const el = document.getElementById(btn.dataset.copy);
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.textContent.trim());
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      showToast('Copied to clipboard');
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove('copied');
      }, 1400);
    } catch {
      showToast('Could not copy');
    }
  });
});

checkoutClose.addEventListener('click', closeCheckout);
checkoutOverlay.addEventListener('click', (e) => {
  if (e.target === checkoutOverlay) closeCheckout();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && checkoutOverlay.classList.contains('is-open')) {
    closeCheckout();
  }
});
checkoutDone.addEventListener('click', () => {
  showToast(`Order ${currentOrder?.id} marked as paid. We’ll confirm shortly.`);
  closeCheckout();
});

checkoutBtn.addEventListener('click', async () => {
  if (!currentUser) {
    showToast('Please log in with Discord first.');
    window.location.href = '/auth/discord';
    return;
  }

  const product = PRODUCTS[activeTab];
  let qty;

  if (product.fixed) {
    qty = 1;
  } else {
    const raw = document.getElementById(product.inputId).value.trim();
    qty = parseInt(raw, 10);
    if (!raw || isNaN(qty) || qty < product.min) {
      showToast(product.minMsg);
      return;
    }
  }

  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Creating order...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: activeTab, qty }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Checkout failed.');
      return;
    }
    openCheckout(data.order);
  } catch {
    showToast('Network error. Try again.');
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = 'Proceed to checkout';
  }
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

Object.keys(PRODUCTS).forEach(updateProductTotal);
loadSession();
