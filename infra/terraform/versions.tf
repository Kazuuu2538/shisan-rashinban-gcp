terraform {
  required_version = ">= 1.7.0"
  required_providers {
    google      = { source = "hashicorp/google", version = "~> 6.0" }
    google-beta = { source = "hashicorp/google-beta", version = "~> 6.0" }
  }

  # State is kept in GCS rather than locally, so `terraform apply` is
  # safe to run from more than one machine. Create the bucket once
  # (see docs/architecture.md step 4) before the first `terraform init`.
  backend "gcs" {
    bucket = "gen-lang-client-0474177417-tfstate"
    prefix = "shisan-rashinban"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
