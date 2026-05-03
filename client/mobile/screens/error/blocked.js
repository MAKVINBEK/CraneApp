const params = new URLSearchParams(location.search);
  const retryMin = parseInt(params.get('retry') || '0', 10);
  const msg = params.get('msg') || '';
  const code = params.get('code') || '403';

  // Объявляем все элементы
  const badgeText = document.getElementById('badgeText');
  const title = document.getElementById('title');
  const desc = document.getElementById('desc');
  const timerWrap = document.getElementById('timerWrap');
  const btnEl = document.getElementById('btn');
  const numEl = document.getElementById('timerNum');
  const barEl = document.getElementById('ringBar');

  // Настраиваем текст под код ошибки
  if (code === '429') {
    badgeText.textContent = window.i18n?.t('rateLimitStatus') || 'Лимит запросов';
    title.textContent = window.i18n?.t('rateLimitTitle') || 'Притормози немного';
    desc.textContent = window.i18n?.t('rateLimitDesc') || 'Ты отправляешь запросы слишком быстро. Подожди — и всё заработает снова.';
    document.querySelector('.ring-bar').style.stroke = '#FFA500';
    document.querySelector('.status-dot').style.background = '#FFA500';
    document.querySelector('.status-badge').style.background = 'rgba(255,165,0,0.12)';
    document.querySelector('.status-badge').style.borderColor = 'rgba(255,165,0,0.3)';
    document.querySelector('.status-badge').style.color = '#FFA500';
    document.querySelector('.emoji-wrap').textContent = '🚦';
  } else if (code === '403' && retryMin > 0) {
    // Временный бан IP
    badgeText.textContent = window.i18n?.t('temporaryBlock') || 'Временная блокировка';
    title.textContent = window.i18n?.t('blockedTitle') || 'Доступ временно закрыт';
    desc.textContent = msg || window.i18n?.t('blockedDesc') || 'Твой IP был временно заблокирован из-за подозрительной активности.';
  } else if (code === '403') {
    // Перманентный бан аккаунта
    badgeText.textContent = window.i18n?.t('accountBlocked') || 'Аккаунт заблокирован';
    title.textContent = window.i18n?.t('accountBlocked') || 'Аккаунт заблокирован';
    desc.textContent = msg || window.i18n?.t('accountBlockedDesc') || 'Ваш аккаунт был заблокирован администратором. Обратитесь в поддержку для уточнения деталей.';
    timerWrap.style.display = 'none';
    btnEl.disabled = false;
    btnEl.textContent = window.i18n?.t('logoutAccount') || 'Выйти из аккаунта';
    btnEl.onclick = logout;
  }
  if (msg && code !== '403') desc.textContent = msg;

  const CIRCUMFERENCE = 276.46;
  const totalSec = retryMin * 60;
  let remaining = totalSec;

  if (totalSec <= 0) {
    timerWrap.style.display = 'none';
    btnEl.disabled = false;
  } else {
    function tick() {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      numEl.textContent = m > 0 ? m + ':' + String(s).padStart(2,'0') : s;
      document.getElementById('timerLabel').textContent = m > 0
        ? (window.i18n?.t('minutesUntilUnlock') || 'минут до разблокировки')
        : (window.i18n?.t('secondsUntilUnlock') || 'секунд до разблокировки');
      barEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - remaining / totalSec);
      if (remaining <= 0) {
        numEl.textContent = '✓'; barEl.style.stroke = '#00E676';
        btnEl.disabled = false; return;
      }
      remaining--;
      setTimeout(tick, 1000);
    }
    tick();
  }

  function goBack() {
    const prev = sessionStorage.getItem('crane_pre_error_url');
    if (prev) window.location.href = prev; else history.back();
  }

  function logout() {
    localStorage.removeItem('craneapp_auth_token');
    localStorage.removeItem('craneapp_user_data');
    localStorage.removeItem('craneapp_settings');
    window.location.href = '/client/mobile/screens/auth/login.html';
  }

  if (document.referrer && !document.referrer.includes('/error/')) {
    sessionStorage.setItem('crane_pre_error_url', document.referrer);
  }
