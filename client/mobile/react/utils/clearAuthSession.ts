import { disconnectRealtimeSocket } from "@/hooks";
import { useProfileStore } from "@/store";

export function clearAuthSession() {
  disconnectRealtimeSocket();
  useProfileStore.getState().clearProfile()
}