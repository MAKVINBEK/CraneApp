import { REACT_ROUTES } from "@/consts";
import { services } from "@/services";
import { useProfileStore } from "@/store";
import { clearAuthSession } from "@/utils";
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

// Проверка сессии — один раз при монтировании, не на каждый переход по роутам
// (бэк уже делает silent refresh реактивно). Истёкшая сессия ловится отдельно,
// событием 'craneapp:unauthorized'.
const publicRoutes = [REACT_ROUTES.LOGIN, REACT_ROUTES.REGISTER];

export function AuthGuard() {
  const navigate = useNavigate();
  const token = useProfileStore((state) => state.token);
  const setUser = useProfileStore((state) => state.setUser);

  useEffect(() => {
    function handleUnauthorized() {
      clearAuthSession();
      navigate(REACT_ROUTES.LOGIN, { replace: true });
    }
    window.addEventListener("craneapp:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("craneapp:unauthorized", handleUnauthorized);
  }, [navigate]);

  useEffect(() => {
    // намеренно window.location, а не useLocation() — нужен только путь на момент маунта
    const isPublicRoute = publicRoutes.includes(window.location.pathname);
    if (!token || isPublicRoute) return;

    let cancelled = false;
    const user = services.userService.getMe().catch(() => {
      if (cancelled) return;
      clearAuthSession();
      navigate(REACT_ROUTES.LOGIN, { replace: true });
    });

    setUser(user)

    return () => {
      cancelled = true;
    };
  }, []);

  return <Outlet />;
}
