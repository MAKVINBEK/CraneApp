import { REACT_ROUTES } from "@/consts";
import { clearAuthSession } from "@/utils";
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

export function AuthGuard() {
  const navigate = useNavigate();

  useEffect(() => {
    function handleUnauthorized() {
      clearAuthSession();
      navigate(REACT_ROUTES.LOGIN, { replace: true });
    }
    window.addEventListener("craneapp:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("craneapp:unauthorized", handleUnauthorized);
  }, [navigate]);

  return <Outlet />;
}
