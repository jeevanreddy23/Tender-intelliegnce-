from datetime import date, datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class Evidence(BaseModel):
    source_url: str
    page: int | None = Field(default=None, ge=1)
    excerpt: str = Field(min_length=1, max_length=500)


class TenderInput(BaseModel):
    tender_id: str
    title: str
    document_text: str
    source_url: str
    buyer: str | None = None
    location: str | None = None
    close_date: date | None = None
    disclosed_value_aud: float | None = Field(default=None, ge=0)
    estimated_bid_cost_aud: float = Field(default=0, ge=0)
    deterministic_relevance_score: float = Field(ge=0, le=1)
    duplicate_of: str | None = None
    mandatory_criteria_met: bool | None = None
    resource_available: bool | None = None
    required_margin: float = Field(default=0.15, ge=0, le=1)
    estimated_margin: float | None = Field(default=None, ge=-1, le=1)


class ScopeResult(BaseModel):
    services: list[str]
    quantities: dict[str, float]
    mandatory_requirements: list[str]
    evidence: list[Evidence]
    confidence: float = Field(ge=0, le=1)


class EligibilityResult(BaseModel):
    accreditations: list[str]
    experience_requirements: list[str]
    mandatory_briefing: str | None = None
    evidence: list[Evidence]
    confidence: float = Field(ge=0, le=1)


class HistoryResult(BaseModel):
    previous_awards: list[str]
    likely_competitors: list[str]
    comparable_projects: list[str]
    evidence: list[Evidence]
    confidence: float = Field(ge=0, le=1)


class LogisticsResult(BaseModel):
    location: str | None
    mobilisation_requirements: list[str]
    evidence: list[Evidence]
    confidence: float = Field(ge=0, le=1)


class NodeName(StrEnum):
    SCOPE = "scope"
    ELIGIBILITY = "eligibility"
    HISTORY = "history"
    LOGISTICS = "logistics"


class NodeStatus(StrEnum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


class NodeRun(BaseModel):
    node: NodeName
    status: NodeStatus
    attempts: int = Field(ge=0)
    duration_ms: int = Field(ge=0)
    estimated_cost_usd: float = Field(ge=0)
    result: ScopeResult | EligibilityResult | HistoryResult | LogisticsResult | None = None
    error: str | None = None


class Recommendation(StrEnum):
    BID = "bid"
    NO_BID = "no_bid"
    REVIEW = "review"


class TenderAssessment(BaseModel):
    tender_id: str
    recommendation: Recommendation
    relevance_score: float = Field(ge=0, le=1)
    reasons: list[str]
    missing_information: list[str]
    required_actions: list[str]
    confidence: float = Field(ge=0, le=1)
    expected_nodes: int = Field(ge=0)
    completed_nodes: int = Field(ge=0)
    node_runs: list[NodeRun]
    deterministic_blocks: list[str]
    human_review_required: bool
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def completed_count_matches_runs(self) -> "TenderAssessment":
        actual = sum(run.status == NodeStatus.SUCCEEDED for run in self.node_runs)
        if actual != self.completed_nodes:
            raise ValueError("completed_nodes does not match successful node runs")
        return self
