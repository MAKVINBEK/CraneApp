import { RouterProvider } from "react-router-dom";
import { router } from "./configs/router.js";
import { NotificationManager } from "./components/layouts/NotificationManager.jsx";
import { CallProvider } from "./components/Calls/CallProvider.jsx";
import { CallOverlay } from "./components/Calls/CallOverlay.jsx";

export function App() {
  return (
    <>
      <CallProvider>
        <CallOverlay />
        <RouterProvider router={router} />
        <NotificationManager />
      </CallProvider>
    </>
  );
}
