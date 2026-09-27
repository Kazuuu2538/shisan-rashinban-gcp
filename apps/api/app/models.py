from typing import Literal, Optional
from pydantic import BaseModel, Field

ASSET_KEYS = ["cash", "domesticStock", "foreignStock", "bonds", "other"]


class Allocation(BaseModel):
    cash: float = 0
    domesticStock: float = 0
    foreignStock: float = 0
    bonds: float = 0
    other: float = 0

    def total(self) -> float:
        return sum(getattr(self, k) for k in ASSET_KEYS)


class SavingsGoalIn(BaseModel):
    category: Literal["savings"] = "savings"
    title: str
    startPeriod: str  # "YYYY-MM"
    startAmount: float
    targetPeriod: str
    targetAmount: float
    thresholdPct: float = 10


class PortfolioGoalIn(BaseModel):
    category: Literal["portfolio"] = "portfolio"
    title: str
    targetAllocation: Allocation
    thresholdPt: float = 10


class SnapshotIn(BaseModel):
    period: str  # "YYYY-MM", also the document id
    allocation: Allocation
    income: Optional[float] = None
    expenses: Optional[float] = None
    note: str = ""


class Alert(BaseModel):
    goalId: str
    goalTitle: str
    category: Literal["savings", "portfolio"]
    status: Literal["good", "warn", "critical", "nodata"]
    message: str
    updatedAt: str
