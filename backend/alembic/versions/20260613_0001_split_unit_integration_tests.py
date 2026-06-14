"""split unit and integration test artifacts

Revision ID: 20260613_0001
Revises: 20260611_0001
Create Date: 2026-06-13 00:01:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '20260613_0001'
down_revision: Union[str, None] = '20260611_0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('unit_test_files', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('sessions', sa.Column('unit_coverage_pct', sa.Float(), nullable=True))
    op.add_column('sessions', sa.Column('integration_test_files', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('sessions', sa.Column('integration_coverage_pct', sa.Float(), nullable=True))
    op.add_column('sessions', sa.Column('unit_traceability', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('sessions', sa.Column('integration_traceability', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('test_runs', sa.Column('run_type', sa.String(length=16), nullable=False, server_default='combined'))


def downgrade() -> None:
    op.drop_column('test_runs', 'run_type')
    op.drop_column('sessions', 'integration_traceability')
    op.drop_column('sessions', 'unit_traceability')
    op.drop_column('sessions', 'integration_coverage_pct')
    op.drop_column('sessions', 'integration_test_files')
    op.drop_column('sessions', 'unit_coverage_pct')
    op.drop_column('sessions', 'unit_test_files')
