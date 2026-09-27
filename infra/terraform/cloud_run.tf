resource "google_service_account" "api_runtime" {
  project      = var.project_id
  account_id   = "shisan-rashinban-api"
  display_name = "資産羅針盤 API runtime (Cloud Run)"
}

resource "google_project_iam_member" "api_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_project_iam_member" "api_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

locals {
  internal_job_audience = "internal://shisan-rashinban/monthly-check"
}

resource "google_cloud_run_v2_service" "api" {
  provider = google-beta
  project  = var.project_id
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api_runtime.email

    containers {
      # Placeholder on first apply — GitHub Actions overwrites this with
      # a real build on every push via `gcloud run deploy --image ...`.
      # Terraform then leaves the image alone (see lifecycle block).
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "VERTEX_AI_LOCATION"
        value = var.region
      }
      env {
        name  = "SCHEDULER_SERVICE_ACCOUNT_EMAIL"
        value = google_service_account.scheduler_invoker.email
      }
      env {
        name  = "INTERNAL_JOB_AUDIENCE"
        value = local.internal_job_audience
      }
      env {
        name  = "FIREBASE_API_KEY"
        value = data.google_firebase_web_app_config.default.api_key
      }
      env {
        name  = "FIREBASE_AUTH_DOMAIN"
        value = data.google_firebase_web_app_config.default.auth_domain
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "FIREBASE_APP_ID"
        value = google_firebase_web_app.default.app_id
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_project_service.apis]
}

# Public: Firebase-authenticated routes verify the caller's ID token
# in-app; the one truly internal route (/internal/monthly-check) does
# its own OIDC verification (see apps/api/app/routers/internal.py).
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  provider = google-beta
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
