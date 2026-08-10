from fastapi import APIRouter

from models.schemas import RecommendationRequest, RecommendationResponse
from services.claude import prewarm_cache, recommendation

router = APIRouter()


@router.post("/recommendation", response_model=RecommendationResponse)
def create_recommendation(request: RecommendationRequest) -> RecommendationResponse:
    text, source = recommendation(request)
    return RecommendationResponse(text=text, source=source)


@router.get("/recommendation/prewarm")
def prewarm() -> dict[str, int]:
    return {"cached": prewarm_cache()}
