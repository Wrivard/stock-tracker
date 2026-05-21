import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// Tiny startup logger. Writes to userData/startup.log (one fresh file per
// boot) so we can post-mortem a crash that happens before the window can
// even show its own UI.

let logFile: string | null = null
let buffered: string[] = []

export function initStartupLog(): void {
  try {
    const userData = app.getPath('userData')
    fs.mkdirSync(userData, { recursive: true })
    logFile = path.join(userData, 'startup.log')
    fs.writeFileSync(
      logFile,
      `=== ${new Date().toISOString()} ${app.getName()} ${app.getVersion()} ===\n`,
    )
    if (buffered.length > 0) {
      fs.appendFileSync(logFile, buffered.join(''))
      buffered = []
    }
  } catch (err) {
    // If we can't write, that's the first useful clue.
    console.error('[logger] init failed:', err)
  }
}

export function log(stage: string, extra?: unknown): void {
  const time = new Date().toISOString()
  let suffix = ''
  if (extra !== undefined) {
    if (extra instanceof Error) {
      suffix = `: ${extra.message}\n${extra.stack ?? ''}`
    } else {
      try {
        suffix = `: ${JSON.stringify(extra)}`
      } catch {
        suffix = `: ${String(extra)}`
      }
    }
  }
  const line = `[${time}] ${stage}${suffix}\n`
  // Always echo to stdout so dev terminal sees it.
  console.log(line.trimEnd())
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line)
    } catch {
      // ignore
    }
  } else {
    buffered.push(line)
  }
}
