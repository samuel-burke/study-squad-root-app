# Infrastructure (Discord Activity)

The Root version runs on Root's hosting. The Discord Activity needs its own
server, which runs on AWS and is described in Terraform in `infra/`.

```
Discord client ──HTTPS/WSS──▶ Elastic IP ──▶ EC2 t4g.micro (Graviton, Amazon Linux 2023)
                                              ├─ Caddy: HTTPS certificate, reverse proxy
                                              └─ app container: discord host + one worker per Discord server
                                                  ├─ /data on an encrypted EBS disk ── nightly snapshots (7 days)
                                                  └─ Litestream ── every write ──▶ S3 (versioned, encrypted)
GitHub Actions (main) ──OIDC──▶ ECR (image) + SSM Run Command (deploy)
CloudWatch: logs (30 days), alarms ──▶ SNS email; AWS Budgets ──▶ email
```

## What each piece is for

| File                   | What it makes                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `network.tf`           | A VPC with one public subnet. The security group allows 80 and 443 only. No SSH.                                                        |
| `instance.tf`          | The Graviton box with IMDSv2 only, an encrypted root disk and an Elastic IP.                                                            |
| `storage.tf`           | The data disk (separate from the box, so the box can be replaced), nightly snapshots, the S3 backup bucket, and the ECR image registry. |
| `secrets.tf`           | The Discord secrets as encrypted SSM parameters. Terraform never sees their values.                                                     |
| `iam.tf`               | Least-privilege roles for the box, for snapshots, and for GitHub's deploys (OIDC, `main` only).                                         |
| `monitoring.tf`        | Log group, auto-recover and auto-reboot alarms, CPU credit and error alarms, and a monthly budget alert.                                |
| `host/deploy.sh.tftpl` | The deploy script on the box: pull the image, start it, check `/healthz`, roll back if it fails, and start Caddy.                       |

## Cost

About **$11 a month** in us-east-1: t4g.micro $6.10, its public IPv4 address
$3.65, 12 GB of gp3 disk $1, and cents for snapshots, S3, ECR and CloudWatch
(inside the free allowances at this size). A one-year Compute Savings Plan
brings the box to about $3.90, so about $9 total. New AWS accounts also get
starter credits.

## One-time setup

You need an AWS account, the AWS CLI signed in as an admin user on your own
machine, and Terraform 1.10 or newer (`brew install terraform`).

1. **State bucket** (once). Terraform keeps its state here, with locking:
   ```sh
   aws s3api create-bucket --bucket <unique-name>-tfstate --region us-east-1
   aws s3api put-bucket-versioning --bucket <unique-name>-tfstate --versioning-configuration Status=Enabled
   aws s3api put-public-access-block --bucket <unique-name>-tfstate \
     --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   ```
2. **Apply**:
   ```sh
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # optional: alert_email, domain
   terraform init -backend-config="bucket=<unique-name>-tfstate" -backend-config="region=us-east-1"
   terraform plan
   terraform apply
   ```
   Commit the `.terraform.lock.hcl` that `init` creates.
3. **Secrets**, typed into your own terminal (never into chat or a file in the repo):
   ```sh
   aws ssm put-parameter --overwrite --name /study-squad/DISCORD_CLIENT_ID --type SecureString --value <application id>
   aws ssm put-parameter --overwrite --name /study-squad/DISCORD_CLIENT_SECRET --type SecureString --value <client secret>
   aws ssm put-parameter --overwrite --name /study-squad/DISCORD_BOT_TOKEN --type SecureString --value <bot token>
   ```
   Optional, same as on Root: `FEEDBACK_RELAY_URL`, `FEEDBACK_RELAY_KEY`,
   `SELF_TEST_USER_IDS`. Every parameter under `/study-squad/` becomes an
   environment variable in the app on its next deploy.
4. **GitHub** (repo Settings → Secrets and variables → Actions → Variables),
   from `terraform output`:
   - `AWS_DEPLOY_ROLE_ARN` = `deploy_role_arn`
   - `DISCORD_CLIENT_ID` = the Application ID (public)
   - `AWS_REGION` only if not `us-east-1`

   None of these are secrets; GitHub never holds AWS keys.

5. **Discord**: set the URL Mapping for `/` to `terraform output url` without
   `https://` (docs/DISCORD.md).

Then every push to `main` runs the **Deploy Discord Activity** job: it builds
an arm64 image, pushes it to ECR tagged with the commit, and runs
`study-squad-deploy` on the box through SSM. The Activity reconnects on its
own during the few seconds the app restarts.

The address defaults to `<ip-with-dashes>.sslip.io`, which works with no DNS
setup. For your own domain, point an A record at the Elastic IP, set `domain`
in `terraform.tfvars` and apply (this replaces the box; data is kept).

## Day to day

- **Shell on the box:** `aws ssm start-session --target <instance_id>`.
- **Logs:** CloudWatch → Log groups → `/study-squad/host` (streams `app` and `caddy`),
  or `aws logs tail /study-squad/host --follow`.
- **Redeploy a version:** run `sudo study-squad-deploy <ecr uri>:<commit sha>` in a session.
- **Changing infra:** edit `infra/`, open a PR (CI checks `terraform fmt` and
  `validate`), then `terraform plan` and `terraform apply` from your machine.

## Restoring data

- **Box broken:** `terraform apply -replace=aws_instance.host`. The new box
  mounts the same data disk and redeploys the last good image on first boot.
- **Disk lost or corrupted:** create a volume from last night's snapshot (EC2 →
  Snapshots), or restore one server's database from S3 to the second:
  ```sh
  litestream restore -o study-squad.sqlite3 s3://<backup_bucket>/data/<server id>/study-squad.sqlite3
  ```
  Stop the app first, put the file at `/srv/study-squad/app/<server id>/`, then start it.
