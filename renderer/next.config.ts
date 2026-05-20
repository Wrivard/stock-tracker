import path from 'node:path'
import { NextConfig } from 'next'

const config: NextConfig = {
  output: 'export',
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    // Ancrer la racine Turbopack au dossier renderer pour eviter l'ambiguite
    // detectee lorsqu'un package-lock.json existe plus haut dans l'arborescence.
    root: path.resolve(import.meta.dirname),
  },
}

export default config
