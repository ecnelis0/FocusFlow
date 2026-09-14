"""section becomes a free-text subject

The closed `Section` enum (math | reading_writing) is gone: the bank is for any
subject, so the column is now optional free text and the two old values become
readable names. Two error slots that only made sense for one exam are folded into
`other`.

Revision ID: b3e7c2d9a4f1
Revises: a59cdac11524
Create Date: 2026-09-12 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# The models module defines custom column types (UtcDateTime) that autogenerate
# renders by their fully qualified name; without this import the migration is a
# NameError at run time.
import app.models


# revision identifiers, used by Alembic.
revision: str = "b3e7c2d9a4f1"
down_revision: Union[str, Sequence[str], None] = "a59cdac11524"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Old closed value -> the free-text name it becomes.
SUBJECT_NAMES = {"math": "Math", "reading_writing": "Reading & Writing"}
# Error slots removed from the vocabulary. Rows carrying them become `other`
# rather than failing to load.
RETIRED_ERROR_TYPES = ("evidence_misread", "grammar_rule_gap")


def upgrade() -> None:
    """Upgrade schema."""
    # Batch mode, because SQLite cannot rename a column or relax NOT NULL in place;
    # the table is rebuilt. The index is dropped before the rename and recreated in a
    # second batch afterwards: batch mode resolves a new index's columns against the
    # table as it was before the rename, so doing both in one block is a KeyError.
    with op.batch_alter_table("concepts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_concepts_section"))
        batch_op.alter_column(
            "section",
            new_column_name="subject",
            existing_type=sa.String(length=32),
            type_=sa.String(length=80),
            existing_nullable=True,
        )
    with op.batch_alter_table("concepts", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_concepts_subject"), ["subject"], unique=False)

    with op.batch_alter_table("mistakes", schema=None) as batch_op:
        batch_op.alter_column(
            "section",
            new_column_name="subject",
            existing_type=sa.String(length=32),
            type_=sa.String(length=80),
            existing_nullable=False,
            nullable=True,
        )
    with op.batch_alter_table("mistakes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_mistakes_subject"), ["subject"], unique=False)

    for table in ("concepts", "mistakes"):
        for old, new in SUBJECT_NAMES.items():
            op.execute(
                sa.text(f"UPDATE {table} SET subject = :new WHERE subject = :old").bindparams(
                    new=new, old=old
                )
            )

    op.execute(
        sa.text("UPDATE mistakes SET error_type = 'other' WHERE error_type IN :retired").bindparams(
            sa.bindparam("retired", RETIRED_ERROR_TYPES, expanding=True)
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Lossy by nature: a subject that is not one of the two old sections has no
    # home in the enum, so it becomes 'math' rather than leaving a NOT NULL
    # column empty. The retired error slots are not restored.
    for table in ("concepts", "mistakes"):
        for old, new in SUBJECT_NAMES.items():
            op.execute(
                sa.text(f"UPDATE {table} SET subject = :old WHERE subject = :new").bindparams(
                    new=new, old=old
                )
            )
    op.execute(
        sa.text(
            "UPDATE mistakes SET subject = 'math' "
            "WHERE subject IS NULL OR subject NOT IN ('math', 'reading_writing')"
        )
    )
    op.execute(
        sa.text(
            "UPDATE concepts SET subject = NULL "
            "WHERE subject IS NOT NULL AND subject NOT IN ('math', 'reading_writing')"
        )
    )

    with op.batch_alter_table("mistakes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_mistakes_subject"))
        batch_op.alter_column(
            "subject",
            new_column_name="section",
            existing_type=sa.String(length=80),
            type_=sa.String(length=32),
            existing_nullable=True,
            nullable=False,
        )

    with op.batch_alter_table("concepts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_concepts_subject"))
        batch_op.alter_column(
            "subject",
            new_column_name="section",
            existing_type=sa.String(length=80),
            type_=sa.String(length=32),
            existing_nullable=True,
        )
    with op.batch_alter_table("concepts", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_concepts_section"), ["section"], unique=False)
