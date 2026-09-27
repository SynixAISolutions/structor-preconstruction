// Lets check scripts import lib/*.ts modules that import each other without extensions
// ("./csi"), the way Next resolves them. Register before importing lib code:
//   import { register } from "node:module";
//   register("./ts-resolver.mjs", import.meta.url);
//   const lib = await import("../lib/budget.ts");
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" && /^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw error;
  }
}
