import { useEffect } from "react";
import { ensureCompany } from "./db";
import { purgeTrash } from "./store";
import { UiProvider, useRoute } from "./ui";
import { Home, Projects } from "./screens/Home";
import { ProjectForm } from "./screens/ProjectForm";
import { ProjectDetail } from "./screens/ProjectDetail";
import { Camera } from "./screens/Camera";
import { Ledger } from "./screens/Ledger";
import { Settings } from "./screens/Settings";

function Routes() {
  const r = useRoute();
  useEffect(() => { window.scrollTo(0, 0); }, [r.join("/")]);
  if (r[0] === "projects") return <Projects />;
  if (r[0] === "new") return <ProjectForm />;
  if (r[0] === "settings") return <Settings />;
  if (r[0] === "p" && r[1]) {
    if (r[2] === "camera") return <Camera id={r[1]} />;
    if (r[2] === "ledger") return <Ledger id={r[1]} />;
    if (r[2] === "edit") return <ProjectForm id={r[1]} />;
    return <ProjectDetail id={r[1]} />;
  }
  return <Home />;
}

export default function App() {
  useEffect(() => {
    ensureCompany();
    purgeTrash();
  }, []);
  return (
    <UiProvider>
      <Routes />
    </UiProvider>
  );
}
