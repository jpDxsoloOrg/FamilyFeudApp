import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Display } from "./screens/Display";
import { Join } from "./screens/Join";
import { Play } from "./screens/Play";

// Lazy so phones and the TV never download the host console or its libraries.
const Host = lazy(() => import("./screens/Host").then((m) => ({ default: m.Host })));
const HostSetup = lazy(() => import("./screens/HostSetup").then((m) => ({ default: m.HostSetup })));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Join />} />
          <Route path="/host/:gameId" element={<Host />} />
          <Route path="/host/:gameId/setup" element={<HostSetup />} />
          <Route path="/display/:gameId" element={<Display />} />
          <Route path="/watch/:gameId" element={<Display />} />
          <Route path="/play/:gameId" element={<Play />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
