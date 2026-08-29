import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/')
          if (moduleId.includes('/node_modules/@element-plus/icons-vue/')) return 'element-plus-icons'
          if (moduleId.includes('/node_modules/element-plus/')) return 'element-plus'
          if (moduleId.includes('/node_modules/axios/')) return 'http-vendor'
          if (
            moduleId.includes('/node_modules/vue/') ||
            moduleId.includes('/node_modules/vue-router/') ||
            moduleId.includes('/node_modules/pinia/') ||
            moduleId.includes('/node_modules/@vue/')
          ) {
            return 'vue-vendor'
          }
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/preview': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
