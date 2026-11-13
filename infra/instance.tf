data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_eip" "host" {
  domain = "vpc"
  tags   = { Name = var.name }
}

locals {
  domain    = var.domain != "" ? var.domain : "${replace(aws_eip.host.public_ip, ".", "-")}.sslip.io"
  log_group = "/${var.name}/host"
  deploy_script = templatefile("${path.module}/host/deploy.sh.tftpl", {
    region        = var.region
    param_path    = local.param_path
    backup_bucket = aws_s3_bucket.backups.bucket
    log_group     = local.log_group
    domain        = local.domain
  })
}

# One small Graviton box runs every Discord server's Study Squad. Replacing
# it is safe: data lives on the separate disk and in S3.
resource "aws_instance" "host" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.host.name

  user_data = templatefile("${path.module}/host/user-data.sh.tftpl", {
    volume_id     = replace(aws_ebs_volume.data.id, "-", "")
    deploy_script = base64encode(local.deploy_script)
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  # IMDSv2 only. Hop limit 2 lets the container (Litestream) reach its role.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  tags = { Name = var.name }

  lifecycle {
    # A newer AMI shouldn't replace the box on every apply.
    ignore_changes = [ami]
  }
}

resource "aws_eip_association" "host" {
  instance_id   = aws_instance.host.id
  allocation_id = aws_eip.host.id
}
