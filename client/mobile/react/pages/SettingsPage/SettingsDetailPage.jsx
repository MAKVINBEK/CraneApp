import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { disconnectRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import { useTheme } from "../../components/Context/ThemeContext.jsx";
import { useLanguage } from "../../components/locales/LanguageContext.jsx";
import { useToasts } from "../../hooks/useToasts.js";
import services from "../../services/serviceContainer.js";
import "../../styles/SettingsControls.css";

const DEFAULT_SETTINGS = {
  theme: "dark",
  language: "ru",
  notifications: true,
  sounds: true,
};

export function SettingsDetailPage({ activeTab, searchQuery, t }) {
  const navigate = useNavigate();
  const { showToast } = useToasts();
  const { theme, setTheme } = useTheme();
  const { lang, changeLanguage } = useLanguage();
  const [user, setUser] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [privacy, setPrivacy] = useState({});
  const [sessions, setSessions] = useState([]);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      services.userService.getMe(),
      services.userService.getSettings(),
      services.authService.twoFAStatus(),
      services.authService.sessions(),
    ])
      .then(([nextUser, payload, enabled, nextSessions]) => {
        if (!active) return;
        setUser(nextUser || {});
        setSettings({ ...DEFAULT_SETTINGS, ...(payload?.settings || {}) });
        setPrivacy(payload?.privacy || {});
        setTwoFAEnabled(enabled);
        setSessions(nextSessions);
        if (nextUser) {
          localStorage.setItem("craneapp_user_data", JSON.stringify(nextUser));
        }
      })
      .catch(() => showToast("error", "Не удалось загрузить настройки", "⚠️"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [showToast]);

  const query = searchQuery.trim().toLocaleLowerCase();
  const visible = useMemo(() => {
    if (!query) return true;
    const labels = {
      account: "аккаунт профиль пароль безопасность сессии устройства выход",
      notifications: "уведомления звуки сообщения звонки",
      appearance: "внешний вид тема светлая темная",
      privacy: "конфиденциальность приватность последняя активность сообщения группы",
      language: "язык русский english",
      about: "приложение версия экспорт данные",
    };
    return labels[activeTab]?.includes(query);
  }, [activeTab, query]);

  async function saveSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem("craneapp_settings", JSON.stringify(next));
    try {
      await services.userService.updateSettings(next);
      showToast("success", t("settingsSaved", "Настройки сохранены"), "✓");
    } catch (_) {
      showToast("error", "Не удалось сохранить настройки", "⚠️");
    }
  }

  async function savePrivacy(patch) {
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    try {
      await services.userService.updatePrivacy(next);
      showToast("success", "Настройки приватности сохранены", "✓");
    } catch (_) {
      showToast("error", "Не удалось сохранить настройки приватности", "⚠️");
    }
  }

  async function logout(all = false) {
    if (all) await services.authService.logoutAll().catch(() => {});
    else await services.authService.logout().catch(() => {});
    disconnectRealtimeSocket();
    localStorage.removeItem("craneapp_settings");
    navigate("/login");
  }

  if (loading) return <div className="settings-detail-state">Загрузка…</div>;
  if (!visible) return <div className="settings-detail-state">Ничего не найдено</div>;

  return (
    <main className="settings-detail-page">
      {activeTab === "account" && (
        <AccountSettings
          user={user}
          sessions={sessions}
          twoFAEnabled={twoFAEnabled}
          saving={saving}
          setSaving={setSaving}
          onUserChange={setUser}
          onTwoFAChange={setTwoFAEnabled}
          onLogout={logout}
          showToast={showToast}
        />
      )}
      {activeTab === "notifications" && (
        <SettingsSection title="Уведомления и звуки" description="Настройте поведение уведомлений на этом устройстве.">
          <ToggleRow label="Уведомления" value={settings.notifications} onChange={(value) => saveSettings({ notifications: value })} />
          <ToggleRow label="Звуки сообщений" value={settings.sounds} onChange={(value) => saveSettings({ sounds: value })} />
        </SettingsSection>
      )}
      {activeTab === "appearance" && (
        <SettingsSection title="Внешний вид" description="Выберите тему интерфейса.">
          <ChoiceRow label="Тема" value={theme} options={[{ value: "dark", label: "Тёмная" }, { value: "light", label: "Светлая" }]} onChange={(value) => { setTheme(value); saveSettings({ theme: value }); }} />
        </SettingsSection>
      )}
      {activeTab === "privacy" && (
        <SettingsSection title="Конфиденциальность" description="Управляйте тем, кто видит ваши данные.">
          <ChoiceRow label="Последняя активность" value={privacy.lastSeen || "all"} options={[{ value: "all", label: "Все" }, { value: "contacts", label: "Контакты" }, { value: "nobody", label: "Никто" }]} onChange={(value) => savePrivacy({ lastSeen: value })} />
          <ToggleRow label="Сообщения от незнакомых" value={privacy.messagesFromStrangers !== false} onChange={(value) => savePrivacy({ messagesFromStrangers: value })} />
        </SettingsSection>
      )}
      {activeTab === "language" && (
        <SettingsSection title="Язык" description="Язык интерфейса CraneApp.">
          <ChoiceRow label="Язык приложения" value={lang} options={[{ value: "ru", label: "Русский" }, { value: "en", label: "English" }]} onChange={(value) => { changeLanguage(value); saveSettings({ language: value }); }} />
        </SettingsSection>
      )}
      {activeTab === "about" && (
        <SettingsSection title="О приложении" description="CraneApp Messenger">
          <div className="settings-about-version">Версия 2</div>
          <button className="settings-secondary-button" onClick={() => downloadExport(showToast)}>Экспортировать мои данные</button>
        </SettingsSection>
      )}
    </main>
  );
}

function AccountSettings({ user, sessions, twoFAEnabled, saving, setSaving, onUserChange, onTwoFAChange, onLogout, showToast }) {
  const [profile, setProfile] = useState({ firstName: user.firstName || "", lastName: user.lastName || "", bio: user.bio || "" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [twoFAPassword, setTwoFAPassword] = useState("");

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await services.userService.updateMe(profile);
      onUserChange(updated);
      localStorage.setItem("craneapp_user_data", JSON.stringify(updated));
      showToast("success", "Профиль обновлён", "✓");
    } catch (_) {
      showToast("error", "Не удалось обновить профиль", "⚠️");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (newPassword.length < 10) {
      showToast("error", "Новый пароль должен содержать минимум 10 символов", "⚠️");
      return;
    }
    setSaving(true);
    try {
      await services.authService.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      showToast("success", "Пароль изменён", "✓");
    } catch (_) {
      showToast("error", "Не удалось изменить пароль", "⚠️");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTwoFA() {
    if (twoFAPassword.length < 6) {
      showToast("error", "Введите пароль 2FA — минимум 6 символов", "⚠️");
      return;
    }
    setSaving(true);
    try {
      await services.authService.setTwoFA(!twoFAEnabled, twoFAPassword);
      onTwoFAChange(!twoFAEnabled);
      setTwoFAPassword("");
      showToast("success", twoFAEnabled ? "2FA отключена" : "2FA включена", "✓");
    } catch (_) {
      showToast("error", "Не удалось изменить настройки 2FA", "⚠️");
    } finally {
      setSaving(false);
    }
  }

  const initials = (user.firstName || user.username || "U").slice(0, 1).toUpperCase();
  return (
    <>
      <SettingsSection title="Аккаунт" description="Профиль и данные вашего аккаунта.">
        <div className="settings-account-summary">
          <div className="settings-account-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials}</div>
          <div><strong>{user.firstName || "Пользователь"}</strong><span>@{user.username}</span></div>
        </div>
        <form className="settings-form" onSubmit={saveProfile}>
          <Field label="Имя" value={profile.firstName} required onChange={(value) => setProfile({ ...profile, firstName: value })} />
          <Field label="Фамилия" value={profile.lastName} onChange={(value) => setProfile({ ...profile, lastName: value })} />
          <Field label="О себе" value={profile.bio} multiline onChange={(value) => setProfile({ ...profile, bio: value })} />
          <button className="settings-primary-button" disabled={saving || !profile.firstName.trim()}>Сохранить профиль</button>
        </form>
      </SettingsSection>
      <SettingsSection title="Пароль" description="После изменения остальные устройства останутся авторизованы.">
        <form className="settings-form" onSubmit={changePassword}>
          <Field label="Текущий пароль" type="password" value={currentPassword} required onChange={setCurrentPassword} />
          <Field label="Новый пароль" type="password" value={newPassword} required onChange={setNewPassword} />
          <button className="settings-primary-button" disabled={saving}>Изменить пароль</button>
        </form>
      </SettingsSection>
      <SettingsSection title="Двухфакторная защита" description={twoFAEnabled ? "Защита включена" : "Защита отключена"}>
        <div className="settings-inline-action">
          <input type="password" value={twoFAPassword} onChange={(event) => setTwoFAPassword(event.target.value)} placeholder="Пароль 2FA" />
          <button className="settings-secondary-button" disabled={saving} onClick={toggleTwoFA}>{twoFAEnabled ? "Отключить" : "Включить"}</button>
        </div>
      </SettingsSection>
      <SettingsSection title="Активные сессии" description="Сессии входа, зарегистрированные сервером.">
        <div className="settings-session-list">{sessions.length ? sessions.map((session) => <div className="settings-session" key={session.id}><strong>{session.deviceName || "Устройство"}</strong><span>{session.deviceType || "unknown"} · {formatDate(session.lastActive)}</span></div>) : <span className="settings-muted">Активных сессий в списке нет</span>}</div>
        <button className="settings-danger-button" onClick={() => onLogout(true)}>Завершить все сессии</button>
      </SettingsSection>
      <button className="settings-danger-button settings-logout-button" onClick={() => onLogout(false)}>Выйти из аккаунта</button>
    </>
  );
}

function SettingsSection({ title, description, children }) {
  return <section className="settings-detail-section"><header><h1>{title}</h1><p>{description}</p></header><div className="settings-detail-card">{children}</div></section>;
}

function Field({ label, multiline = false, onChange, type = "text", value, ...props }) {
  const Tag = multiline ? "textarea" : "input";
  return <label className="settings-field"><span>{label}</span><Tag type={multiline ? undefined : type} value={value} onChange={(event) => onChange(event.target.value)} rows={multiline ? 3 : undefined} {...props} /></label>;
}

function ToggleRow({ label, value, onChange }) {
  return <div className="settings-control-row"><span>{label}</span><button type="button" aria-pressed={value} className={`settings-toggle-switch ${value ? "is-active" : ""}`} onClick={() => onChange(!value)}><span className="settings-toggle-knob" /></button></div>;
}

function ChoiceRow({ label, value, options, onChange }) {
  const detailsRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!detailsRef.current?.contains(event.target)) {
        detailsRef.current?.removeAttribute("open");
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function selectOption(nextValue) {
    onChange(nextValue);
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <div className="settings-control-row">
      <span>{label}</span>
      <details className="settings-choice" ref={detailsRef}>
        <summary>
          <span>{selected?.label}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="settings-choice-menu">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={option.value === value ? "active" : ""}
              onClick={() => selectOption(option.value)}
            >
              <span className="settings-choice-check">{option.value === value ? "✓" : ""}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

async function downloadExport(showToast) {
  try {
    const data = await services.userService.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "craneapp-data.json";
    link.click();
    URL.revokeObjectURL(url);
  } catch (_) {
    showToast("error", "Не удалось экспортировать данные", "⚠️");
  }
}

function formatDate(value) {
  if (!value) return "нет данных";
  return new Date(value).toLocaleString();
}
