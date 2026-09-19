"""concepts nest under a broader concept

Revision ID: d2f5b81c6a47
Revises: c7a1f4b2e930
Create Date: 2026-09-18

A concept gains the broader one it sits under, so a folder's concepts are a tree
("Battle of Yorktown" under "The American Revolution") rather than forty siblings.
Everything already filed stays exactly where it is: `parent_id` is null for every
existing row, which means "this is a top-level idea", which is what a flat bank was.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.models  # noqa: F401  (custom types render by qualified name)

revision: str = "d2f5b81c6a47"
down_revision: str | None = "c7a1f4b2e930"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # batch_alter_table because SQLite cannot ALTER a table to add a constraint;
    # Alembic rebuilds it. Named constraints, so the downgrade can find them.
    with op.batch_alter_table("concepts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("parent_id", sa.String(length=32), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_concepts_parent_id"), ["parent_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_concepts_parent_id_concepts",
            "concepts",
            ["parent_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("concepts", schema=None) as batch_op:
        batch_op.drop_constraint("fk_concepts_parent_id_concepts", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_concepts_parent_id"))
        batch_op.drop_column("parent_id")
