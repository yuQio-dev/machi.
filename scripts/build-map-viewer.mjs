import { build } from 'vite';
import { fileURLToPath } from 'node:url';
await build({configFile:false,define:{"process.env.NODE_ENV":JSON.stringify("production")},build:{outDir:fileURLToPath(new URL('../dist/builder/sketch/viewer/',import.meta.url)),emptyOutDir:true,assetsInlineLimit:Infinity,lib:{entry:fileURLToPath(new URL('../src/builder/Viewer.tsx',import.meta.url)),name:'MachiViewer',formats:['iife'],fileName:()=> 'viewer.js',cssFileName:'viewer'},rollupOptions:{output:{inlineDynamicImports:true}}}});
