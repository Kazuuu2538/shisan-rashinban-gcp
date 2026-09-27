variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "gen-lang-client-0474177417"
}

variable "region" {
  description = "Primary region for Cloud Run, Artifact Registry, Firestore, Vertex AI"
  type        = string
  default     = "asia-northeast1"
}

variable "service_name" {
  description = "Cloud Run service name for the API"
  type        = string
  default     = "shisan-rashinban-api"
}

variable "github_repo" {
  description = "GitHub repository allowed to deploy via Workload Identity Federation, as \"owner/repo\""
  type        = string
}

variable "monthly_check_schedule" {
  description = "Cron schedule (Cloud Scheduler syntax) for the monthly alert re-evaluation"
  type        = string
  default     = "0 9 5 * *" # 5th of each month, 09:00
}

variable "monthly_check_timezone" {
  type    = string
  default = "Asia/Tokyo"
}
