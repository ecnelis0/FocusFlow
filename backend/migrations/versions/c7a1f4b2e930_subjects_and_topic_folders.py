"""subjects and topic folders

The bank stops being one pile. A subject ("APUSH", "SAT", "Calculus") becomes a row
rather than a distinct string, so an empty one can exist and show a tab before
anything is logged into it, and a folder is a topic inside a subject that holds both
the concepts filed under it and the questions logged against it.

`mistakes.subject` and `concepts.subject` stay: every filter, tally and analyzer
prompt speaks in subject *names*, and this migration backfills a `subjects` row for
every name already in the bank so no existing question loses its tab. See
`app/filing.py` for the rule that keeps the name and the folder from drifting.

Revision ID: c7a1f4b2e930
Revises: b3e7c2d9a4f1
Create Date: 2026-09-17 09:00:00.000000

"""

import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# The models module defines custom column types (UtcDateTime) that autogenerate
# renders by their fully qualified name; without this import the migration is a
# NameError at run time.
import app.models


# revision identifiers, used by Alembic.
revision: str = "c7a1f4b2e930"
down_revision: Union[str, Sequence[str], None] = "b3e7c2d9a4f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "subjects",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", app.models.UtcDateTime(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_subjects_user_name"),
    )
    op.create_index(op.f("ix_subjects_user_id"), "subjects", ["user_id"], unique=False)

    op.create_table(
        "folders",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("subject_id", sa.String(length=32), nullable=False),
        sa.Column("created_at", app.models.UtcDateTime(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subject_id", "name", name="uq_folders_subject_name"),
    )
    op.create_index(op.f("ix_folders_user_id"), "folders", ["user_id"], unique=False)
    op.create_index(op.f("ix_folders_subject_id"), "folders", ["subject_id"], unique=False)

    for table in ("concepts", "mistakes"):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(sa.Column("folder_id", sa.String(length=32), nullable=True))
            batch_op.create_foreign_key(
                f"fk_{table}_folder_id", "folders", ["folder_id"], ["id"], ondelete="SET NULL"
            )
        # A second batch, as in b3e7c2d9a4f1: batch mode resolves a new index's
        # columns against the table as it was before the block that added them.
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.create_index(
                batch_op.f(f"ix_{table}_folder_id"), ["folder_id"], unique=False
            )

    _backfill_subjects()


def _backfill_subjects() -> None:
    """Give every subject name already in the bank a row, so no tab goes missing.

    Grouped case-insensitively, keeping the first spelling seen: the app has always
    matched subjects case-insensitively, so "Biology" and "biology" are one course
    and two rows here would be two tabs for it. Positions are assigned in name
    order, which is what a bank that has never been reordered should look like.
    """
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT user_id, subject FROM mistakes WHERE subject IS NOT NULL "
            "UNION SELECT user_id, subject FROM concepts WHERE subject IS NOT NULL"
        )
    ).all()

    seen: dict[tuple[str, str], str] = {}
    for user_id, subject in rows:
        key = (user_id, subject.strip().lower())
        if key not in seen:
            seen[key] = subject.strip()

    now = datetime.now(UTC)
    for position, ((user_id, _), name) in enumerate(sorted(seen.items(), key=lambda i: i[1]), 1):
        bind.execute(
            sa.text(
                "INSERT INTO subjects (id, user_id, created_at, name, position) "
                "VALUES (:id, :user_id, :created_at, :name, :position)"
            ).bindparams(
                id=uuid.uuid4().hex,
                user_id=user_id,
                created_at=now,
                name=name,
                position=position,
            )
        )


def downgrade() -> None:
    """Downgrade schema.

    Lossy: the folders are the structure, and there is nowhere in the old schema to
    keep them. Each row's `subject` survives, so the bank goes back to being one
    pile per subject rather than losing where anything belongs entirely.
    """
    for table in ("concepts", "mistakes"):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_index(batch_op.f(f"ix_{table}_folder_id"))
            batch_op.drop_constraint(f"fk_{table}_folder_id", type_="foreignkey")
            batch_op.drop_column("folder_id")

    op.drop_index(op.f("ix_folders_subject_id"), table_name="folders")
    op.drop_index(op.f("ix_folders_user_id"), table_name="folders")
    op.drop_table("folders")
    op.drop_index(op.f("ix_subjects_user_id"), table_name="subjects")
    op.drop_table("subjects")
