const CIRCUMFERENCE = 2 * Math.PI * 44; // 276.46
  const params = new URLSearchParams(location.search);
  const retryAfter = parseInt(params.get('retry') || '60', 10);
  let remaining = retryAfter;

  const numEl  = document.getElementById('timerNum');
  const barEl  = document.getElementById('ringBar');
  const btnEl  = document.getElementById('retryBtn');

  barEl.style.strokeDasharray = CIRCUMFERENCE;

  function tick() {
    numEl.textContent = remaining;
    const progress = remaining / retryAfter;
    barEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);

    if (remaining <= 0) {
      numEl.textContent = '✓';
      barEl.style.stroke = '#00E676';
      btnEl.disabled = false;
      btnEl.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Вернуться назад';
      return;
    }
    remaining--;
    setTimeout(tick, 1000);
  }

  tick();

  function goBack() {
    const prev = sessionStorage.getItem('crane_pre_ratelimit_url');
    if (prev) window.location.href = prev;
    else history.back();
  }

  // Сохраняем откуда пришли
  if (document.referrer && !document.referrer.includes('rate-limit')) {
    sessionStorage.setItem('crane_pre_ratelimit_url', document.referrer);
  }