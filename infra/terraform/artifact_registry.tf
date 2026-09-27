resource "google_artifact_registry_repository" "api" {
  project       = var.project_id
  location      = var.region
  repository_id = "shisan-rashinban"
  format        = "DOCKER"
  description   = "Container images for the 資産羅針盤 API"

  depends_on = [google_project_service.apis]
}
