import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    open: true,
    allowedHosts: ['.loca.lt'],
    proxy: {
      // 百度百科代理 - 解决跨域问题
      '/baike-proxy': {
        target: 'https://baike.baidu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/baike-proxy/, ''),
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    }
  },
  preview: {
    port: 4173,
    allowedHosts: ['.loca.lt']
  }
})
