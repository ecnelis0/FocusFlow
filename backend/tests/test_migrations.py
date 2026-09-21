"""Migrations. The point of these is that the seventh schema change is not by hand.

Six were, because `create_all` silently declines to alter a table that already
exists: the app kept starting cleanly and then failing on the first query with
`no such column`.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.script import ScriptDirectory

from app import config
from app.migrate import _config, back_up, pending, sqlite_path, upgrade
from app.models import Base


@pytest.fixture
def blank(tmp_path, monkeypatch):
    """A database file that does not exist yet."""
    path = tmp_path / "fresh.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    config.get_settings.cache_clear()
    yield path
    config.get_settings.cache_clear()


def tables(path: Path) -> set[str]:
    db = sqlite3.connect(path)
    try:
        return {r[0] for r in db.execute("select name from sqlite_master where type='table'")} - {
            "alembic_version"
        }
    finally:
        db.close()


def columns(path: Path, table: str) -> set[str]:
    db = sqlite3.connect(path)
    try:
        return {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
    finally:
        db.close()


def test_there_is_exactly_one_head(blank):
    """Two heads means someone branched the history and migrations will not apply."""
    script = ScriptDirectory.from_config(_config())

    assert len(script.get_heads()) == 1


def test_migrating_a_blank_database_builds_the_whole_schema(blank):
    upgrade()

    assert tables(blank) == set(Base.metadata.tables)


def test_every_column_matches_the_models(blank):
    """The check `create_all` could not do: columns, not just tables."""
    upgrade()

    for table in sorted(Base.metadata.tables):
        expected = {column.name for column in Base.metadata.tables[table].columns}
        assert columns(blank, table) == expected, table


def test_migrating_twice_is_a_no_op(blank):
    upgrade()
    before = tables(blank)

    upgrade()

    assert tables(blank) == before


def test_pending_is_true_before_and_false_after(blank):
    assert pending() is True

    upgrade()

    assert pending() is False


def test_the_schema_has_no_undeclared_drift(blank):
    """Autogenerate against a migrated database should find nothing to do.

    If this fails, someone changed a model without writing a migration - which is
    the exact failure the whole of this file exists to prevent.
    """
    from alembic.autogenerate import compare_metadata
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy import create_engine

    upgrade()

    engine = create_engine(f"sqlite:///{blank}")
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(connection)
            diff = compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()

    # Foreign keys and indexes reflect differently on SQLite; real drift is a
    # missing or extra table or column.
    real = [
        entry
        for entry in diff
        if isinstance(entry, tuple)
        and entry[0] in {"add_table", "remove_table", "add_column", "remove_column"}
    ]
    assert real == [], real


def test_a_migration_backs_the_database_up_first(blank):
    """A migration is the one routine operation that can destroy a bank."""
    upgrade()  # creates the file
    assert blank.exists()

    # back_up takes the database URL, not a bare path.
    backup = back_up(f"sqlite+aiosqlite:///{blank}")

    assert backup is not None and backup.exists()
    assert backup.stat().st_size == blank.stat().st_size
    backup.unlink()


def test_nothing_is_backed_up_when_there_is_nothing_to_migrate(blank):
    upgrade()
    first = upgrade()

    # Already at head, so no copy was taken.
    assert first is None


def test_a_postgres_url_is_left_to_its_own_backups(blank):
    assert sqlite_path("postgresql+asyncpg://user:pw@host/db") is None
    assert back_up("postgresql+asyncpg://user:pw@host/db") is None


def test_a_relative_sqlite_path_resolves_next_to_the_backend(blank):
    resolved = sqlite_path("sqlite+aiosqlite:///./mistake_bank.db")

    assert resolved is not None and resolved.is_absolute()
    assert resolved.parent.name == "backend"


def test_the_migration_can_be_rolled_back(blank):
    upgrade()
    assert tables(blank)

    command.downgrade(_config(), "base")

    assert tables(blank) == set()


def test_old_sections_become_readable_subjects(blank):
    """A bank logged under the closed enum keeps its questions, under real names."""
    command.upgrade(_config(), "a59cdac11524")
    db = sqlite3.connect(blank)
    try:
        db.execute(
            "INSERT INTO mistakes (id, user_id, created_at, section, question_text, your_answer,"
            " correct_answer, analysis_status, urgency_is_yours, error_type)"
            " VALUES ('m1', 'local', '2026-09-01 00:00:00', 'math', 'q', '1', '2', 'ready', 0,"
            " 'careless_arithmetic'),"
            " ('m2', 'local', '2026-09-01 00:00:00', 'reading_writing', 'q', 'a', 'b', 'ready',"
            " 0, 'evidence_misread'),"
            " ('m3', 'local', '2026-09-01 00:00:00', 'reading_writing', 'q', 'a', 'b', 'ready',"
            " 0, 'grammar_rule_gap')"
        )
        db.execute(
            "INSERT INTO concepts (id, user_id, created_at, title, section)"
            " VALUES ('c1', 'local', '2026-09-01 00:00:00', 't', 'math'),"
            " ('c2', 'local', '2026-09-01 00:00:00', 't', NULL)"
        )
        db.commit()
    finally:
        db.close()

    upgrade()

    db = sqlite3.connect(blank)
    try:
        mistakes = dict(db.execute("SELECT id, subject FROM mistakes ORDER BY id"))
        concepts = dict(db.execute("SELECT id, subject FROM concepts ORDER BY id"))
    finally:
        db.close()

    assert mistakes == {"m1": "Math", "m2": "Reading & Writing", "m3": "Reading & Writing"}
    # The old reading-and-writing error slots were remapped here too, but
    # `error_type` has since been dropped with the rest of the review
    # machinery, so at HEAD there is no column left to read it out of.
    assert concepts == {"c1": "Math", "c2": None}
    assert "section" not in columns(blank, "mistakes")
    assert "section" not in columns(blank, "concepts")
