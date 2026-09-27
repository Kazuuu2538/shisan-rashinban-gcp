# 資産羅針盤（GCP版）

個人の資産形成・ポートフォリオ監視から、将来的には税制優遇・保険・相続まで扱う
「プライベートバンカー型」AIエージェント。詳しい設計は [`docs/architecture.md`](docs/architecture.md) を参照。

## 構成

- `apps/api` — バックエンドAPI（FastAPI, Cloud Run）
- `apps/web` — フロントエンド（静的SPA, Firebase Hosting）
- `infra/terraform` — インフラ定義（Cloud Run, Firestore, Firebase Auth, Workload Identity Federation, Cloud Scheduler）
- `.github/workflows` — GitHub ActionsによるCI/CD（キーレス認証でCloud Run / Firebase Hostingへ自動デプロイ）

## セットアップ手順（初回のみ、Kazuhiroさんが実施）

### 1. インフラを作る

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # github_repo を実際のリポジトリ名に書き換える
gsutil mb -l asia-northeast1 gs://gen-lang-client-0474177417-tfstate   # 初回のみ
terraform init
terraform apply
```

`terraform apply` が作成するもの:
- Firestore（ネイティブモード）
- Firebase Auth（Googleログイン有効化）+ Firebase Web App
- Cloud Run サービス（プレースホルダーイメージでまず起動、以後はCI/CDが更新）
- Artifact Registry（Dockerイメージ置き場）
- Cloud Scheduler（毎月5日 9:00 JSTにアラート再評価）
- Workload Identity Federation（GitHub Actions用のキーレス認証）

### 2. GitHub Secrets / Variables を設定する

`terraform output` の値をGitHubリポジトリの Settings → Secrets and variables に設定：

**Secrets:**
- `WIF_PROVIDER` ← `terraform output workload_identity_provider`
- `WIF_SERVICE_ACCOUNT` ← `terraform output deployer_service_account`

**Variables:**
- `GCP_PROJECT_ID` = `gen-lang-client-0474177417`
- `GCP_REGION` = `asia-northeast1`
- `CLOUD_RUN_SERVICE_NAME` = `shisan-rashinban-api`
- `CLOUD_RUN_SERVICE_URL` ← `terraform output cloud_run_url`
- `FIREBASE_API_KEY` / `FIREBASE_AUTH_DOMAIN` / `FIREBASE_APP_ID` ← `terraform output firebase_web_config`

### 3. コードをpushする

`main` ブランチにpushすると、`apps/api` の変更は Cloud Run に、`apps/web` の変更は
Firebase Hosting に自動デプロイされる（`.github/workflows/`）。

### 4. ローカル開発

```bash
# API
cd apps/api
pip install -r requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS=~/path/to/adc.json   # gcloud auth application-default login でも可
uvicorn app.main:app --reload

# フロントエンド（config.js のapiBaseUrlをlocalhostに向けたまま）
cd apps/web/public
python3 -m http.server 5173
```

## ステータス

- [x] フェーズ1: 現行機能（資産形成モニタリング・ポートフォリオ配分監視・月次アラート）をGCP構成に移植
- [x] Vertex AI（Gemini）によるアドバイザー機能の土台（`/agent/advice`）
- [ ] フェーズ2: 税制優遇制度（NISA/iDeCo）の最適化提案
- [ ] フェーズ3: 保険・税務・相続の統合管理
