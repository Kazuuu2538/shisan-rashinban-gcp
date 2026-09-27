resource "google_service_account" "scheduler_invoker" {
  project      = var.project_id
  account_id   = "shisan-rashinban-scheduler"
  display_name = "資産羅針盤 monthly-check caller (Cloud Scheduler)"
}

resource "google_cloud_scheduler_job" "monthly_check" {
  project   = var.project_id
  region    = var.region
  name      = "shisan-rashinban-monthly-check"
  schedule  = var.monthly_check_schedule
  time_zone = var.monthly_check_timezone

  http_target {
    uri         = "${google_cloud_run_v2_service.api.uri}/internal/monthly-check"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience               = local.internal_job_audience
    }
  }

  retry_config {
    retry_count = 2
  }

  depends_on = [google_project_service.apis]
}
