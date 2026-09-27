output "cloud_run_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "workload_identity_provider" {
  description = "Set as the GitHub Actions secret WIF_PROVIDER"
  value       = "projects/${data.google_project.this.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id}"
}

output "deployer_service_account" {
  description = "Set as the GitHub Actions secret WIF_SERVICE_ACCOUNT"
  value       = google_service_account.deployer.email
}

output "artifact_registry_repo" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}"
}

output "firebase_web_config" {
  description = "Set as GitHub repository variables consumed by deploy-web.yml when generating config.js"
  value = {
    apiKey     = data.google_firebase_web_app_config.default.api_key
    authDomain = data.google_firebase_web_app_config.default.auth_domain
    projectId  = var.project_id
    appId      = google_firebase_web_app.default.app_id
  }
  sensitive = false
}

data "google_project" "this" {
  project_id = var.project_id
}
