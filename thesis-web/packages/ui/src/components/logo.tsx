import { type ComponentProps } from "solid-js"

// [论文助手定制] 平台统一标识：红底黄色 M（与 public/favicon-mcd.svg 一致），
// 抹除 opencode 原始 logo。以后换品牌时替换这里 + public/ 下的图标文件即可。
const M_PATH =
  "m195.8 17.933c23.3 0 42.2 98.3 42.2 219.7h34c0-130.7-34.3-236.5-76.3-236.5-24 0-45.2 31.7-59.2 81.5-14-49.8-35.2-81.5-59-81.5-42 0-76.2 105.7-76.2 236.4h34c0-121.4 18.7-219.6 42-219.6s42.2 90.8 42.2 202.8h33.8c0-112 19-202.8 42.3-202.8"

const MarkGlyph = () => (
  <>
    <rect width="100" height="100" rx="9" fill="#DA0007" />
    <path
      fill="#FFBC0C"
      d={M_PATH}
      transform="translate(50 50) scale(0.308 0.255) translate(-136.35 -127.72)"
    />
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
      <MarkGlyph />
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
      <MarkGlyph />
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
      <g transform="translate(0 0)">
        <rect width="42" height="42" rx="4" fill="#DA0007" />
        <path
          fill="#FFBC0C"
          d={M_PATH}
          transform="translate(21 21) scale(0.165 0.178) translate(-136.35 -127.72)"
        />
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
