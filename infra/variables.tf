variable "region" {
  description = "AWS region. us-east-1 is close to Discord's US users and the cheapest."
  type        = string
  default     = "us-east-1"
}

variable "name" {
  description = "Prefix for every resource's name."
  type        = string
  default     = "study-squad"
}

variable "github_repo" {
  description = "owner/name of the GitHub repo whose main branch may deploy."
  type        = string
  default     = "samuel-burke/study-squad"
}

variable "domain" {
  description = "Public hostname for the Activity. Empty uses <ip>.sslip.io, which needs no DNS setup."
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "Graviton (arm64). t4g.micro has 1 GB, enough for about 30 busy Discord servers."
  type        = string
  default     = "t4g.micro"
}

variable "data_volume_gb" {
  description = "Size of the disk holding every Discord server's database."
  type        = number
  default     = 4
}

variable "alert_email" {
  description = "Gets alarms and the monthly budget warning. Empty turns email alerts off."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Emails alert_email when the month's forecast passes this."
  type        = number
  default     = 12
}
