# JWTop Action

[![Join Discord](https://img.shields.io/discord/1242773130137833493?label=Discord&style=for-the-badge)](https://www.cerberauth.com/community)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/cerberauth/jwtop-action/ci.yml?branch=main&label=core%20build&style=for-the-badge)](https://github.com/cerberauth/jwtop-action/actions/workflows/ci.yml)
![Latest version](https://img.shields.io/github/v/release/cerberauth/jwtop?sort=semver&style=for-the-badge)
[![Github Repo Stars](https://img.shields.io/github/stars/cerberauth/jwtop?style=for-the-badge)](https://github.com/cerberauth/jwtop)
![License](https://img.shields.io/github/license/cerberauth/jwtop?style=for-the-badge)

GitHub Action to install and run [jwtop](https://github.com/cerberauth/jwtop) —
the JWT operations toolkit for decoding, verifying, creating, signing, cracking,
and exploiting JSON Web Tokens.

## Usage

```yaml
steps:
  - name: Decode JWT
    id: decode
    uses: cerberauth/jwtop-action@v1
    with:
      command: decode
      args: '${{ env.JWT_TOKEN }}'

  - name: Print output
    run: echo "${{ steps.decode.outputs.output }}"
```

### Security testing with crack

```yaml
steps:
  - name: Probe JWT endpoint for vulnerabilities
    uses: cerberauth/jwtop-action@v1
    with:
      command: crack
      args: --url https://api.example.com/protected --wordlist ./wordlist.txt
```

## Inputs

| Input               | Description                                                                                                                                                                                            | Required | Default  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- |
| `version`           | Version of jwtop to install (e.g. `v0.2.0`). Use `latest` to always install the newest.                                                                                                                | No       | `latest` |
| `command`           | jwtop subcommand to run: `decode`, `verify`, `create`, `sign`, `crack`, `exploit`. If omitted, jwtop is only installed and added to `PATH`.                                                            | No       |          |
| `args`              | Arguments and flags to pass to the jwtop command.                                                                                                                                                      | No       |          |
| `comment`           | For pull request runs of a command that supports it (currently `crack`), post/update a PR comment with the scan results. Requires the token to have `pull-requests: write` permission.                 | No       | `true`   |
| `output-format`     | For commands that support it (currently `crack`), write the full report to a file in `json`, `yaml`, `jsonl`, `sarif`, `markdown`, `html`, or `terminal`. Path is exposed as the `report-path` output. | No       |          |
| `output-path`       | File path for `output-format`. Defaults to a generated path under `RUNNER_TEMP`.                                                                                                                       | No       |          |
| `report-url`        | For commands that support it (currently `crack`), HTTP endpoint to POST the full report to.                                                                                                            | No       |          |
| `report-format`     | Format for `report-url`: `json`, `yaml`, `jsonl`, `sarif`, `markdown`, `html`.                                                                                                                         | No       |          |
| `report-headers`    | Extra HTTP headers for `report-url`, one `Key: Value` (or `Key=Value`) pair per line.                                                                                                                  | No       |          |
| `show-all-findings` | For commands that support it (currently `crack`), show every finding on the terminal, not just vulnerable ones. Files/`report-url` always get every finding regardless.                                | No       | `false`  |
| `no-color`          | Disable ANSI colors in terminal output.                                                                                                                                                                | No       | `false`  |
| `quiet`             | Suppress terminal display of the report.                                                                                                                                                               | No       | `false`  |

## Outputs

| Output        | Description                                                                               |
| ------------- | ----------------------------------------------------------------------------------------- |
| `output`      | Stdout from the jwtop command (only set when `command` is provided).                      |
| `report-path` | Path to the full report file, when `output-format`/`output-path` was set (or via `args`). |
| `jwtop-path`  | Directory where the jwtop binary is located.                                              |

## Commands

| Command   | Description                                             |
| --------- | ------------------------------------------------------- |
| `decode`  | Parse and display a JWT without verifying the signature |
| `verify`  | Validate a JWT signature and display its claims         |
| `create`  | Generate and sign a new token                           |
| `sign`    | Re-sign an existing token with different credentials    |
| `crack`   | Probe a server for common JWT vulnerabilities           |
| `exploit` | Apply a specific attack technique to a token            |

## Examples

### Verify a token with an HMAC secret

```yaml
- uses: cerberauth/jwtop-action@v1
  with:
    command: verify
    args: '${{ env.JWT_TOKEN }} --secret ${{ secrets.JWT_SECRET }}'
```

### Verify a token with a RSA public key

```yaml
- uses: cerberauth/jwtop-action@v1
  with:
    command: verify
    args: '${{ env.JWT_TOKEN }} --key ./public.pem'
```

### Comment scan results on a pull request

When the workflow is triggered by a pull request and `command: crack` is used,
the action posts (or updates, on subsequent pushes) a PR comment with the full
scan report, formatted as markdown — every finding, including checks that
passed, not just vulnerable ones. The terminal log keeps showing the usual
summary of vulnerable findings. This requires the token to have
`pull-requests: write` permission; without it, the step logs a warning and
continues rather than failing the run.

```yaml
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  jwt-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: cerberauth/jwtop-action@v1
        with:
          command: crack
          args:
            '--url https://api.example.com/protected --wordlist ./wordlist.txt'
```

Set `comment: false` to disable this behavior.

### Upload a SARIF report to code scanning

```yaml
- uses: cerberauth/jwtop-action@v1
  id: crack
  with:
    command: crack
    args: --url https://api.example.com/protected --wordlist ./wordlist.txt
    output-format: sarif

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ${{ steps.crack.outputs.report-path }}
```

### Send the report to an external endpoint

```yaml
- uses: cerberauth/jwtop-action@v1
  with:
    command: crack
    args: --url https://api.example.com/protected --wordlist ./wordlist.txt
    report-url: https://reports.example.com/ingest
    report-format: json
    report-headers: |
      Authorization: Bearer ${{ secrets.REPORTS_TOKEN }}
```

### Pin a specific version

```yaml
- uses: cerberauth/jwtop-action@v1
  with:
    version: v0.2.0
    command: decode
    args: '${{ env.JWT_TOKEN }}'
```

## Disclaimer

`crack` and `exploit` commands are provided for informational purposes only. It
should not be used for malicious purposes or to attack any system without proper
authorization. Always respect the security and privacy of others.

## Telemetry

VulnAPI collects fully anonymized usage data to help improve the tool. This data
is not shared with third parties. You can opt-out of telemetry by setting the
`telemetry` option to `false`.

## License

This repository is licensed under the
[MIT License](https://github.com/cerberauth/vulnapi-action/blob/main/LICENSE) @
[CerberAuth](https://www.cerberauth.com/).
