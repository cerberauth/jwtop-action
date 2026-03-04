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

| Input     | Description                                                                                                                                 | Required | Default  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| `version` | Version of jwtop to install (e.g. `v0.2.0`). Use `latest` to always install the newest.                                                     | No       | `latest` |
| `command` | jwtop subcommand to run: `decode`, `verify`, `create`, `sign`, `crack`, `exploit`. If omitted, jwtop is only installed and added to `PATH`. | No       |          |
| `args`    | Arguments and flags to pass to the jwtop command.                                                                                           | No       |          |

## Outputs

| Output       | Description                                                          |
| ------------ | -------------------------------------------------------------------- |
| `output`     | Stdout from the jwtop command (only set when `command` is provided). |
| `jwtop-path` | Directory where the jwtop binary is located.                         |

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
