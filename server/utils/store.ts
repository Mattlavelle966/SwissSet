import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type UserRecord = {
  id: string
  name: string
  email: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
}

export type SessionRecord = {
  token: string
  userId: string
  createdAt: string
  expiresAt: string
}

export type StatusMetrics = {
  dnsMs: number | null
  connectMs: number | null
  tlsMs: number | null
  ttfbMs: number | null
  domReadyMs: number | null
  loadMs: number | null
  transferSize: number | null
}

export type StatusRecord = {
  id: string
  userId: string
  url: string
  checkedAt: string
  statusCode: number | null
  ok: boolean
  down: boolean
  slow: boolean
  durationMs: number
  title: string
  issues: string[]
  metrics: StatusMetrics
}

export type LinkClickRecord = {
  id: string
  clickedAt: string
  referrer: string
  userAgent: string
  ipHash: string
}

export type RedirectLinkRecord = {
  id: string
  userId: string
  slug: string
  label: string
  targetUrl: string
  createdAt: string
  updatedAt: string
  clicks: LinkClickRecord[]
}

export type AppStore = {
  version: 1
  users: UserRecord[]
  sessions: SessionRecord[]
  statusChecks: StatusRecord[]
  links: RedirectLinkRecord[]
}

const storePath = join(process.cwd(), '.data', 'swissset.json')
let writeQueue: Promise<unknown> = Promise.resolve()

function emptyStore(): AppStore {
  return {
    version: 1,
    users: [],
    sessions: [],
    statusChecks: [],
    links: []
  }
}

function normalizeStore(value: Partial<AppStore> | null | undefined): AppStore {
  const empty = emptyStore()
  return {
    version: 1,
    users: Array.isArray(value?.users) ? value.users : empty.users,
    sessions: Array.isArray(value?.sessions) ? value.sessions : empty.sessions,
    statusChecks: Array.isArray(value?.statusChecks)
      ? value.statusChecks
      : empty.statusChecks,
    links: Array.isArray(value?.links) ? value.links : empty.links
  }
}

export async function readStore(): Promise<AppStore> {
  try {
    const raw = await readFile(storePath, 'utf8')
    return normalizeStore(JSON.parse(raw))
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return emptyStore()
    }
    throw error
  }
}

export async function writeStore(data: AppStore) {
  await mkdir(dirname(storePath), { recursive: true })
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await rename(tempPath, storePath)
}

export async function updateStore<T>(
  mutator: (data: AppStore) => Promise<T> | T
): Promise<T> {
  const run = async () => {
    const data = await readStore()
    const result = await mutator(data)
    await writeStore(data)
    return result
  }

  const next = writeQueue.then(run, run)
  writeQueue = next.then(
    () => undefined,
    () => undefined
  )
  return next
}
