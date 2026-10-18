export {};
const result = await Bun.build({entrypoints:["ui/app.ts"],outdir:"dist",target:"browser",minify:true,sourcemap:"none"});
if (!result.success) { console.error(result.logs); process.exit(1); }
