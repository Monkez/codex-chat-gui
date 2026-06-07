import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    lib: {
      entry: "src/module/index.ts",
      name: "CodexChatGui",
      fileName: "codex-chat-gui",
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
        },
      },
    },
  },
})
