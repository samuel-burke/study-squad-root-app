# 0008. Deploys use GitHub OIDC and SSM, with no SSH or stored keys

**Status:** Accepted, 2026-11-13

## Context

Every push to `main` should deploy, like the Root upload. The usual shortcuts
are an SSH key or long-lived AWS keys stored in GitHub, both of which leak.

## Decision

- GitHub Actions gets short-lived AWS credentials through OIDC. The deploy
  role trusts only this repo's `main` branch and can only push to the one
  ECR repository and run a command on the one box.
- The box has no SSH port. The deploy runs `study-squad-deploy <image>`
  through SSM Run Command; admins get a shell through SSM Session Manager.
- The deploy script health-checks the new image and puts the last good one
  back if it fails.
- Discord secrets live in SSM Parameter Store as SecureStrings. Terraform
  creates them with a placeholder and ignores their values, so real secrets
  never reach Terraform state, the repo or CI.
- Terraform is applied by hand from a trusted machine. CI only checks
  formatting and validity, so it never holds admin access.

## Consequences

- Nothing secret is stored in GitHub; the variables it holds are ids.
- Every deploy is logged in CloudTrail and SSM.
- Infra changes need a person to run `terraform apply`.
