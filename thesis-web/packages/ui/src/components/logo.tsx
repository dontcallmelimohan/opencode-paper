import { type ComponentProps } from "solid-js"

// [论文助手定制] 平台统一标识：蓝色渐变菱形 + 白色 Z + 青色点（与 public/favicon-mcd.svg / z.svg 一致）。
// 以后换品牌时替换这里 + public/ 下的图标文件即可。
const Z_DIAMOND = "M82.5 0L165 47.3L165 150.7L82.5 198L0 150.7L0 47.3L82.5 0Z"
const Z_LETTER = "M0 0L88 0L88 16.5L22 77L88 77L88 93.5L0 93.5L0 77L66 16.5L0 16.5L0 0Z"

const MarkGlyph = (props: { gradientID: string }) => (
  <>
    <defs>
      <linearGradient
        id={props.gradientID}
        gradientTransform="matrix(165 198 -198 165 0 0)"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
      >
        <stop offset="0" stop-color="#0A1E3F" />
        <stop offset="1" stop-color="#1565C0" />
      </linearGradient>
    </defs>
    <path fill={`url(#${props.gradientID})`} transform="matrix(1 0 0 1 27.5 11)" d={Z_DIAMOND} />
    <g opacity="0.35">
      <path fill="#0A1E3F" transform="matrix(1 0 0 1 70.4 75.9)" d={Z_LETTER} />
    </g>
    <path fill="#FFF" transform="matrix(1 0 0 1 66 71.5)" d={Z_LETTER} />
    <ellipse fill="#00BCD4" transform="matrix(1 0 0 1 105.6 34.1)" cx="4.4" cy="4.4" rx="4.4" ry="4.4" />
  </>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="scale(0.4545 0.4545)">
        <MarkGlyph gradientID="thesis-mark-gradient" />
      </g>
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="scale(0.4545 0.4545)">
        <MarkGlyph gradientID="thesis-splash-gradient" />
      </g>
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g transform="translate(0 0) scale(0.19 0.19)">
        <MarkGlyph gradientID="thesis-logo-gradient" />
      </g>
      <text
        x="52"
        y="29"
        font-size="23"
        font-weight="600"
        font-family="system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
        fill="var(--icon-strong-base)"
      >
        论文助手
      </text>
    </svg>
  )
}
