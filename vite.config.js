import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// "base" doit correspondre au nom de ton dépôt GitHub pour un site de type
// https://<utilisateur>.github.io/<depot>/  — on ajustera cette valeur
// ensemble à l'étape de la publication.
export default defineConfig({
	base: '/matube/',
  plugins: [react()],
  base: "/matube/",
});
