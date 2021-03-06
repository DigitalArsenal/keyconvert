import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import nodePolyfills from "rollup-plugin-polyfill-node";

export default {
  input: "src/keyconvert.ts",
  output: {
    dir: "build",
    format: "esm"
  },
  plugins: [
    nodePolyfills({ include: ["buffer", "crypto", "stream", "fs", "path", "os"] }),
    typescript({
      module: "esnext"
    }),
    commonjs(),
    json(),
    resolve({ preferBuiltins: true })
  ]
};
