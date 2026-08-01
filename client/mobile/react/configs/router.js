import { createBrowserRouter, redirect } from "react-router-dom";
import { AuthGuard } from "../components/guards/AuthGuard";
import { AppLayout } from "../components/layouts/AppLayout.jsx";
import { REACT_ROUTES } from "../consts/routes";
import { STORAGE_KEYS } from "../consts/storageKeys.js";
import { clearAuthSession } from "../utils/clearAuthSession.js";
import { RouteLoadingFallback } from "../components/ui/RouteLoadingFallback.jsx";
import services from "../services/serviceContainer.js";

async function requireSession({ request }) {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (!token) {
    const from = new URL(request.url).pathname;
    throw redirect(`${REACT_ROUTES.LOGIN}?from=${encodeURIComponent(from)}`);
  }

  try {
    await services.userService.getMe();
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    clearAuthSession();
    throw redirect(REACT_ROUTES.LOGIN);
  }

  return null;
}

function redirectIfAuthed() {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (token) throw redirect(REACT_ROUTES.CHATS);
  return null;
}

function redirectHome() {
  return redirect(
    localStorage.getItem(STORAGE_KEYS.TOKEN)
      ? REACT_ROUTES.CHATS
      : REACT_ROUTES.LOGIN,
  );
}

export const router = createBrowserRouter([
  {
    children: [
      {
        index: true,
        loader: redirectHome,
      },
      {
        path: REACT_ROUTES.LOGIN,
        loader: redirectIfAuthed,
        lazy: () =>
          import("../pages/LoginPage/LoginPage.jsx").then((m) => ({
            Component: m.LoginPage,
          })),
      },
      {
        path: REACT_ROUTES.REGISTER,
        loader: redirectIfAuthed,
        lazy: () =>
          import("../pages/RegisterPage/RegisterPage.jsx").then((m) => ({
            Component: m.RegisterPage,
          })),
      },
      {
        Component: AuthGuard,
        loader: requireSession,
        HydrateFallback: RouteLoadingFallback,
        shouldRevalidate: () => false,
        children: [
          {
            Component: AppLayout,
            HydrateFallback: RouteLoadingFallback,
            children: [
              {
                path: REACT_ROUTES.CHATS,
                lazy: () =>
                  import("../pages/ChatsPage/ChatsPage.jsx").then((m) => ({
                    Component: m.ChatsPage,
                  })),
                children: [
                  {
                    index: true,
                    lazy: () =>
                      import("../components/components/EmptyChatPlaceholder.jsx").then(
                        (m) => ({
                          Component: m.EmptyChatPlaceholder,
                        }),
                      ),
                  },
                  {
                    path: REACT_ROUTES.CHAT_BY_ID,
                    lazy: () =>
                      import("../pages/ChatPage/ChatThreadPage.jsx").then(
                        (m) => ({ Component: m.ChatThreadPage }),
                      ),
                  },
                ],
              },
              {
                path: REACT_ROUTES.CONTACTS,
                lazy: () =>
                  import("../pages/ContactsPage/ContactsPage.jsx").then(
                    (m) => ({
                      Component: m.ContactsPage,
                    }),
                  ),
              },
              {
                path: REACT_ROUTES.SETTINGS,
                lazy: () =>
                  import("../pages/SettingsPage/SettingsPage.jsx").then(
                    (m) => ({
                      Component: m.SettingsPage,
                    }),
                  ),
              },
              {
                path: REACT_ROUTES.CREATE_GROUP,
                lazy: () =>
                  import("../pages/CreateGroupChatPage/CreateGroupPage.jsx").then(
                    (m) => ({
                      Component: m.CreateGroupPage,
                    }),
                  ),
              },
            ],
          },
          {
            path: "*",
            loader: () => redirect(REACT_ROUTES.HOME),
          },
        ],
      },
    ],
  },
]);
