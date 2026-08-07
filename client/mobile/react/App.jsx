import { RouterProvider } from "react-router-dom";
import { router } from "./configs/router.js";
import { NotificationManager } from "./components/layouts/NotificationManager.jsx";
import { CallProvider } from "./components/Calls/CallProvider.jsx";
import { CallOverlay } from "./components/Calls/CallOverlay.jsx";
import { ThemeProvider } from "../react/components/Context/ThemeContext.jsx"


export function App() {
  return (
    <>
      <ThemeProvider>
        <CallProvider>
          <CallOverlay />
          <RouterProvider router={router} />
          <NotificationManager />
        </CallProvider>
      </ThemeProvider>
    </>
  );
}
