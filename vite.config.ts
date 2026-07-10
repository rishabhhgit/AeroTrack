import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const airportDbToken = env.VITE_AIRPORTDB_TOKEN || '';

  return {
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          // svgr options
        },
      }),
    ],
    server: {
      proxy: {
        '/oskyapi': {
          target: 'https://opensky-network.org/api',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/oskyapi/, ''),
          secure: false,
        },
        '/oskytokenapi': {
          target: `http://localhost:${process.env.PROXY_PORT || '3001'}`,
          changeOrigin: true,
          secure: false
        },
        '/airportdbapi': {
          target: 'https://airportdb.io/api/v1',
          changeOrigin: true,
          rewrite: (path) => {
            const newPath = path.replace(/^\/airportdbapi/, '');
            const separator = newPath.includes('?') ? '&' : '?';
            return `${newPath}${separator}apiToken=${airportDbToken}`;
          },
          secure: false,
        }
      },
    },
    build: {
      chunkSizeWarningLimit: 2100
    },
  }
})
