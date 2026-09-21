from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

# Set before anything imports app.config, so no developer's real .env can point the
# test suite at a live database or a paid analyzer.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./__test__.db"
os.environ["AI_PROVIDER"] = "stub"


@pytest.fixture
async def app_env(tmp_path, monkeypatch):
    """A fresh database file and fresh module-level caches for each test."""
    from app import config, db
    from app.analysis import get_analyzer

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("AI_PROVIDER", "stub")
    config.get_settings.cache_clear()
    get_analyzer.cache_clear()
    db._engine = None
    db._sessionmaker = None

    await db.create_all()
    yield db

    await db.get_engine().dispose()
    config.get_settings.cache_clear()
    get_analyzer.cache_clear()
    db._engine = None
    db._sessionmaker = None


@pytest.fixture
async def client(app_env):
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def session_factory(app_env):
    return app_env.get_sessionmaker()


# Two subjects, so a filter has something to separate. Subjects are free text; the
# capitalisation here is the one the bank should hand back.
MATH_MISTAKE = {
    "subject": "Math",
    "source": "Practice Test 4",
    "question_text": "If 3x + 7 = 22, what is the value of x?",
    "choices": ["3", "5", "7", "15"],
    "correct_answer": "5",
    "student_note": "I subtracted wrong under time pressure.",
}

BIOLOGY_MISTAKE = {
    "subject": "Biology",
    "question_text": "Which organelle is the site of cellular respiration?",
    "choices": ["Ribosome", "Mitochondrion", "Chloroplast", "Nucleus"],
    "correct_answer": "Mitochondrion",
}


async def add_question(session_factory, payload: dict, user_id: str = "local", **overrides) -> str:
    """Put a question straight into the bank, and hand back its id.

    There is no endpoint that creates one any more - questions arrive through
    `POST /capture` + `/capture/commit`, which is a lot of ceremony when a test
    only needs a row to filter on. Driving capture for setup would also couple
    every one of those tests to whatever the offline extractor happens to make of
    the text, which is not what they are about.
    """
    from app.filing import ensure_subject, file_into, resolve_folder
    from app.models import Mistake, new_id, utcnow

    fields = {**payload, **overrides}
    folder_id = fields.pop("folder_id", None)
    concept_ids = fields.pop("concept_ids", None) or []

    async with session_factory() as session:
        mistake = Mistake(id=new_id(), user_id=user_id, created_at=utcnow(), **fields)
        mistake.concepts = []
        mistake.images = []
        # Through `filing`, not by setting the column: the folder is authoritative
        # and `subject` is its name, and a test that set both by hand would be
        # asserting against a pairing the app itself can never produce.
        folder = await resolve_folder(session, user_id, folder_id)
        if folder is not None:
            file_into(mistake, folder)
        else:
            await ensure_subject(session, user_id, mistake.subject)
        if concept_ids:
            from sqlalchemy import select

            from app.models import Concept

            found = await session.scalars(
                select(Concept).where(Concept.id.in_(concept_ids), Concept.user_id == user_id)
            )
            mistake.concepts = list(found)
        session.add(mistake)
        await session.commit()
        return mistake.id
