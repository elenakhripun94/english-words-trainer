export function buildStudentLink(token: string): string {
  const url = new URL(window.location.href)
  url.hash = `#/s/${token}`
  url.search = ''
  return url.toString()
}
