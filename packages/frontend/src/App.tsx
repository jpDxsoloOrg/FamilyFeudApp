import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Display } from "./screens/Display";
import { Host } from "./screens/Host";
import { HostSetup } from "./screens/HostSetup";
import { Join } from "./screens/Join";
import { Play } from "./screens/Play";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Join />} />
        <Route path="/host/:gameId" element={<Host />} />
        <Route path="/host/:gameId/setup" element={<HostSetup />} />
        <Route path="/display/:gameId" element={<Display />} />
        <Route path="/play/:gameId" element={<Play />} />
      </Routes>
    </BrowserRouter>
  );
}
