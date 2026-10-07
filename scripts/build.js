// 前端构建：把 src/app.js 与其依赖的 shared/geometry.js 打包为单个 ESM。
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/app.js"],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  outfile: "web/dist/app.js",
  logLevel: "info"
});
