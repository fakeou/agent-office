import { Navigate } from "react-router-dom";
import { hasValidJwt } from "../lib/jwt";
import { useAuthStore } from "../store/auth";

export function RootRedirect() {
  const token = useAuthStore((state) => state.token);
  return <Navigate to={hasValidJwt(token) ? "/dashboard" : "/auth"} replace />;
}
