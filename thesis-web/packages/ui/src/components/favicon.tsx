import { Link, Meta } from "@solidjs/meta"

export const Favicon = () => {
  return (
    <>
      <Link rel="icon" type="image/png" href="/favicon-mcd-96.png" sizes="96x96" />
      <Link rel="shortcut icon" href="/favicon-mcd-32.png" />
      <Link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-mcd.png" />
      <Link rel="manifest" href="/site.webmanifest" />
      <Meta name="apple-mobile-web-app-title" content="论文助手" />
    </>
  )
}
