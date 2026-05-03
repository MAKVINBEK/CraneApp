let attempts = 0;
  let countdownTimer = null;
  let autoRetryIn = 15;

  function updateTime() {
    document.getElementById('lastCheck').textContent =
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  async function retry() {
    const btn = document.getElementById('retryBtn');
    btn.classList.add('loading');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Проверяем...';

    attempts++;
    document.getElementById('attempts').textContent = attempts;
    updateTime();
    clearCountdown();

    try {
      const res = await fetch('/api/v1/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        document.getElementById('statusText').textContent = '✅ Онлайн';
        btn.innerHTML = '✅ Сервер работает! Перезагрузка...';
        setTimeout(() => {
          const prev = sessionStorage.getItem('crane_pre_error_url');
          window.location.href = prev || '/client/mobile/screens/chats/chats.html';
        }, 800);
        return;
      }
    } catch (_) {}

    document.getElementById('statusText').textContent = '❌ Недоступен';
    btn.classList.remove('loading');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Попробовать снова';
    startCountdown(15);
  }

  function startCountdown(sec) {
    autoRetryIn = sec;
    const el = document.getElementById('countdown');
    clearCountdown();
    countdownTimer = setInterval(() => {
      autoRetryIn--;
      el.innerHTML = 'Автоматическая проверка через <b>' + autoRetryIn + '</b> сек';
      if (autoRetryIn <= 0) {
        clearCountdown();
        el.textContent = '';
        retry();
      }
    }, 1000);
  }

  function clearCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    document.getElementById('countdown').textContent = '';
  }

  // Добавляем анимацию спиннера
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }';
  document.head.appendChild(style);

  // Сохраняем откуда пришли
  if (document.referrer && !document.referrer.includes('server-down')) {
    sessionStorage.setItem('crane_pre_error_url', document.referrer);
  }

  // Первая проверка и автозапуск
  updateTime();
  document.getElementById('statusText').textContent = '❌ Недоступен';
  startCountdown(15);