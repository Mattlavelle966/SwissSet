import { createError } from 'h3'

export function normalizeHttpUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: 'URL is required' })
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const parsed = new URL(withProtocol)

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only http and https URLs are supported'
    })
  }

  parsed.hash = ''
  return parsed.toString()
}

export function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
