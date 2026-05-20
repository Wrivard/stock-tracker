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
    // Ancrer Turbopack a la racine du projet Nextron (ou vivent node_modules
    // et package.json). Sans ca, Turbopack remonte au home Windows et choisit
    // le mauvais package-lock.json.
    root: path.resolve(import.meta.dirname, '..'),
  },
}

export default config
