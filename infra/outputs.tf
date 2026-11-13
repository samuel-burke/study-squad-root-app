output "url" {
  description = "The Activity's address. Use it for Discord's URL Mapping for /."
  value       = "https://${local.domain}"
}

output "deploy_role_arn" {
  description = "GitHub variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "instance_id" {
  description = "For `aws ssm start-session --target`."
  value       = aws_instance.host.id
}

output "ecr_repository" {
  value = aws_ecr_repository.app.repository_url
}

output "backup_bucket" {
  value = aws_s3_bucket.backups.bucket
}
