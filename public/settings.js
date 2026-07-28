const DISCORD_INVITE = 'https://discord.gg/Nw7P2zPvCV';

async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('not logged in');
    return await res.json();
  } catch {
    return null;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '—';
}

function wireCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1200);
      } catch {
        // ignore
      }
    });
  });
}

function renderUser(user) {
  const name = user.username || 'User';
  const handle = `@${name.toLowerCase().replace(/\s+/g, '')}`;
  const email = user.email || 'Not shared';

  document.querySelectorAll('[data-user-avatar]').forEach((img) => {
    img.src = user.avatarUrl;
    img.alt = name;
  });
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = name; });
  document.querySelectorAll('[data-user-handle]').forEach((el) => { el.textContent = handle; });

  setText('profileDiscordId', user.id);
  setText('profileEmail', email);

  document.querySelectorAll('[data-discord-invite]').forEach((link) => {
    link.href = DISCORD_INVITE;
  });
}

async function init() {
  const gate = document.getElementById('loginGate');
  const app = document.getElementById('dashApp');
  const user = await loadUser();

  if (!user) {
    gate?.classList.remove('hidden');
    app?.classList.add('hidden');
    document.getElementById('loginGateBtn')?.addEventListener('click', () => {
      window.location.href = '/auth/discord';
    });
    return;
  }

  gate?.classList.add('hidden');
  app?.classList.remove('hidden');
  renderUser(user);
  wireCopyButtons();

  document.getElementById('signOutBtn')?.addEventListener('click', () => {
    window.location.href = '/auth/logout';
  });
}

init();
