import asyncio
import unittest
from datetime import date, timedelta

from services.tender_analysis.models import LogisticsResult, NodeName, Recommendation, TenderInput
from services.tender_analysis.orchestrator import AnalysisGraph, AnalysisPolicy, deterministic_blocks


def tender(**changes):
    values = dict(tender_id="T-1", title="Ground investigation", document_text="Scope", source_url="https://example.test/t-1", deterministic_relevance_score=.8)
    values.update(changes)
    return TenderInput(**values)


async def logistics(_):
    return LogisticsResult(location="Sydney", mobilisation_requirements=[], evidence=[], confidence=.8)


class TenderGraphTests(unittest.IsolatedAsyncioTestCase):
    def test_deterministic_gates(self):
        item = tender(close_date=date.today() - timedelta(days=1), mandatory_criteria_met=False)
        self.assertEqual(deterministic_blocks(item), ["closing date has passed", "mandatory criteria not met"])

    async def test_rejected_tenders_do_not_invoke_agents(self):
        calls = 0
        async def node(_):
            nonlocal calls
            calls += 1
            return await logistics(_)
        graph = AnalysisGraph({NodeName.LOGISTICS: node}, synthesizer=None)  # type: ignore[arg-type]
        result = await graph.analyse(tender(deterministic_relevance_score=.1))
        self.assertEqual(result.recommendation, Recommendation.NO_BID)
        self.assertEqual(calls, 0)

    async def test_cost_limit_records_skipped_nodes(self):
        policy = AnalysisPolicy(max_cost_usd=.12, estimated_node_cost_usd=.12, minimum_successful_nodes=2, retries=0)
        graph = AnalysisGraph({NodeName.SCOPE: logistics, NodeName.LOGISTICS: logistics}, synthesizer=None, policy=policy)  # type: ignore[arg-type]
        result = await graph.analyse(tender())
        self.assertEqual(result.recommendation, Recommendation.REVIEW)
        self.assertEqual(result.completed_nodes, 1)
        self.assertEqual(result.missing_information, ["logistics"])


if __name__ == "__main__":
    unittest.main()
