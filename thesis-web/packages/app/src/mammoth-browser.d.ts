// [论文助手定制] mammoth 浏览器构建的类型声明：mammoth/mammoth.browser 是 UMD/CJS 打包产物，
// 复用 mammoth 主入口的类型定义（convertToHtml 等）。
declare module "mammoth/mammoth.browser" {
  import mammoth = require("mammoth")
  export = mammoth
}
