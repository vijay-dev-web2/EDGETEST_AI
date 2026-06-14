import uuid
from datetime import datetime
from typing import Optional, List, Dict

from pydantic import BaseModel, Field


# --- Auth ---

class UserRead(BaseModel):
    id: uuid.UUID
    github_id: str
    username: str
    email: str
    avatar_url: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Projects ---

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    repo_url: Optional[str] = None


class ProjectRead(BaseModel):
    id: uuid.UUID
    name: str
    repo_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Analysis ---

class AnalysisCreate(BaseModel):
    project_id: uuid.UUID


class AnalysisRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status: str
    result: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# --- Ingest ---

class IngestRequest(BaseModel):
    repo_url: str
    branch: str = "main"


class IngestResponse(BaseModel):
    task_id: str
    message: str


# --- Export ---

class ExportRequest(BaseModel):
    analysis_id: uuid.UUID
    format: str = Field(default="json", pattern="^(json|html|pdf)$")


class ExportResponse(BaseModel):
    download_url: str


# --- Eligibility ---

class UnitTestTarget(BaseModel):
    name: str
    type: str
    test_categories: List[str] = []

class IntegrationBoundary(BaseModel):
    boundary_type: str
    description: str
    components_involved: List[str] = []
    test_scenario: str = ""

class ComponentInfo(BaseModel):
    name: str
    type: str
    dependencies: List[str] = []
    complexity: str = "low"

class SkippedStep(BaseModel):
    step: str
    reason: str

class RecommendedTestPlan(BaseModel):
    unit_tests_to_generate: int = 0
    integration_tests_to_generate: int = 0
    estimated_coverage: str = "0%"
    priority_order: List[str] = []
    skipped_steps: List[SkippedStep] = []

class EligibilityReport(BaseModel):
    unit_test_eligible: bool = True
    unit_test_reason: str = ""
    unit_test_targets: List[UnitTestTarget] = []

    integration_test_eligible: bool = False
    integration_test_reason: str = ""
    integration_boundaries: List[IntegrationBoundary] = []

    architecture_summary: str = ""
    components: List[ComponentInfo] = []
    recommended_test_plan: RecommendedTestPlan = RecommendedTestPlan()
    user_message: str = ""

    pipeline_gates: Dict[str, bool] = {}

class EligibilityResponse(BaseModel):
    eligibility: EligibilityReport
    pipeline_gates: Dict[str, bool]

