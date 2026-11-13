# The host's secrets, encrypted in SSM Parameter Store. Terraform creates them
# with a placeholder and never reads or changes the value afterwards, so the
# real values never touch Terraform state or this repo. Set them with
# `aws ssm put-parameter --overwrite` (docs/INFRA.md).
locals {
  secret_names = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN"]
  param_path   = "/${var.name}/"
}

resource "aws_ssm_parameter" "secret" {
  for_each = toset(local.secret_names)
  name     = "${local.param_path}${each.key}"
  type     = "SecureString"
  value    = "unset"

  lifecycle {
    ignore_changes = [value]
  }
}
