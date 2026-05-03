const token = localStorage.getItem('craneapp_auth_token');
let selectedPlan = 'monthly';
let selectedPrice = 150;

const PRICES = { monthly: 150, yearly: 990, lifetime: 2490 };
const LABELS = { monthly: 'месяц', yearly: 'год', lifetime: 'навсегда' };

async function init() {
  try {
    const r = await fetch('/api/v1/users/me', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) {
      const d = await r.json();
      if (d.user?.isPremium || d.user?.is_premium) {
        document.getElementById('heroBadge').style.display = 'inline-flex';
        document.getElementById('statusBanner').style.display = 'flex';
        document.getElementById('plansLabel').style.display = 'none';
        document.getElementById('plansSection').style.display = 'none';
        document.getElementById('payLabel').style.display = 'none';
        document.getElementById('payForm').style.display = 'none';
        document.getElementById('subBtn').textContent = 'Управление подпиской';
        document.getElementById('subBtn').onclick = manageSubscription;
      }
    }
  } catch (_) {}
}

function selectPlan(el, plan, price) {
  document.querySelectorAll('.plan').forEach(p => p.classList.remove('sel'));
  el.classList.add('sel');
  selectedPlan = plan;
  selectedPrice = price;
  document.getElementById('subBtn').textContent = 'Оплатить ' + price.toLocaleString('ru') + ' ₽';
}

function fmtCard(el) {
  let v = el.value.replace(/\D/g,'').substring(0,16);
  el.value = v.replace(/(.{4})/g,'$1 ').trim();
}

function fmtExp(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length >= 2) v = v.substring(0,2) + '/' + v.substring(2,4);
  el.value = v;
}

async function subscribe() {
  const num = document.getElementById('cardNum').value.replace(/\s/g,'');
  const name = document.getElementById('cardName').value.trim();
  const exp = document.getElementById('cardExp').value;
  const cvv = document.getElementById('cardCvv').value;

  if (num.length < 16) { toast('Введите номер карты', true); return; }
  if (!name) { toast('Введите имя держателя', true); return; }
  if (exp.length < 5) { toast('Введите срок действия', true); return; }
  if (cvv.length < 3) { toast('Введите CVV', true); return; }

  const btn = document.getElementById('subBtn');
  btn.disabled = true;
  btn.textContent = 'Обработка...';

  // Имитация обработки платежа
  await new Promise(r => setTimeout(r, 2000));

  try {
    const res = await fetch('/api/v1/premium/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ plan: selectedPlan, price: selectedPrice })
    });

    if (res.ok) {
      // Обновляем localStorage
      const userData = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}');
      userData.isPremium = true;
      localStorage.setItem('craneapp_user_data', JSON.stringify(userData));

      toast('🎉 Премиум активирован!', false, true);
      setTimeout(() => history.back(), 2000);
    } else {
      toast('Ошибка оплаты. Попробуйте позже.', true);
      btn.disabled = false;
      btn.textContent = 'Оплатить ' + selectedPrice.toLocaleString('ru') + ' ₽';
    }
  } catch (e) {
    toast('Ошибка соединения', true);
    btn.disabled = false;
    btn.textContent = 'Оплатить ' + selectedPrice.toLocaleString('ru') + ' ₽';
  }
}

function manageSubscription() {
  if (confirm('Отменить подписку Премиум?')) {
    fetch('/api/v1/premium/cancel', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
      .catch(() => {});
    const userData = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}');
    userData.isPremium = false;
    localStorage.setItem('craneapp_user_data', JSON.stringify(userData));
    toast('Подписка отменена');
    setTimeout(() => location.reload(), 1500);
  }
}

function toast(msg, err, gold) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : gold ? ' gold' : '');
  t.innerHTML = '<span>' + (err ? '❌' : gold ? '⭐' : '✓') + '</span><span>' + msg + '</span>';
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .25s'; setTimeout(()=>t.remove(),250); }, 3000);
}

init();