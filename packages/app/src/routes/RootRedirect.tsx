import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function RootRedirect() {
  const token = useAuthStore((state) => state.token);
  return <Navigate to={token ? "/dashboard" : "/auth"} replace />;
}
