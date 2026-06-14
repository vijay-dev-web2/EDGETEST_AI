"""add repo_url and test_cases to sessions

Revision ID: 20260611_0001
Revises: de9fa932de34
Create Date: 2026-06-11 00:01:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '20260611_0001'
down_revision: Union[str, None] = 'de9fa932de34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('repo_url', sa.String(length=2048), nullable=True))
    op.add_column('sessions', sa.Column('test_cases', postgresql.JSON(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('sessions', 'test_cases')
    op.drop_column('sessions', 'repo_url')
