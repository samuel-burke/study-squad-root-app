terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State lives in S3 with S3-native locking. The bucket is created once by
  # hand (docs/INFRA.md); its name is passed with -backend-config.
  backend "s3" {
    key          = "study-squad/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      App       = var.name
      ManagedBy = "terraform"
    }
  }
}
