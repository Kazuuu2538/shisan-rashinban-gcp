# 資産羅針盤 GCP版 — アーキテクチャ設計

## 目的

Claude Artifact上のプロトタイプ（個人の資産形成・ポートフォリオ監視）を土台に、
GCPネイティブな構成で「プライベートバンカー型」の資産運用支援エージェントへ拡張する。
GCPの知見を貯めることも目的の一つなので、マネージドサービスを積極的に使う構成にしている。

## 全体構成

```
                         ┌─────────────────────────┐
                         │      Firebase Hosting     │  ← フロントエンド (静的SPA)
                         │  (apps/web)                │
                         └────────────┬───────────────┘
                                      │ HTTPS + Firebase ID Token
                                      ▼
                         ┌─────────────────────────┐
                         │        Cloud Run           │  ← バックエンドAPI (apps/api, FastAPI)
                         │  - Firebase Admin SDKで      │
                         │    トークン検証              │
                         │  - Firestoreへの読み書き      │
                         │  - Vertex AI呼び出し         │
                         └───┬───────────────┬─────────┘
                             │               │
                 ┌───────────▼──┐     ┌──────▼───────────┐
                 │  Firestore    │     │   Vertex AI        │
                 │ (ユーザーごとの │     │ (Gemini経由の      │
                 │  目標/実績/    │     │  アドバイス生成)    │
                 │  保険/税務等)  │     └────────────────────┘
                 └───────────────┘

    Cloud Scheduler ──(月次, OIDC認証)──▶ Cloud Run /internal/monthly-check
                                              │
                                              └─▶ 全ユーザーのアラート再評価
                                                  (通知送信は現状ログ出力のみ、
                                                   phase2で通知チャネルを接続)

    GitHub (main push) ──▶ GitHub Actions ──(Workload Identity Federation, キーレス)──▶
                              ├─ apps/api を Cloud Run にデプロイ
                              └─ apps/web を Firebase Hosting にデプロイ
```

## なぜこの構成か

| 決定 | 理由 |
|---|---|
| Cloud Run（サーバーレスコンテナ） | 使った分だけ課金、個人利用のトラフィックには十分。GKEほどの運用負荷がない |
| Firestore（NoSQL） | Artifact版のデータ構造（ユーザーごとにgoals/snapshots/alerts）がそのまま移行しやすい。将来のドキュメント追加（保険・税務等）にも柔軟 |
| Firebase Auth | Googleログイン等をコード数行で実装でき、Firestoreのセキュリティルールとも自然に連携する |
| Vertex AI（Gemini） | 税制優遇提案・総合アドバイスなど「私見が伴う」出力をエージェント部分として分離。バックエンドAPIから呼び出す構成にして、将来モデルやプロンプトを差し替えやすくする |
| Workload Identity Federation | サービスアカウントキーをGitHubに保存しない。鍵の漏洩リスクをなくすのがベストプラクティス |
| Firebase Hosting（フロントエンド） | Firebase Authと同一プロジェクトで完結し、GitHub Actionsからのデプロイも定型化されている |

## マルチテナント設計

個人利用が前提だが、Firebase AuthのUIDをすべてのFirestoreパスのルートに持たせているため、
将来他のユーザーを招待してもデータは自動的に分離される。

```
users/{uid}                          -- プロフィール
users/{uid}/goals/{goalId}           -- 資産形成 or ポートフォリオ配分の目標
users/{uid}/snapshots/{period}       -- 月次の資産内訳スナップショット (YYYY-MM)
users/{uid}/alerts/{goalId}          -- 現在アクティブなアラート（自動再計算・自動解消）
users/{uid}/insurances/{policyId}    -- (phase2) 保険契約の一元管理
users/{uid}/taxProfile/main          -- (phase2) NISA/iDeCo等の利用状況、所得区分
users/{uid}/estatePlan/main          -- (phase2) 相続・事業承継に関するメモ
```

## フェーズ計画

1. **フェーズ1（今回）**: 現行機能（資産形成モニタリング・ポートフォリオ配分監視・アラート）をGCP構成に移植し、
   Cloud Run + Firestore + Firebase Auth + GitHub Actions CI/CDの土台を固める。
2. **フェーズ2**: 税制優遇制度（NISA・iDeCo等）の利用状況追跡と最適化提案。Vertex AI経由でルールベース＋生成AIのハイブリッド提案。
3. **フェーズ3**: 保険・税務・相続情報の一元管理と、法人（院長なび等）を持つ場合の法人・個人資産の相関分析。

## ローカル開発 / デプロイに必要な前提作業（Kazuhiroさん側で一度だけ実施）

Claudeはこの環境から実際のgcloud認証操作はできないため、以下はプロジェクトオーナーが一度だけ実行する。

1. GCPプロジェクト `gen-lang-client-0474177417` で課金が有効になっていることを確認
2. 必要なAPIを有効化（Terraformでも一部自動化するが、初回は手動確認を推奨）：
   `gcloud services enable run.googleapis.com firestore.googleapis.com aiplatform.googleapis.com iamcredentials.googleapis.com firebase.googleapis.com`
3. Firestoreをネイティブモードで初期化（未作成の場合）：
   `gcloud firestore databases create --location=asia-northeast1`
4. Terraformの状態を保存するGCSバケットを作成（例）：
   `gsutil mb -l asia-northeast1 gs://gen-lang-client-0474177417-tfstate`
5. `infra/terraform/terraform.tfvars` を作成し、プロジェクトID・GitHubリポジトリ名を設定
6. `terraform init && terraform apply` を実行（Workload Identity Federation、Cloud Run、Firestoreインデックス等を作成）
7. Terraform出力される `github_actions_service_account` と `workload_identity_provider` をGitHub Secretsに設定
