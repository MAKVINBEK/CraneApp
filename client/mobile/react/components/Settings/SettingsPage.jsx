import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { services } from '../../../application/services/serviceContainer.js';
import { ToastStack } from '../common/ToastStack.jsx';
import { useToasts } from '../../hooks/useToasts.js';

export function SettingsPage({ t = (k, f) => f }) {
  const navigate = useNavigate();
  const { toasts, showToast } = useToasts();
  const [user, setUser] = useState({});
  const [settings, setSettings] = useState({
    theme: 'dark',
    language: 'ru',
    notifications: true,
    sounds: true,
  });

  const token = localStorage.getItem('craneapp_auth_token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    // Sync profile and settings
    async function syncData() {
      try {
        const [nextUser, settingsPayload] = await Promise.all([
          services.userService.getMe(),
          services.userService.getSettings(),
        ]);

        if (nextUser) {
          setUser(nextUser);
          localStorage.setItem('craneapp_user_data', JSON.stringify(nextUser));
        }

        if (settingsPayload.settings) {
          setSettings(settingsPayload.settings);
          localStorage.setItem('craneapp_settings', JSON.stringify(settingsPayload.settings));
        }
      } catch (e) {
        showToast('error', 'Ошибка синхронизации настроек с сервером', '⚠️');
      }
    }

    syncData();
  }, [token, navigate]);

  async function updateSetting(name, value) {
    const updated = { ...settings, [name]: value };
    setSettings(updated);
    localStorage.setItem('craneapp_settings', JSON.stringify(updated));

    try {
      await services.userService.updateSettings(updated);
      showToast('success', t('settingsSaved', 'Настройки сохранены'), '✓');
    } catch (_) {
      showToast('error', 'Не удалось сохранить настройки на сервере', '⚠️');
    }
  }

  function handleLogout() {
    localStorage.removeItem('craneapp_auth_token');
    localStorage.removeItem('craneapp_user_data');
    localStorage.removeItem('craneapp_settings');
    navigate('/login');
  }

  const userInitials = (user.firstName || user.username || 'U').charAt(0).toUpperCase();

  return (
    <main className="settings-page">
      <ToastStack toasts={toasts} />
      <header className="settings-header">
        <button className="back-arrow-btn" onClick={() => navigate('/chats')}>
          ‹
        </button>
        <h1>{t('settings', 'Настройки')}</h1>
      </header>

      <section className="settings-profile-card">
        <div className="settings-avatar-wrap">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="profile-avatar-img" />
          ) : (
            <span>{userInitials}</span>
          )}
        </div>
        <div className="settings-profile-info">
          <h2>{user.firstName || 'Пользователь'}</h2>
          <p>{user.username ? `@${user.username}` : ''}</p>
          {user.bio && <p style={{ marginTop: 6, opacity: 0.8 }}>{user.bio}</p>}
        </div>
      </section>

      <section className="settings-block-group">
        <div className="settings-row-item">
          <div className="settings-row-left">
            <span className="settings-row-icon">🔔</span>
            <span>{t('notifications', 'Уведомления')}</span>
          </div>
          <div
            className={`settings-toggle-switch ${settings.notifications ? 'is-active' : ''}`}
            onClick={() => updateSetting('notifications', !settings.notifications)}
          >
            <div className="settings-toggle-knob" />
          </div>
        </div>

        <div className="settings-row-item">
          <div className="settings-row-left">
            <span className="settings-row-icon">🎵</span>
            <span>{t('sounds', 'Звуки')}</span>
          </div>
          <div
            className={`settings-toggle-switch ${settings.sounds ? 'is-active' : ''}`}
            onClick={() => updateSetting('sounds', !settings.sounds)}
          >
            <div className="settings-toggle-knob" />
          </div>
        </div>
      </section>

      <section className="settings-block-group">
        <div className="settings-row-item" onClick={() => showToast('info', 'Эта функция будет доступна в следующем обновлении', 'ℹ️')}>
          <div className="settings-row-left">
            <span className="settings-row-icon">🎨</span>
            <span>{t('appearance', 'Оформление')}</span>
          </div>
          <div className="settings-row-right">
            <span>{settings.theme === 'dark' ? 'Тёмная' : 'Светлая'}</span>
            <span>›</span>
          </div>
        </div>

        <div className="settings-row-item" onClick={() => showToast('info', 'Эта функция будет доступна в следующем обновлении', 'ℹ️')}>
          <div className="settings-row-left">
            <span className="settings-row-icon">🌐</span>
            <span>{t('language', 'Язык')}</span>
          </div>
          <div className="settings-row-right">
            <span>Русский</span>
            <span>›</span>
          </div>
        </div>
      </section>

      <div className="logout-btn-container">
        <button className="logout-btn-block" onClick={handleLogout}>
          {t('logout', 'Выйти из аккаунта')}
        </button>
      </div>
    </main>
  );
}
