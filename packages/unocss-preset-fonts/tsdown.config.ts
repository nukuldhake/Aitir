import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@proj-sakura/font-cjkfonts-allseto',
    '@proj-sakura/font-departure-mono',
    '@proj-sakura/font-xiaolai',
  ],
  dts: true,
  sourcemap: true,
})

