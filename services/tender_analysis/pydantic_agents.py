"""PydanticAI node construction; model selection and credentials stay in deployment config."""

from pydantic import BaseModel
from pydantic_ai import Agent

from .models import TenderInput


def structured_node(model: str, output_type: type[BaseModel], instructions: str):
    agent = Agent(model, output_type=output_type, instructions=instructions)

    async def run(tender: TenderInput) -> BaseModel:
        prompt = (
            f"Tender {tender.tender_id}: {tender.title}\n"
            f"Source URL: {tender.source_url}\n\n{tender.document_text}"
        )
        response = await agent.run(prompt)
        return response.output

    return run
