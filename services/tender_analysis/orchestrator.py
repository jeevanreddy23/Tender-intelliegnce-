import asyncio
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import date
from time import monotonic
from typing import Protocol

from pydantic import BaseModel

from .models import (
    NodeName,
    NodeRun,
    NodeStatus,
    Recommendation,
    TenderAssessment,
    TenderInput,
)


class AnalysisNode(Protocol):
    async def __call__(self, tender: TenderInput) -> BaseModel: ...


class Synthesizer(Protocol):
    async def __call__(self, tender: TenderInput, runs: list[NodeRun]) -> TenderAssessment: ...


@dataclass(frozen=True)
class AnalysisPolicy:
    shortlist_threshold: float = 0.35
    concurrency: int = 3
    timeout_seconds: float = 45
    retries: int = 2
    max_cost_usd: float = 1.25
    estimated_node_cost_usd: float = 0.12
    high_value_threshold_aud: float = 5_000_000
    minimum_successful_nodes: int = 3


def deterministic_blocks(tender: TenderInput, today: date | None = None) -> list[str]:
    """Hard gates are evaluated without an LLM and cannot be overruled by synthesis."""
    today = today or date.today()
    blocks: list[str] = []
    if tender.duplicate_of:
        blocks.append(f"duplicate of {tender.duplicate_of}")
    if tender.close_date and tender.close_date < today:
        blocks.append("closing date has passed")
    if tender.mandatory_criteria_met is False:
        blocks.append("mandatory criteria not met")
    if tender.resource_available is False:
        blocks.append("required staff or rigs unavailable")
    if tender.estimated_margin is not None and tender.estimated_margin < tender.required_margin:
        blocks.append("estimated margin below minimum")
    return blocks


class AnalysisGraph:
    """Bounded fan-out/fan-in processing for already-shortlisted tenders."""

    def __init__(
        self,
        nodes: Mapping[NodeName, AnalysisNode],
        synthesizer: Synthesizer,
        policy: AnalysisPolicy | None = None,
    ) -> None:
        self.nodes = dict(nodes)
        self.synthesizer = synthesizer
        self.policy = policy or AnalysisPolicy()
        self._semaphore = asyncio.Semaphore(self.policy.concurrency)

    async def analyse(self, tender: TenderInput) -> TenderAssessment:
        expected = len(self.nodes)
        blocks = deterministic_blocks(tender)
        if blocks or tender.deterministic_relevance_score < self.policy.shortlist_threshold:
            reason = blocks or ["below deterministic shortlist threshold"]
            return self._deterministic_assessment(tender, expected, reason)

        cost_lock = asyncio.Lock()
        budget = {"reserved": 0.0}
        runs = await asyncio.gather(*(
            self._run_node(name, node, tender, cost_lock, budget)
            for name, node in self.nodes.items()
        ))
        completed = sum(run.status == NodeStatus.SUCCEEDED for run in runs)
        if completed < self.policy.minimum_successful_nodes:
            return TenderAssessment(
                tender_id=tender.tender_id,
                recommendation=Recommendation.REVIEW,
                relevance_score=tender.deterministic_relevance_score,
                reasons=["insufficient analysis nodes completed"],
                missing_information=[run.node.value for run in runs if run.status != NodeStatus.SUCCEEDED],
                required_actions=["complete failed analysis and obtain human review"],
                confidence=0,
                expected_nodes=expected,
                completed_nodes=completed,
                node_runs=runs,
                deterministic_blocks=[],
                human_review_required=True,
            )

        assessment = await asyncio.wait_for(
            self.synthesizer(tender, runs), timeout=self.policy.timeout_seconds
        )
        assessment.expected_nodes = expected
        assessment.completed_nodes = completed
        assessment.node_runs = runs
        assessment.deterministic_blocks = []
        assessment.human_review_required = (
            assessment.human_review_required
            or (tender.disclosed_value_aud or 0) >= self.policy.high_value_threshold_aud
        )
        return TenderAssessment.model_validate(assessment.model_dump())

    async def _reserve_cost(self, lock: asyncio.Lock, budget: dict[str, float]) -> bool:
        async with lock:
            next_cost = budget["reserved"] + self.policy.estimated_node_cost_usd
            if next_cost > self.policy.max_cost_usd:
                return False
            budget["reserved"] = next_cost
            return True

    async def _run_node(
        self,
        name: NodeName,
        node: Callable[[TenderInput], Awaitable[BaseModel]],
        tender: TenderInput,
        cost_lock: asyncio.Lock,
        budget: dict[str, float],
    ) -> NodeRun:
        if not await self._reserve_cost(cost_lock, budget):
            return NodeRun(node=name, status=NodeStatus.SKIPPED, attempts=0, duration_ms=0,
                           estimated_cost_usd=0, error="cost limit reached")
        started = monotonic()
        last_error = "unknown failure"
        async with self._semaphore:
            for attempt in range(1, self.policy.retries + 2):
                try:
                    result = await asyncio.wait_for(node(tender), timeout=self.policy.timeout_seconds)
                    return NodeRun(
                        node=name, status=NodeStatus.SUCCEEDED, attempts=attempt,
                        duration_ms=int((monotonic() - started) * 1000),
                        estimated_cost_usd=self.policy.estimated_node_cost_usd, result=result,
                    )
                except (TimeoutError, ConnectionError) as error:
                    last_error = f"{type(error).__name__}: {error}"[:300]
                    if attempt <= self.policy.retries:
                        await asyncio.sleep(min(2 ** (attempt - 1), 4))
                except Exception as error:  # unexpected node failures are recorded, not hidden
                    last_error = f"{type(error).__name__}: {error}"[:300]
                    break
        return NodeRun(
            node=name, status=NodeStatus.FAILED, attempts=attempt,
            duration_ms=int((monotonic() - started) * 1000),
            estimated_cost_usd=self.policy.estimated_node_cost_usd, error=last_error,
        )

    @staticmethod
    def _deterministic_assessment(
        tender: TenderInput, expected: int, reasons: list[str]
    ) -> TenderAssessment:
        return TenderAssessment(
            tender_id=tender.tender_id,
            recommendation=Recommendation.NO_BID,
            relevance_score=tender.deterministic_relevance_score,
            reasons=reasons,
            missing_information=[],
            required_actions=["record deterministic rejection in audit history"],
            confidence=1,
            expected_nodes=expected,
            completed_nodes=0,
            node_runs=[],
            deterministic_blocks=reasons,
            human_review_required=False,
        )
