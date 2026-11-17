import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite + Vitest configuration for Community Water Point Tracker
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "node",   // Login.test.jsx uses no DOM — pure logic tests
    globals: true
  }
});
