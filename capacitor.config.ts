import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.leo2026002.licencias",
  appName: "Panel de Licencias",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { backgroundColor: "#0F172A", allowMixedContent: false },
};
export default config;
