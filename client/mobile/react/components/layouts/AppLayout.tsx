import { ROUTES } from "@/consts";
import { useIsMobile } from "@/hooks";
import { cn } from "@/utils";
import {
  NavLink,
  Outlet,
  useLocation,
  useParams
} from "react-router-dom";

const MenuIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const ChatsIcon = () => {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
};

const ChannelsIcon = () => {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
};

const CommunitiesIcon = () => {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
};

const MeetingsIcon = () => {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
};

const SettingsIcon = () => {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />

    </svg>
  );
};

const navItems = [
  { key: "chats", label: "Чаты", path: ROUTES.CHATS, Icon: ChatsIcon },
  {
    key: "channels",
    label: "Каналы",
    path: ROUTES.CHANNELS,
    Icon: ChannelsIcon,
  },
  {
    key: "communities",
    label: "Сообщества",
    path: ROUTES.COMMUNITIES,
    Icon: CommunitiesIcon,
  },
  {
    key: "meetings",
    label: "Встречи",
    path: ROUTES.MEETINGS,
    Icon: MeetingsIcon,
  },
];

export function AppLayout() {
  const { pathname } = useLocation();
  const { chatId } = useParams();
  const isMobile = useIsMobile();

  return (
    <>
      {isMobile && (
        <div className="mobile-layout">
          <div className="mobile-content">
            <Outlet />
          </div>
          {!chatId && (
            <div className="nav-rail mobile-nav-rail">
              {/* Чаты */}
              {navItems.map(({ Icon, key, label, path }) => (
                <NavLink
                  key={key}
                  to={path}
                  className={cn(
                    "rail-tab",
                    pathname.includes(path) && "active",
                  )}
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}
      {!isMobile && (
        <div className="app-layout">
          <div className="nav-rail">
            <NavLink
              className="rail-burger"
              to={ROUTES.MENU}
              data-tip="Меню"
            >
              <MenuIcon />
            </NavLink>

            {navItems.map(({ Icon, key, label, path }) => (
              <NavLink
                key={key}
                to={path}
                className={cn("rail-tab", pathname.includes(path) && "active")}
                data-tip={label}
              >
                <Icon />
              </NavLink>
            ))}

            <div className="rail-spacer"></div>

            <NavLink
              className="rail-help"
              to={ROUTES.SETTINGS}
              data-tip="Настройки"
            >
              <SettingsIcon />
            </NavLink>
          </div>
          <div className="app-main-content">
            <Outlet />
          </div>
        </div>
      )}
    </>
  );
}
