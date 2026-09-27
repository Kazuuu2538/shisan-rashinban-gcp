"""The Vertex AI-backed advisory endpoint. Phase 1 ships a working
end-to-end call (goals + snapshots + active alerts -> Gemini -> a
short Japanese advisory note) so the plumbing (auth, IAM, model
access) is proven before phase 2 builds the tax/insurance/estate
features on top of it."""
import os

import vertexai
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from vertexai.generative_models import GenerativeModel

from ..auth import get_current_uid
from ..firestore_client import get_db

router = APIRouter(prefix="/agent", tags=["agent"])

_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
_LOCATION = os.environ.get("VERTEX_AI_LOCATION", "asia-northeast1")
_initialized = False


def _ensure_init() -> None:
    global _initialized
    if not _initialized:
        vertexai.init(project=_PROJECT, location=_LOCATION)
        _initialized = True


SYSTEM_PROMPT = """あなたはKazuhiroさん専属のプライベートバンカーAIエージェントです。
提供された目標・月次資産データ・現在のアラートだけを根拠に、具体的で簡潔な助言を日本語で行ってください。
断定的な投資助言（このタイミングで買え/売れ、等）は避け、事実の整理と検討すべき論点の提示に留めてください。
出力は300字程度、箇条書き2〜4点にまとめてください。"""


class AdviceRequest(BaseModel):
    question: str = ""


@router.post("/advice")
async def get_advice(req: AdviceRequest, uid: str = Depends(get_current_uid)):
    db = get_db()
    goals = [d.to_dict() for d in db.collection("users", uid, "goals").stream()]
    snapshots = [d.to_dict() for d in db.collection("users", uid, "snapshots").stream()]
    alerts = [d.to_dict() for d in db.collection("users", uid, "alerts").stream()]

    _ensure_init()
    model = GenerativeModel(model_name="gemini-1.5-flash", system_instruction=SYSTEM_PROMPT)
    context = (
        f"目標一覧: {goals}\n"
        f"月次スナップショット件数: {len(snapshots)}（最新: {max((s['period'] for s in snapshots), default='なし')}）\n"
        f"現在のアラート: {alerts}\n"
        f"ユーザーからの質問: {req.question or '（特になし。全体的な状況を踏まえて助言してください）'}"
    )
    response = model.generate_content(context)
    return {"advice": response.text}
