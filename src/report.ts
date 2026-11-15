import { getInput, setOutput, warning } from '@actions/core'
import {
  appendReportxFlags,
  buildCommentBody,
  isPullRequestEvent,
  parseOutputFlags,
  postScanComment,
  tempReportPath
} from '@cerberauth/gha-reportx'
import { readFile, rm, stat } from 'fs/promises'

const JWTOP_DOCS_URL = 'https://www.cerberauth.com/docs/jwtop/'

export interface ScanReport {
  path: string
  persisted: boolean
  json: boolean
}

export async function prepareReport(
  commandArgs: string[]
): Promise<ScanReport> {
  appendReportxFlags(commandArgs)

  const output = parseOutputFlags(commandArgs)
  if (output.path) {
    await rm(output.path, { force: true })
    return {
      path: output.path,
      persisted: true,
      json: (output.format ?? 'json') === 'json'
    }
  }

  const path = tempReportPath('json')
  commandArgs.push('--output', path, '--output-format', 'json')
  return { path, persisted: false, json: true }
}

export async function reportWritten(report: ScanReport): Promise<boolean> {
  try {
    return (await stat(report.path)).isFile()
  } catch {
    return false
  }
}

export async function publishReport(
  report: ScanReport,
  token: string
): Promise<void> {
  if (report.persisted) {
    setOutput('report-path', report.path)
  }

  try {
    if (getInput('comment') === 'false' || !isPullRequestEvent()) {
      return
    }
    if (!report.json) {
      warning(
        'Skipping PR comment: it needs a JSON report, but output-format is not json'
      )
      return
    }

    const reportJson = await readFile(report.path, 'utf8')
    const body = buildCommentBody(reportJson, {
      toolName: 'jwtop',
      docsUrl: JWTOP_DOCS_URL,
      scanId: getInput('scan-id') || undefined
    })
    await postScanComment(token, body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warning(`Skipping PR comment, the jwtop report is unavailable: ${message}`)
  } finally {
    if (!report.persisted) {
      await rm(report.path, { force: true }).catch(() => {})
    }
  }
}
