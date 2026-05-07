const token = localStorage.getItem('craneapp_auth_token');
if (!token) location.href = '../auth/login.html';

const ICONS = ['📁', '💬', '👥', '⭐', '🔔', '📌', '🏠', '💼', '🎮', '🎵', '📸', '🎬', '❤️', '🚀'];
const COLORS = ['#FF007F', '#9D00FF', '#0088FF', '#00C864', '#FF8800', '#FF4B4B', '#00C8C8', '#FFD700'];

let folders = [];
let allChats = [];
let editId = null;
let selIcon = '📁';
let selColor = '#FF007F';
let selChats = new Set();

function tr(key, fallback, vars) {
  const value = window.i18n?.t(key, vars);
  if (value && value !== key) return value;
  return fallback;
}

async function init() {
  folders = JSON.parse(localStorage.getItem('craneapp_folders') || '[]');
  renderList();
  await Promise.all([syncFolders(), loadChats()]);
  renderList();
  if (window.i18n) window.i18n.translatePage();
}

async function syncFolders() {
  try {
    const r = await fetch('/api/v1/users/all-settings', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) {
      const d = await r.json();
      if (d.folders?.length) {
        folders = d.folders;
        localStorage.setItem('craneapp_folders', JSON.stringify(folders));
      }
    }
  } catch (_) {}
}

async function loadChats() {
  try {
    const r = await fetch('/api/v1/chats', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return;
    const d = await r.json();
    const myId = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}').id;
    allChats = await Promise.all((d.chats || []).map(async c => {
      if (c.type === 'private') {
        try {
          const mr = await fetch('/api/v1/chats/' + c.id + '/members', { headers: { Authorization: 'Bearer ' + token } });
          if (mr.ok) {
            const md = await mr.json();
            const o = (md.members || []).find(m => m.id !== myId);
            if (o) return { ...c, name: ((o.first_name || '') + ' ' + (o.last_name || '')).trim() || o.username || tr('user', 'User'), avatarUrl: o.avatar_url || '' };
          }
        } catch (_) {}
      }
      return { ...c, name: c.title || tr('chat', 'Chat') };
    }));
  } catch (_) {}
}

function renderList() {
  const sec = document.getElementById('folderSec');
  const hint = document.getElementById('listHint');
  let html = '';

  folders.forEach(f => {
    const n = (f.chatIds || []).length;
    html += '<div class="row" onclick="openEdit(\'' + f.id + '\')"><div class="ri" style="background:' + f.color + '22">' + f.icon + '</div><div class="rt"><div class="rn">' + esc(f.name) + '</div><div class="rs">' + chatsLabel(n) + '</div></div><span class="ra">›</span></div>';
  });

  html += '<div class="row" onclick="openEdit(null)"><div class="ri" style="background:rgba(255,0,127,.15);color:var(--a);font-size:22px;font-weight:300">+</div><div class="rt"><div class="rn" style="color:var(--a)">' + tr('createFolder', 'Create folder') + '</div></div></div>';

  sec.innerHTML = html;
  hint.textContent = folders.length ? tr('folderHintLong', 'Folders are displayed as tabs in the chat list. Tap a folder to open it in chats.') : '';
}

function openEdit(folderId) {
  editId = folderId;
  const f = folderId ? folders.find(x => x.id === folderId) : null;
  selIcon = f?.icon || '📁';
  selColor = f?.color || '#FF007F';
  selChats = new Set(f?.chatIds || []);

  document.getElementById('editTitle').textContent = f ? tr('editFolderShort', 'Edit') : tr('newFolder', 'New folder');
  document.getElementById('fName').value = f?.name || '';
  document.getElementById('btnDel').style.display = f ? 'block' : 'none';

  renderIcons();
  renderColors();
  renderChatList();

  document.getElementById('listView').style.display = 'none';
  document.getElementById('editView').style.display = 'block';
  window.scrollTo(0, 0);
  setTimeout(() => document.getElementById('fName').focus(), 200);
}

function backToList() {
  document.getElementById('editView').style.display = 'none';
  document.getElementById('listView').style.display = 'block';
  window.scrollTo(0, 0);
}

function renderIcons() {
  document.getElementById('iconRow').innerHTML = ICONS.map(i => '<div class="ico' + (i === selIcon ? ' sel' : '') + '" onclick="pickIcon(\'' + i + '\')">' + i + '</div>').join('');
}

function renderColors() {
  document.getElementById('colorRow').innerHTML = COLORS.map(c => '<div class="col' + (c === selColor ? ' sel' : '') + '" style="background:' + c + '" onclick="pickColor(\'' + c + '\')"></div>').join('');
}

function renderChatList() {
  const el = document.getElementById('chatList');
  if (!allChats.length) {
    el.innerHTML = '<div style="padding:14px 16px;color:var(--t3);font-size:14px">' + tr('noAvailableChats', 'No available chats') + '</div>';
    return;
  }
  el.innerHTML = allChats.map(c => {
    const n = c.name || tr('chat', 'Chat');
    const on = selChats.has(c.id);
    const av = isUrl(c.avatarUrl) ? '<img src="' + esc(c.avatarUrl) + '" alt="">' : n[0].toUpperCase();
    return '<div class="ci' + (on ? ' on' : '') + '" onclick="toggleChat(\'' + c.id + '\')"><div class="cav">' + av + '</div><span class="cn">' + esc(n) + '</span>' + (on ? '<div class="ck">✓</div>' : '') + '</div>';
  }).join('');
}

function pickIcon(i) {
  selIcon = i;
  renderIcons();
}

function pickColor(c) {
  selColor = c;
  renderColors();
}

function toggleChat(id) {
  selChats.has(id) ? selChats.delete(id) : selChats.add(id);
  renderChatList();
}

async function saveFolder() {
  const name = document.getElementById('fName').value.trim();
  if (!name) {
    toast(tr('enterFolderName', 'Enter a title'), true);
    return;
  }
  const chatIds = [...selChats];

  if (chatIds.length === 0) {
    if (editId) {
      folders = folders.filter(x => x.id !== editId);
      await persist();
      backToList();
      renderList();
      toast(tr('folderDeletedNoChats', 'Folder deleted because it has no chats'));
    } else {
      toast(tr('addAtLeastOneChat', 'Add at least one chat'), true);
    }
    return;
  }

  const data = { id: editId || ('f' + Date.now()), name, icon: selIcon, color: selColor, chatIds };
  if (editId) {
    const i = folders.findIndex(x => x.id === editId);
    if (i >= 0) folders[i] = data;
    else folders.push(data);
  } else {
    folders.push(data);
  }
  await persist();
  backToList();
  renderList();
  toast(editId ? tr('folderUpdated', 'Folder updated') : tr('folderCreated', 'Folder created'));
}

async function deleteFolder() {
  const f = folders.find(x => x.id === editId);
  if (!confirm(tr('deleteFolderConfirm', 'Delete folder "{name}"?', { name: f?.name || '' }))) return;
  folders = folders.filter(x => x.id !== editId);
  await persist();
  backToList();
  renderList();
  toast(tr('folderDeleted', 'Folder deleted'));
}

async function persist() {
  localStorage.setItem('craneapp_folders', JSON.stringify(folders));
  try {
    await fetch('/api/v1/users/all-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ folders })
    });
  } catch (_) {}
}

function isUrl(u) {
  return u && (u.startsWith('http') || u.startsWith('/') || u.startsWith('data:'));
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chatsLabel(n) {
  if (window.i18n?.tc) return window.i18n.tc('chatsCount', n);
  return n + ' ' + (n === 1 ? 'chat' : 'chats');
}

function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<span>' + (err ? '⚠️' : '✓') + '</span><span>' + msg + '</span>';
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .25s';
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

init();
